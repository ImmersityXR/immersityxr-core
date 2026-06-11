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

// Session state persistence: periodic snapshots of each session's shared
// state (entities, scene, draw strokes) to disk, so state survives relay
// restarts and sessions that empty out, instead of living only in process
// memory.
//
//   sessions/<session_id>/state.json
//
// Snapshots are written atomically (temp file + rename) on an interval, and
// only for sessions whose state changed since the last snapshot
// (session.stateDirty). When a session is created (first client joins, or
// the relay restarted), the snapshot - if one exists and hasn't passed the
// TTL - is loaded back. Clients/sockets are never persisted; only the
// shared environment.
//
// Configure via config.persistence:
//   {
//       enabled: true,            // default true
//       path: './sessions/',      // relative to the server directory
//       snapshotIntervalMs: 10000,
//       ttlHours: 168             // expire stored state after 7 days
//   }

const fs = require('fs');
const path = require('path');

const DEFAULT_SNAPSHOT_INTERVAL_MS = 10000;
const DEFAULT_TTL_HOURS = 168;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

class SessionPersistence {
    constructor (rootDir, logger, options) {
        options = options || {};

        this.rootDir = rootDir;
        this.logger = logger;
        this.snapshotIntervalMs = options.snapshotIntervalMs || DEFAULT_SNAPSHOT_INTERVAL_MS;
        this.ttlMs = (options.ttlHours || DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
        this.snapshotTimer = null;
        this.purgeTimer = null;

        fs.mkdirSync(this.rootDir, { recursive: true });
    }

    statePath (session_id) {
        return path.join(this.rootDir, session_id.toString(), 'state.json');
    }

    // Periodically snapshot every dirty session in the given Map.
    start (sessions) {
        this.purgeExpired();

        this.snapshotTimer = setInterval(() => {
            sessions.forEach((session) => {
                if (session.stateDirty) {
                    this.snapshot(session);
                }
            });
        }, this.snapshotIntervalMs);

        this.purgeTimer = setInterval(() => this.purgeExpired(), PURGE_INTERVAL_MS);

        // don't keep the process alive just for persistence timers
        if (this.snapshotTimer.unref) this.snapshotTimer.unref();
        if (this.purgeTimer.unref) this.purgeTimer.unref();
    }

    stop () {
        clearInterval(this.snapshotTimer);
        clearInterval(this.purgeTimer);
    }

    // Atomically write the session's shared state to disk.
    snapshot (session) {
        const target = this.statePath(session.id);

        const tmp = target + '.tmp';

        const state = {
            version: 1,
            session_id: session.id,
            savedAt: Date.now(),
            entities: session.entities || [],
            scene: session.scene || null,
            strokes: session.strokes || {},
            strokeOrder: session.strokeOrder || 0
        };

        try {
            fs.mkdirSync(path.dirname(target), { recursive: true });

            fs.writeFileSync(tmp, JSON.stringify(state));

            fs.renameSync(tmp, target);

            session.stateDirty = false;
        } catch (e) {
            if (this.logger) this.logger.error(`Session ${session.id}: error writing state snapshot: ${e}`);
        }
    }

    // Load a stored snapshot, or null if none exists or it has expired.
    loadSnapshot (session_id) {
        const target = this.statePath(session_id);

        let state;

        try {
            state = JSON.parse(fs.readFileSync(target, 'utf8'));
        } catch (e) {
            return null; // no snapshot (or unreadable - treat as absent)
        }

        if (!state.savedAt || Date.now() - state.savedAt > this.ttlMs) {
            try {
                fs.rmSync(path.dirname(target), { recursive: true, force: true });
            } catch (e) { /* best effort */ }

            return null;
        }

        if (this.logger) this.logger.info(`Session ${session_id}: restored state snapshot from ${new Date(state.savedAt).toISOString()} (${(state.entities || []).length} entities, ${Object.keys(state.strokes || {}).length} strokes)`);

        return state;
    }

    // Remove stored state older than the TTL.
    purgeExpired () {
        let sessionDirs;

        try {
            sessionDirs = fs.readdirSync(this.rootDir, { withFileTypes: true });
        } catch (e) {
            return;
        }

        sessionDirs.forEach((dir) => {
            if (!dir.isDirectory()) {
                return;
            }

            const target = path.join(this.rootDir, dir.name, 'state.json');

            try {
                const state = JSON.parse(fs.readFileSync(target, 'utf8'));

                if (!state.savedAt || Date.now() - state.savedAt > this.ttlMs) {
                    fs.rmSync(path.join(this.rootDir, dir.name), { recursive: true, force: true });

                    if (this.logger) this.logger.info(`Session ${dir.name}: purged expired state snapshot`);
                }
            } catch (e) {
                // unreadable snapshot - leave it for manual inspection
            }
        });
    }
}

module.exports = SessionPersistence;
