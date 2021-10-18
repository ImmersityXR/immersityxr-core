// University of Illinois/NCSA
// Open Source License
// http://otm.illinois.edu/disclose-protect/illinois-open-source-license

// Copyright (c) 2020 Grainger Engineering Library Information Center.  All rights reserved.

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

/* jshint esversion: 6 */

require('./session.js');

require('./socket-activity-monitor.js');

class SocketRepairCenter {
    constructor(minRepairWaitTime, sessionManager, socketIOActionManager, socketActivityMonitor, logger) {
        this.minRepairWaitTime = minRepairWaitTime;

        this.sessionManager = sessionManager;

        this.socketIOActionManager = socketIOActionManager;

        this.socketActivityMonitor = socketActivityMonitor;

        this.logger = logger;

        this.sockets = new Map(); // socket IDs -> sockets
    }

    // Accept a new socket needing to be repaired.
    add (socket) {
        this.sockets.set(socket.id, socket);
    }

    // Set the socket free, to be with the session manager.
    remove (socket) {
        this.sockets.delete(socket);
    }

    hasSocket (socket) {
        return this.sockets.has(socket.id);
    }

    repairEligibleSockets () {
        for (let [id, socket] of this.sockets.entries()) {
            let deltaTime = this.socketActivityMonitor.getDeltaTime(id);

            if (deltaTime > minRepairWaitTime) {
                this.logger.logInfoSessionClientSocketAction(session_id, client_id, id, `Repairing...`);

                this.sessionManager.repair(socket, session_id, client_id);

                this.remove(socket);
            }
        }
    }
}

module.exports = SocketRepairCenter;