// University of Illinois/NCSA
// Open Source License
// http://otm.illinois.edu/disclose-protect/illinois-open-source-license

// Copyright (c) 2026 Grainger Engineering Library Information Center.  All rights reserved.

// Developed by: IDEA Lab
//               Grainger Engineering Library Information Center - University of Illinois Urbana-Champaign
//               https://library.illinois.edu/enx

// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal with
// the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
// of the Software, and to permit persons to whom the Software is furnished to
// do so, subject to the following conditions:
// * Redistributions of source code must retain the above copyright notice,
//   this list of conditions and the following disclaimers.
// * Redistributions in binary form must reproduce the above copyright notice,
//   this list of conditions and the following disclaimers in the documentation
//   and/or other materials provided with the distribution.
// * Neither the names of IDEA Lab, Grainger Engineering Library Information Center,
//   nor the names of its contributors may be used to endorse or promote products
//   derived from this Software without specific prior written permission.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
// CONTRIBUTORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS WITH THE
// SOFTWARE.

/* jshint esversion: 8 */

// Durable, streaming session-capture writer.
//
// Replaces the previous capture strategy, which accumulated every recorded
// message in process memory for the whole recording and wrote a single JSON
// file only when recording was stopped via the UI - so a crash, network
// disruption, or server restart mid-recording lost the entire capture, and
// memory grew without bound at 90 messages/second per client.
//
// This writer streams messages to disk as they arrive:
//
//   captures/<session_id>/<recording_start>/
//     data.ndjson     one JSON message per line, appended continuously
//     manifest.json   { capture_id, session_id, start, status, ... }
//
// Messages are buffered briefly (default: flushed every 500 ms or every 200
// messages, whichever comes first), so a hard crash costs at most the last
// flush interval. NDJSON survives torn final lines (skip any line that fails
// to parse) and loads directly into analysis tools:
//
//   pandas:  pd.read_json('data.ndjson', lines=True)
//   jq:      jq -s '.' data.ndjson
//
// The manifest records lifecycle: 'recording' while in progress, 'complete'
// on clean stop. On startup, finalizeOrphans() marks any capture left in
// 'recording' state (crash, power loss, redeploy) as 'interrupted' - the
// data lines flushed before the disruption remain fully usable.

const fs = require('fs');
const path = require('path');

const DEFAULT_FLUSH_INTERVAL_MS = 500;
const DEFAULT_MAX_BUFFERED_MESSAGES = 200;

class CaptureWriter {
    constructor (captureDir, captureId, sessionId, recordingStart, logger, options) {
        options = options || {};

        this.captureDir = captureDir;
        this.captureId = captureId;
        this.sessionId = sessionId;
        this.recordingStart = recordingStart;
        this.logger = logger;
        this.messageCount = 0;
        this.buffer = [];
        this.ended = false;
        this.maxBufferedMessages = options.maxBufferedMessages || DEFAULT_MAX_BUFFERED_MESSAGES;

        fs.mkdirSync(this.captureDir, { recursive: true });

        this.dataPath = path.join(this.captureDir, 'data.ndjson');
        this.manifestPath = path.join(this.captureDir, 'manifest.json');

        this.stream = fs.createWriteStream(this.dataPath, { flags: 'a' });

        this.stream.on('error', (e) => {
            if (this.logger) this.logger.error(`Capture ${this.captureId}: write stream error: ${e}`);
        });

        this.writeManifest({
            capture_id: this.captureId,
            session_id: this.sessionId,
            start: this.recordingStart,
            status: 'recording',
            format: 'ndjson',
            format_version: 1
        });

        this.flushTimer = setInterval(() => this.flush(), options.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS);

        // don't keep the process alive just for the flush timer
        if (this.flushTimer.unref) this.flushTimer.unref();
    }

    writeManifest (manifest) {
        try {
            fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
        } catch (e) {
            if (this.logger) this.logger.error(`Capture ${this.captureId}: error writing manifest: ${e}`);
        }
    }

    record (message) {
        if (this.ended) {
            return;
        }

        let line;

        try {
            line = JSON.stringify(message);
        } catch (e) {
            if (this.logger) this.logger.warn(`Capture ${this.captureId}: dropping unserializable message: ${e}`);

            return;
        }

        this.buffer.push(line);

        this.messageCount += 1;

        if (this.buffer.length >= this.maxBufferedMessages) {
            this.flush();
        }
    }

    flush () {
        if (this.buffer.length === 0) {
            return;
        }

        const chunk = this.buffer.join('\n') + '\n';

        this.buffer = [];

        this.stream.write(chunk);
    }

    // Flush remaining messages, close the stream, and mark the capture complete.
    end (callback) {
        if (this.ended) {
            if (callback) callback();

            return;
        }

        this.ended = true;

        clearInterval(this.flushTimer);

        this.flush();

        this.stream.end(() => {
            this.writeManifest({
                capture_id: this.captureId,
                session_id: this.sessionId,
                start: this.recordingStart,
                end: Date.now(),
                status: 'complete',
                format: 'ndjson',
                format_version: 1,
                message_count: this.messageCount
            });

            if (this.logger) this.logger.info(`Capture ${this.captureId}: completed with ${this.messageCount} messages`);

            if (callback) callback();
        });
    }
}

// Scan the captures directory for recordings that were never cleanly ended
// (server crash, power loss, redeploy mid-recording) and finalize their
// manifests as 'interrupted'. The streamed data lines are already on disk
// and remain fully usable. Returns the number of captures finalized.
CaptureWriter.finalizeOrphans = function (capturesRoot, logger) {
    let finalized = 0;

    let sessionDirs;

    try {
        sessionDirs = fs.readdirSync(capturesRoot, { withFileTypes: true });
    } catch (e) {
        return 0; // no captures directory yet
    }

    sessionDirs.forEach((sessionDir) => {
        if (!sessionDir.isDirectory()) {
            return;
        }

        const sessionPath = path.join(capturesRoot, sessionDir.name);

        let startDirs;

        try {
            startDirs = fs.readdirSync(sessionPath, { withFileTypes: true });
        } catch (e) {
            return;
        }

        startDirs.forEach((startDir) => {
            if (!startDir.isDirectory()) {
                return;
            }

            const captureDir = path.join(sessionPath, startDir.name);

            const manifestPath = path.join(captureDir, 'manifest.json');

            let manifest;

            try {
                manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            } catch (e) {
                return; // no manifest (e.g. a legacy capture) - leave it alone
            }

            if (manifest.status !== 'recording') {
                return;
            }

            const dataPath = path.join(captureDir, 'data.ndjson');

            let messageCount = 0;

            let endTime = Date.now();

            try {
                const stat = fs.statSync(dataPath);

                endTime = Math.round(stat.mtimeMs);

                const contents = fs.readFileSync(dataPath, 'utf8');

                messageCount = contents.split('\n').filter(line => line.length > 0).length;
            } catch (e) {
                // no data file; finalize with zero messages
            }

            manifest.status = 'interrupted';

            manifest.end = endTime;

            manifest.message_count = messageCount;

            try {
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

                finalized += 1;

                if (logger) logger.warn(`Capture ${manifest.capture_id}: finalized interrupted recording with ${messageCount} recovered messages`);
            } catch (e) {
                if (logger) logger.error(`Capture ${manifest.capture_id}: error finalizing interrupted recording: ${e}`);
            }
        });
    });

    return finalized;
};

module.exports = CaptureWriter;
