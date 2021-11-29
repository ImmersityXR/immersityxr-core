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

var fromEntries = require('object.fromentries');

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples
function JSONStringifyCircular(obj) {
    const seen = new WeakSet();
    return JSON.stringify (obj, (key, value) => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return;
            }

            seen.add(value);
        }

        return value;
    });
}

module.exports = {
    init: function (io, logger, syncServer, chatServer) {
        var admin = io.of('/admin');

        admin.use((socket, next) => {
            //TODO(Brandon) - ADD AUTHENTICATION HERE!!! (should we use https://www.npmjs.com/package/socketio-auth ? )
            next();
        });

        admin.on('connection', function(socket) {
            //TODO finish or remove.
            // TODO(Brandon): log connection here
            socket.emit("adminInfo", socket.id);

            socket.on('getAllSessions0', function() {
                this.sessions = syncServer.sessions;

                socket.emit('receiveAllSessions0', JSONStringifyCircular(Array.from(sessions.entries())));
            });

            socket.on('sessionsClientsSockets', function() {
                // result of this function: 
                // "{
                //     <session_id>: ["<client_id> - <socket_id>", ...],
                //     23: ["1 - AKLJF698690", "2 - FKJASDFSDFDFS", ... ],
                //     ...
                // }"

                var sessionToSocketMappings = {};

                this.sessions = syncServer.sessions;

                sessions.forEach((value, session_id, map) => {
                    var session = sessions.get(session_id);

                    sessionToSocketMappings[session_id] = [];

                    for (var socket_id in session.sockets) {
                        sessionToSocketMappings[session_id].push(`${session.sockets[socket_id].client_id} - ${socket_id}`);
                    }
                });

                socket.emit('sessionsClientsSockets', JSON.stringify(sessionToSocketMappings));
            });

            socket.on('sessionsWithDetails', function () {
                this.sessions = syncServer.sessions;

                var result = fromEntries(this.sessions);

                socket.emit('sessionsWithDetails', JSONStringifyCircular(result));
            });

            socket.on('stateClientsSockets', function () {
                this.sessions = syncServer.sessions;

                var stateClientsSockets = {};

                this.sessions.forEach((session, session_id, map) => {
                    stateClientsSockets[session_id] = {};

                    stateClientsSockets[session_id].state = {
                        clients: session.clients,
                        entities: session.entities,
                        scene: session.scene,
                        isRecording: session.isRecording
                    };

                    stateClientsSockets[session_id].clientsAndSockets = [];

                    for (var socket_id in session.sockets) {
                        var client_id = session.sockets[socket_id].client_id;

                        stateClientsSockets[session_id].clientsAndSockets.push(`${client_id} - ${socket_id}`);
                    }
                });

                socket.emit('stateClientsSockets', JSON.stringify(stateClientsSockets));
            });

            socket.on('sockets', function() {
                var socks = [];

                for (var key in io.of("/").sockets) {
                    socks.push(key);
                }

                socket.emit('sockets', socks);
            });

            socket.on('socketsAndRooms', function () {
                var socketsAndRooms = {};

                var sockets = io.of("/").sockets;

                for (var socket_id in sockets) {
                    let curSocketObj = sockets[socket_id];

                    socketsAndRooms[socket_id] = [];

                    for (var room_id in curSocketObj.rooms) {
                        socketsAndRooms[socket_id].push(room_id);
                    }
                }

                socketsAndRooms.chat = Object.keys(io.of("/chat").sockets);

                socketsAndRooms.admin = Object.keys(io.of("/admin").sockets);

                socket.emit('socketsAndRooms', JSONStringifyCircular(socketsAndRooms));
            });

            socket.on('clients', function() {
                var sessionToClient = {};

                sessions.forEach((value, key, map) => {
                    var session = sessions.get(key);

                    sessionToClient[key] = session.clients;
                });

                socket.emit('clients', JSON.stringify(sessionToClient));
            });
        });

        logger.info(`Admin namespace is waiting for connections...`);

        return admin;
    }
};