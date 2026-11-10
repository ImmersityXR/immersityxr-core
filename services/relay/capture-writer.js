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

// Durable, streaming session-capture writer (capture format version 2).
//
// A capture is a directory:
//
//   captures/<session_id>/<recording_start>/
//     manifest.json   what was recorded, by whom, and its lifecycle status
//     data.ndjson     one JSON event per line, appended continuously
//
// Every line of data.ndjson is one event:
//
//   { "t": 1234, "seq": 17, "kind": "message", "client": 2, "data": { ... } }
//
//   t       ms since the capture started, on the RELAY's clock, taken when
//           the event was received. Clients' own clocks are not trusted for
//           ordering: they differ between headsets.
//   seq     per-capture counter, so events with the same t replay in the
//           order they arrived.
//   kind    "snapshot"            always the first line: the session's full
//                                 shared state when recording started, so a
//                                 recording begun mid-session is still
//                                 complete.
//           "message"             a client's `message` event; data holds
//                                 { type, message, ts } (ts = client clock).
//                                 Current clients send positions ("sync"),
//                                 interactions and drawing this way.
//           "update" "interact"   the older array-based events, as relayed.
//           "draw"
//           "joined" "left"       a client entered or left the session.
//   client  the sender's client id as the relay knows it from the socket,
//           not the id written inside the payload. null for snapshot.
//
// Events are buffered briefly (default: flushed every 500 ms or every 200
// events, whichever comes first), so a hard crash costs at most the last
// flush interval. NDJSON survives torn final lines (skip any line that fails
// to parse) and loads directly into analysis tools:
//
//   pandas:  pd.read_json('data.ndjson', lines=True)
//   jq:      jq -s '.' data.ndjson
//
// tools/export-capture.js turns a capture into CSV files.
//
// The manifest records lifecycle: 'recording' while in progress, 'complete'
// on clean stop. On startup, finalizeOrphans() marks any capture left in
// 'recording' state (crash, power loss, redeploy) as 'interrupted' - the
// data lines flushed before the disruption remain fully usable.

const fs = require('fs');
const path = require('path');

const FORMAT_VERSION = 2;
const DEFAULT_FLUSH_INTERVAL_MS = 500;
const DEFAULT_MAX_BUFFERED_EVENTS = 200;

class CaptureWriter {
    // options.manifest: extra manifest fields known at start, e.g.
    //   { entity_ids: 'import-order', started_by: 7 }
    constructor (captureDir, captureId, sessionId, recordingStart, logger, options) {
        options = options || {};

        this.captureDir = captureDir;
        this.captureId = captureId;
        this.sessionId = sessionId;
        this.recordingStart = recordingStart;
        this.logger = logger;
        this.eventCount = 0;
        this.buffer = [];
        this.ended = false;
        this.maxBufferedEvents = options.maxBufferedEvents || DEFAULT_MAX_BUFFERED_EVENTS;

        fs.mkdirSync(this.captureDir, { recursive: true });

        this.dataPath = path.join(this.captureDir, 'data.ndjson');
        this.manifestPath = path.join(this.captureDir, 'manifest.json');

        this.stream = fs.createWriteStream(this.dataPath, { flags: 'a' });

        this.stream.on('error', (e) => {
            if (this.logger) this.logger.error(`Capture ${this.captureId}: write stream error: ${e}`);
        });

        this.manifest = Object.assign({
            capture_id: this.captureId,
            session_id: this.sessionId,
            start: this.recordingStart,
            status: 'recording',
            format: 'ndjson',
            format_version: FORMAT_VERSION
        }, options.manifest || {});

        this.writeManifest();

        this.flushTimer = setInterval(() => this.flush(), options.flushIntervalMs || DEFAULT_FLUSH_INTERVAL_MS);

        // don't keep the process alive just for the flush timer
        if (this.flushTimer.unref) this.flushTimer.unref();
    }

    writeManifest () {
        try {
            fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2));
        } catch (e) {
            if (this.logger) this.logger.error(`Capture ${this.captureId}: error writing manifest: ${e}`);
        }
    }

    // Merge fields that only become known after recording starts (for
    // example the lab's asset list, fetched from the portal).
    updateManifest (fields) {
        Object.assign(this.manifest, fields);

        this.writeManifest();
    }

    // Record one event. `client` is the sender's id as the relay knows it;
    // `receivedAt` defaults to now on the relay's clock.
    recordEvent (kind, client, data, receivedAt) {
        if (this.ended) {
            return;
        }

        const event = {
            t: (receivedAt === undefined ? Date.now() : receivedAt) - this.recordingStart,
            seq: this.eventCount,
            kind: kind,
            client: client === undefined ? null : client,
            data: data
        };

        let line;

        try {
            line = JSON.stringify(event);
        } catch (e) {
            if (this.logger) this.logger.warn(`Capture ${this.captureId}: dropping unserializable ${kind} event: ${e}`);

            return;
        }

        this.buffer.push(line);

        this.eventCount += 1;

        if (this.buffer.length >= this.maxBufferedEvents) {
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

    // Flush remaining events, close the stream, and mark the capture complete.
    end (callback) {
        if (this.ended) {
            if (callback) callback();

            return;
        }

        this.ended = true;

        clearInterval(this.flushTimer);

        this.flush();

        this.stream.end(() => {
            Object.assign(this.manifest, {
                end: Date.now(),
                status: 'complete',
                event_count: this.eventCount
            });

            this.writeManifest();

            if (this.logger) this.logger.info(`Capture ${this.captureId}: completed with ${this.eventCount} events`);

            if (callback) callback();
        });
    }
}

CaptureWriter.FORMAT_VERSION = FORMAT_VERSION;

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

            let eventCount = 0;

            let endTime = Date.now();

            try {
                const stat = fs.statSync(dataPath);

                endTime = Math.round(stat.mtimeMs);

                const contents = fs.readFileSync(dataPath, 'utf8');

                eventCount = contents.split('\n').filter(line => line.length > 0).length;
            } catch (e) {
                // no data file; finalize with zero events
            }

            manifest.status = 'interrupted';

            manifest.end = endTime;

            manifest.event_count = eventCount;

            try {
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

                finalized += 1;

                if (logger) logger.warn(`Capture ${manifest.capture_id}: finalized interrupted recording with ${eventCount} recovered events`);
            } catch (e) {
                if (logger) logger.error(`Capture ${manifest.capture_id}: error finalizing interrupted recording: ${e}`);
            }
        });
    });

    return finalized;
};

module.exports = CaptureWriter;
