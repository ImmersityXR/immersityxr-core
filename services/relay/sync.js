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

// configuration
const config = require('./config');

const fs = require('fs');

const path = require('path');

const mysql = require('mysql');

// consts
const CAPTURE_PATH = './captures/';
        
const POS_FIELDS = 14;
const POS_BYTES_PER_FIELD = 4;
const POS_CHUNK_SIZE = POS_FIELDS * POS_BYTES_PER_FIELD;

const INT_FIELDS = 7;
const INT_BYTES_PER_FIELD = 4;
const INT_CHUNK_SIZE = INT_FIELDS * INT_BYTES_PER_FIELD;

// write buffers are multiples of corresponding chunks
const POS_WRITE_BUFFER_SIZE = 10000 * POS_CHUNK_SIZE;
const INT_WRITE_BUFFER_SIZE = 128 * INT_CHUNK_SIZE;

module.exports = {

    logInfoSessionClientSocketAction: function (socket_id, session_id, client_id, action) {
        if (session_id == null) {
            session_id = "n/a";
        }

        if (client_id == null) {
            client_id = "n/a";
        }

        if (socket_id == null) {
            socket_id = "n/a";
        }

        if (action == null) {
            action = "n/a";
        }

        this.logger.info(`${socket_id}    ${session_id}  ${client_id}    ${action}`);
    },
    
    // generate formatted path for session capture files
    getCapturePath: function (session_id, start, type) {
        return path.join(__dirname, CAPTURE_PATH, session_id.toString(), start.toString(), type);
    },

    start_recording: function (pool, session_id) {// TODO(rob): require client id and token
        if (session_id) {
            let session = this.sessions.get(session_id);
            if (session && !session.isRecording) {
                session.isRecording = true;
                session.recordingStart = Date.now();
                let path = this.getCapturePath(session_id, session.recordingStart, '');
                fs.mkdir(path, { recursive: true }, (err) => {
                    if(err) this.logger.warn(`Error creating capture path: ${err}`);
                });
                let capture_id = session_id+'_'+session.recordingStart;
                pool.query(
                    "INSERT INTO captures(capture_id, session_id, start) VALUES(?, ?, ?)", [capture_id, session_id, session.recordingStart],
                    (err, res) => {
                        if (err != undefined) {
                            this.logger.error(`Error writing recording start event to database: ${err} ${res}`);
                        }
                    }
                );
                this.logger.info(`Capture started: ${session_id}`);
            } else if (session && session.isRecording) {
                this.logger.warn(`Requested session capture, but session is already recording: ${session_id}`);
            } else {
                this.logger.warn(`Error starting capture for session: ${session_id}`);
            }
        }
    }, 

    // define end_recording event handler, use on socket event as well as on server cleanup for empty sessions
    end_recording: function (pool, session_id) {
        if (session_id) {
            let session = this.sessions.get(session_id);
            if (session && session.isRecording) {
                session.isRecording = false;
                this.logger.info(`Capture ended: ${session_id}`);                
                // write out the buffers if not empty, but only up to where the cursor is

                let pos_writer = session.writers.pos;
                if (pos_writer.cursor > 0) {
                    let path = this.getCapturePath(session_id, session.recordingStart, 'pos');
                    let wstream = fs.createWriteStream(path, { flags: 'a' });
                    wstream.write(pos_writer.buffer.slice(0, pos_writer.cursor));
                    wstream.close();
                    pos_writer.cursor = 0;
                }
                let int_writer = session.writers.int;
                if (int_writer.cursor > 0) {
                    let path = this.getCapturePath(session_id, session.recordingStart, 'int');
                    let wstream = fs.createWriteStream(path, { flags: 'a' });
                    wstream.write(int_writer.buffer.slice(0, int_writer.cursor));
                    wstream.close();
                    int_writer.cursor = 0;
                }
                
                // write the capture end event to database
                if (pool) {
                    let capture_id = session_id+'_'+session.recordingStart;
                    pool.query(
                        "UPDATE captures SET end = ? WHERE capture_id = ?", [Date.now(), capture_id],
                        (err, res) => {
                            if (err != undefined) {
                                this.logger.error(`Error writing recording end event to database: ${err} ${res}`);
                            }
                        }
                    );
                }

            } else if (session && !session.isRecording) {
                this.logger.warn(`Requested to end session capture, but capture is already ended: ${session_id}`);
            } else {
                this.logger.warn(`Error ending capture for session: ${session_id}`);
            }
        }
    },

    record_message_data: function (data) {
        if (!data) {
            this.logger.error("data was null");
            return;
        }

        let session_id = data.session_id;

        if (!session_id) {
            this.logger.error("session_id was null");
            return;
        }
        
        let client_id = data.client_id;

        if (!client_id) {
            this.logger.error("client_id was null");
            return;
        }

        // TODO(rob): message data recording
        // let session = this.sessions.get(session_id);
        // // write to file
        // if (session.isRecording) {
        //     // calculate and write session sequence number
        //     let sessionSeq =  data.message.ts - session.recordingStart; // TODO(rob): what is the actual layout for message data? 
            
        //     // get reference to session writer (buffer and cursor)
        //     let writer = session.writers.int;

        //     if (INT_CHUNK_SIZE + writer.cursor > writer.buffer.byteLength) {
        //         // if buffer is full, dump to disk and reset the cursor
        //         let path = this.getCapturePath(session_id, session.recordingStart, 'int');
        //         let wstream = fs.createWriteStream(path, { flags: 'a' });
        //         wstream.write(writer.buffer.slice(0, writer.cursor));
        //         wstream.close();
        //         writer.cursor = 0;
        //     }
        //     for (let i = 0; i < data.length; i++) {
        //         writer.buffer.writeInt32LE(data[i], (i*INT_BYTES_PER_FIELD) + writer.cursor);
        //     }
        //     writer.cursor += INT_CHUNK_SIZE;
        // }
    },

    handlePlayback: function (io, data) {
        // TODO(rob): need to use playback object to track seq and group by playback_id, 
        // so users can request to pause playback, maybe rewind?
        this.logger.info(`Playback request: ${data.playback_id}`);
        let client_id = data.client_id;
        let session_id = data.session_id;
        let playback_id = data.playback_id;

        let capture_id = null;
        let start = null;

        if (client_id && session_id && playback_id) {
            capture_id = playback_id.split('_')[0];
            start = playback_id.split('_')[1];
            // TODO(rob): check that this client has permission to playback this session
        } else {
            console.log("Invalid playback request:", data);
            return;
        }

        // Everything looks good, getting ref to session. 
        let session = this.sessions.get(session_id);
    
        // playback sequence counter
        let current_seq = 0;
        // let audioStarted = false;

        // check that all params are valid
        if (capture_id && start) {


            // TODO(rob): Mar 3 2021 -- audio playback on hold to focus on data. 
            // build audio file manifest
            // this.logger.info(`Buiding audio file manifest for capture replay: ${playback_id}`)
            // let audioManifest = [];
            // let baseAudioPath = this.getCapturePath(capture_id, start, 'audio');
            // if(fs.existsSync(baseAudioPath)) {              // TODO(rob): change this to async operation
            //     let items = fs.readdirSync(baseAudioPath);  // TODO(rob): change this to async operation
            //     items.forEach(clientDir => {
            //         let clientPath = path.join(baseAudioPath, clientDir)
            //         let files = fs.readdirSync(clientPath)  // TODO(rob): change this to async operation
            //         files.forEach(file => {
            //             let client_id = clientDir;
            //             let seq = file.split('.')[0];
            //             let audioFilePath = path.join(clientPath, file);
            //             let item = {
            //                 seq: seq,
            //                 client_id: client_id,
            //                 path: audioFilePath,
            //                 data: null
            //             }
            //             audioManifest.push(item);
            //         });
            //     });
            // }

            // // emit audio manifest to connected clients
            // io.of('chat').to(session_id.toString()).emit('playbackAudioManifest', audioManifest);

            // // stream all audio files for caching and playback by client
            // audioManifest.forEach((file) => {
            //     fs.readFile(file.path, (err, data) => {
            //         file.data = data;
            //         if(err) this.logger.error(`Error reading audio file: ${file.path}`);
            //         // console.log('emitting audio packet:', file);
            //         io.of('chat').to(session_id.toString()).emit('playbackAudioData', file);
            //     });
            // });


            // position streaming
            let capturePath = this.getCapturePath(capture_id, start, 'pos');
            let stream = fs.createReadStream(capturePath, { highWaterMark: POS_CHUNK_SIZE });

            // set actual playback start time
            let playbackStart = Date.now();

            // position data emit loop
            stream.on('data', function(chunk) {

                stream.pause();

                // start data buffer loop
                let buff = Buffer.from(chunk);
                let farr = new Float32Array(chunk.byteLength / 4);
                for (var i = 0; i < farr.length; i++) {
                    farr[i] = buff.readFloatLE(i * 4);
                }
                var arr = Array.from(farr);

                let timer = setInterval( () => {
                    current_seq = Date.now() - playbackStart;

                    // console.log(`=== POS === current seq ${current_seq}; arr seq ${arr[POS_FIELDS-1]}`);

                    if (arr[POS_FIELDS-1] <= current_seq) {
                        // alias client and entity id with prefix if entity type is not an asset
                        if (arr[4] != 3) {
                            arr[2] = 90000 + arr[2];
                            arr[3] = 90000 + arr[3];
                        }
                        // if (!audioStarted) {
                        //     // HACK(rob): trigger clients to begin playing buffered audio 
                        //     audioStarted = true;
                        //     io.of('chat').to(session_id.toString()).emit('startPlaybackAudio');
                        // }
                        io.to(session_id.toString()).emit('relayUpdate', arr);
                        stream.resume();
                        clearInterval(timer);
                    }
                }, 1);
            });

            stream.on('error', function(err) {
                this.logger.error(`Error creating position playback stream for ${playback_id} ${start}: ${err}`);
                io.to(session_id.toString()).emit('playbackEnd');
            });

            stream.on('end', function() {
                this.logger.info(`End of pos data for playback session: ${session_id}`);
                io.to(session_id.toString()).emit('playbackEnd');
            });

            // interaction streaming
            let ipath = this.getCapturePath(capture_id, start, 'int');
            let istream = fs.createReadStream(ipath, { highWaterMark: INT_CHUNK_SIZE });

            istream.on('data', function(chunk) {
                istream.pause();

                let buff = Buffer.from(chunk);
                let farr = new Int32Array(chunk.byteLength / 4);
                for (var i = 0; i < farr.length; i++) {
                    farr[i] = buff.readInt32LE(i * 4);
                }
                var arr = Array.from(farr);

                let timer = setInterval( () => {

                    // console.log(`=== INT === current seq ${current_seq}; arr seq ${arr[INT_FIELDS-1]}`);

                    if (arr[INT_FIELDS-1] <= current_seq) {
                        io.to(session_id.toString()).emit('interactionUpdate', arr);
                        istream.resume();
                        clearInterval(timer);
                    }
                }, 1);

            });

            istream.on('error', function(err) {
                this.logger.error(`Error creating interaction playback stream for session ${session_id}: ${err}`);
                io.to(session_id.toString()).emit('interactionpPlaybackEnd');
            });

            istream.on('end', function() {
                this.logger.info(`End of int data for playback session: ${session_id}`);
                io.to(session_id.toString()).emit('interactionPlaybackEnd');
            });
        }
    },

    isValidRelayPacket: function (data) {

        let session_id = data[1];

        let client_id = data[2];
        
        if (session_id && client_id) 
        {  

            let session = this.sessions.get(session_id);

            if (!session) {
                return;
            }

            // check if the incoming packet is from a client who is valid for this session

            for (let i = 0; i < session.clients.length; i += 1) {

                if (client_id == session.clients[i]) {

                    return true;
                }
            }

            return false;
        }
    },

    writeRecordedRelayData: function (data) {

        if (!data) {

            logger.error(`data was null`);

            return;
        }

        let session_id = data[1];

        let session = this.sessions.get(session_id);

        if (!session) {

            logger.error(`session was null or data was null`);

            return;
        }

        if (!session.isRecording) {
            return;
        }

        // calculate and write session sequence number using client timestamp
        data[POS_FIELDS-1] = data[POS_FIELDS-1] - session.recordingStart;

        // get reference to session writer (buffer and cursor)
        let writer = session.writers.pos;

        if (POS_CHUNK_SIZE + writer.cursor > writer.buffer.byteLength) {

            // if buffer is full, dump to disk and reset the cursor
            let path = this.getCapturePath(session_id, session.recordingStart, 'pos');

            let wstream = fs.createWriteStream(path, { flags: 'a' });

            wstream.write(writer.buffer.slice(0, writer.cursor));

            wstream.close();

            writer.cursor = 0;
        }

        for (let i = 0; i < data.length; i++) {

            writer.buffer.writeFloatLE(data[i], (i*POS_BYTES_PER_FIELD) + writer.cursor);
        }

        writer.cursor += POS_CHUNK_SIZE;
    },

    updateSessionState: function (data) {

        if (!data) {

            logger.error(`data was null`);

            return;
        }

        let session_id = data[1];

        let session = this.sessions.get(session_id);

        if (!session) {

            logger.error(`session was null`);

            return;
        }

        // update session state with latest entity positions
        let entity_type = data[4];

        if (entity_type == 3) {

            let entity_id = data[3];

            let i = session.entities.findIndex(e => e.id == entity_id);

            if (i != -1) {

                session.entities[i].latest = data;

            } else {

                let entity = {

                    id: entity_id,
                    latest: data,
                    render: true,
                    locked: false
                };

                session.entities.push(entity);
            }
        }
    },

    handleInteraction: function (socket, data) {
        // interaction event values
        const INTERACTION_LOOK          = 0;
        const INTERACTION_LOOK_END      = 1;
        const INTERACTION_RENDER        = 2;
        const INTERACTION_RENDER_END    = 3;
        const INTERACTION_GRAB          = 4;
        const INTERACTION_GRAB_END      = 5;
        const INTERACTION_SCENE_CHANGE  = 6;
        const INTERACTION_UNSET         = 7; // NOTE(rob): this value is currently unused. 2020-12-1
        const INTERACTION_LOCK          = 8;
        const INTERACTION_LOCK_END      = 9;

        let session_id = data[1];
        let client_id = data[2];

        if (session_id && client_id) {
            // relay interaction events to all connected clients
            socket.to(session_id.toString()).emit('interactionUpdate', data);

            // do session state update if needed
            let source_id = data[3];
            let target_id = data[4];
            let interaction_type = data[5];
            let session = this.sessions.get(session_id);
            if (!session) return;

            // check if the incoming packet is from a client who is valid for this session
            let joined = false;
            for (let i=0; i < session.clients.length; i++) {
                if (client_id == session.clients[i]) {
                    joined = true;
                    break;
                }
            }

            if (!joined) return;
            
            // entity should be rendered
            if (interaction_type == INTERACTION_RENDER) {
                let i = session.entities.findIndex(e => e.id == target_id);
                if (i != -1) {
                    session.entities[i].render = true;
                } else {
                    let entity = {
                        id: target_id,
                        latest: [],
                        render: true,
                        locked: false
                    };
                    session.entities.push(entity);
                }
            }
            // entity should stop being rendered
            if (interaction_type == INTERACTION_RENDER_END) {
                let i = session.entities.findIndex(e => e.id == target_id);
                if (i != -1) {
                    session.entities[i].render = false;
                } else {
                    let entity = {
                        id: target_id,
                        latest: data,
                        render: false,
                        locked: false
                    };
                    session.entities.push(entity);
                }
            }
            // scene has changed
            if (interaction_type == INTERACTION_SCENE_CHANGE) {
                session.scene = target_id;
            }
            // entity is locked
            if (interaction_type == INTERACTION_LOCK) {
                let i = session.entities.findIndex(e => e.id == target_id);
                if (i != -1) {
                    session.entities[i].locked = true;
                } else {
                    let entity = {
                        id: target_id,
                        latest: [],
                        render: false,
                        locked: true
                    };
                    session.entities.push(entity);
                }
            }
            // entity is unlocked
            if (interaction_type == INTERACTION_LOCK_END) {
                let i = session.entities.findIndex(e => e.id == target_id);
                if (i != -1) {
                    session.entities[i].locked = false;
                } else {
                    let entity = {
                        id: target_id,
                        latest: [],
                        render: false,
                        locked: false
                    };
                    session.entities.push(entity);
                }
            }

            // write to file as binary data
            if (session.isRecording) {
                
                // calculate and write session sequence number
                data[INT_FIELDS-1] = data[INT_FIELDS-1] - session.recordingStart;
                
                // get reference to session writer (buffer and cursor)
                let writer = session.writers.int;

                if (INT_CHUNK_SIZE + writer.cursor > writer.buffer.byteLength) {
                    // if buffer is full, dump to disk and reset the cursor
                    let path = this.getCapturePath(session_id, session.recordingStart, 'int');
                    let wstream = fs.createWriteStream(path, { flags: 'a' });
                    wstream.write(writer.buffer.slice(0, writer.cursor));
                    wstream.close();
                    writer.cursor = 0;
                }
                for (let i = 0; i < data.length; i++) {
                    writer.buffer.writeInt32LE(data[i], (i*INT_BYTES_PER_FIELD) + writer.cursor);
                }
                writer.cursor += INT_CHUNK_SIZE;
            }
        }
    },

    handleState: function (_io, data) {

        if (!data) {
            
            logger.error(`data was null`);

            return null;
        }
            
        let session_id = data.session_id;
            
        let client_id = data.client_id;
            
        if (!session_id || !client_id) {

            logger.error(`session_id or client_id was null`);

            return null;
        }
        
        let version = data.version;

        let session = this.sessions.get(session_id);

        if (!session) {

            logger.error(`session was null`);

            return null;
        }

        let state = {};

        // check requested api version
        if (version === 2) {

            state = {

                clients: session.clients,
                entities: session.entities,
                scene: session.scene,
                isRecording: session.isRecording
            };

        } else { // version 1 or no api version indicated

            let entities = [];

            let locked = [];

            for (let i = 0; i < session.entities.length; i++) {

                entities.push(session.entities[i].id);

                if (session.entities[i].locked) {

                    locked.push(session.entities[i].id);
                }
            }

            state = {
                
                clients: session.clients,
                entities: entities,
                locked: locked,
                scene: session.scene,
                isRecording: session.isRecording
            };
        }

        return { session_id, state };
    },
    
    addClientToSession: function (session_id, client_id) {

        let session = this.sessions.get(session_id);

        if (session == null) {

            this.logger.error("session was null");
        }

        if (session.clients == null || session.clients.length == 0) {

            session.clients = [client_id];
        }

        session.clients.push(client_id);
    },

    removeDuplicateClientsFromSession: function (session_id, client_id) {

        let session = this.sessions.get(session_id);

        if (session == null) {

            this.logger.error("session was null");
        }

        if (session.clients == null || session.clients.length == 0) {

            session.clients = [client_id];
        }

        const first_instance = session.clients.indexOf(client_id);

        for (let i = 0; i < session.clients.length; i += 1) {

            if (session.clients[i] != first_instance && session.clients[i] == client_id) {

                session.clients.splice(i, 1);

            }
        }
    },

    removeClientFromSession: function (session_id, client_id) {

        let session = this.sessions.get(session_id);

        if (session == null) {
            this.logger.error("session was null");
            return;
        }

        if (session.clients == null) {
            this.logger.error("session.clients was null");
            return;
        }

        let index = session.clients.indexOf(client_id);

        if (session.clients.length == 0 || session.clients.indexOf(client_id) == -1) {
            //client_id is not in the array, so we don't need to remove it.
            this.logger.warn(`Tried removing client ${client_id} from session.clients, but it was not there. Proceeding anyways.`);
            return; 
        }

        session.clients.splice(index, 1);
    },

    joinSocketToSession: function (err, socket, session_id, client_id, do_bump_duplicates) {

        if (err) {

            this.logger.error(`Error joining client ${client_id} to session ${session_id}: ${err}`);

            return false;
        }

        let session = this.getOrCreateSession(session_id);

        this.addClientToSession(session_id, client_id);

        this.bumpDuplicateSockets(session_id, client_id, do_bump_duplicates, socket.id);

        // socket to client mapping
        session.sockets[socket.id] = { client_id: client_id, socket: socket };

        this.joinSessionAction(session_id, client_id);

        // socket successfully joined to session
        return true;
    },

    bumpDuplicateSockets: function (session_id, client_id, do_bump_duplicates, socket_id) {
        
        if (do_bump_duplicates) {

            this.removeDuplicateClientsFromSession(session_id, client_id);

            let sockets = this.getSessionSocketsFromClientId(session_id, client_id, socket_id);

            sockets.forEach((socket) => {
            
                this.bumpAction(session_id, socket);

                this.removeSocketFromSession(socket, session_id, client_id);

                this.removeClientFromSession(session_id, client_id);

            });

            return;
        }

        let sockets = this.getSessionSocketsFromClientId(session_id, client_id, null);
            
        sockets.forEach((socket) => {
        
            this.bumpAction(session_id, socket);

            this.removeSocketFromSession(socket, session_id, client_id);

            this.removeClientFromSession(session_id, client_id);

        });
    },

    writeEventToConnections: function (event, session_id, client_id) {

        if (!this.pool) {

            this.logger.error("pool was null");

            return;
        }
        
        this.pool.query(
            "INSERT INTO connections(timestamp, session_id, client_id, event) VALUES(?, ?, ?, ?)", [Date.now(), session_id, client_id, event],

            (err, res) => {

                if (err != undefined) {

                    this.logger.error(`Error writing ${event} event to database: ${err} ${res}`);

                }
            }
        );
    },

    getSessionIdFromSession: function (session) {

        this.sessions.forEach((candidate_session, candidate_session_id, map) => {

            if (candidate_session == session) {

                session_id = candidate_session_id;
            }
        });
    },
    
    getSessionSocketsFromClientId: function (session_id, client_id, excluded_socket_id) {

        let session = this.sessions.get(session_id);

        if (session == null) {
            this.logger.error(`Could not get session sockets from client ID -- session was null.`);
        }

        if (session.sockets == null) {
            this.logger.error(`Could not get session sockets from client  -- session.sockets was null.`);
            return;
        }

        var result = [];

        for (var candidate_socket_id in session.sockets) {

            let isCorrectId = session.sockets[candidate_socket_id].client_id == client_id;

            let doExclude = candidate_socket_id == excluded_socket_id;

            if (isCorrectId && !doExclude) {

                this.logger.info(`${candidate_socket_id} - found this socket for client ${client_id}, session ${session_id}.`);

                result.push(session.sockets[candidate_socket_id].socket);
            }
        }

        return result;
    },

    getNumClientInstancesForClient: function (session_id, client_id) {

        let session = this.sessions.get(session_id);

        if (session == null || session.clients == null) {

            this.logger.error(`Could not get number of client instances -- session was null or session.clients was null.`);

            return -1;
        }

        var count = 0;

        session.clients.forEach((value) => {

            if (value == client_id) {

                count += 1;
            }
        });

        return count;
    },

    // cleanup socket and client references in session state if reconnect fails
    removeSocketFromSession: function (socket, session_id, client_id) {

        this.disconnectAction(socket, session_id, client_id);

        // clean up
        let session = this.sessions.get(session_id);

        if (!session) {
            
            logger.warn(`Could not find session ${session_id} when trying to remove a socket from it.`);

            return;
        }

        if (!(socket.id in session.sockets)) {

            this.logger.error(`tried removing ${socket.id} from session.sockets, but it was not found.`);

            return;
        }

        // remove socket->client mapping
        delete session.sockets[socket.id];

        this.logger.info(`${socket.id} (client ${client_id}) - Removed from session ${session_id}`);
        
        this.removeClientFromSession(session_id, client_id);
    },

    getNumClientInstances: function (session_id) {

        let session = this.sessions.get(session_id);

        if (!session) {

            logger.warn(`tried to clean up session ${session_id}, but it was not found.`);

            return -1;
        }

        if (session.clients == null) {
            
            logger.warn(`session ${session_id}'s session.clients was null.`);

            return -1;
        }

        return session.clients.length;
    },

    try_to_end_recording: function (session_id) {

        let session = this.sessions.get(session_id);

        if (!session) {

            logger.warn(`tried to end recording for session ${session_id}, but it was not found.`);

            return;
        }

        if (!session.isRecording) {

            return;

        }

        this.logger.info(`Stopping recording for empty session ${session_id}`);

        this.end_recording(session_id);
    },

    // clean up session from sessions map if empty, write 
    cleanUpSessionIfEmpty: function (session_id) {

        if (this.getNumClientInstancesForClient(session_id) >= 0) {

            // don't clean up if there are still clients in the session
            return;
        }

        this.logger.info(`Ending empty session ${session_id}`);

        this.try_to_end_recording(session_id);
        
        this.sessions.delete(session_id);
    },

    // if a session exists, return it. Otherwise, create one with default values, register it, and return it.
    getOrCreateSession: function (session_id) {

        let session = this.sessions.get(session_id);

        if (session) {

            return session;
        }

        this.logger.info(`Creating session: ${session_id}`);

        this.sessions.set(session_id, {
            sockets: {}, // socket.id -> client_id
            clients: [],
            entities: [],
            scene: null,
            isRecording: false,
            start: Date.now(),
            recordingStart: 0,
            seq: 0,
            writers: {
                pos: {
                    buffer: Buffer.alloc(POS_WRITE_BUFFER_SIZE),
                    cursor: 0
                },
                int: {
                    buffer: Buffer.alloc(INT_WRITE_BUFFER_SIZE),
                    cursor: 0
                }
            }
        });

        session = this.sessions.get(session_id);
        
        return session;
    },

    processReconnectionAttempt: function (err, socket, session_id, client_id) {

        let success = this.joinSocketToSession(err, socket, session_id, client_id, true);

        if (!success) { 

            this.logger.info('failed to reconnect');

            this.removeSocketFromSession(socket, session_id, client_id);

            this.cleanUpSessionIfEmpty(session_id);

            return false;
        } 

        ////TODO does this need to be called here???? this.bumpOldSockets(session_id, client_id, socket.id);

        this.logger.info('successfully reconnected');

        return true;

    },

    whoDisconnected: function (socket) {
        
        for (var s in this.sessions) {

            const session_id = s[0];

            let session = s[1];

            if (!(socket.id in session.sockets)) {

                // This isn't the right session, so keep looking.
                continue;
            }

            // We found the right session.

            return {
                session_id: session_id,

                client_id: client_id
            };
        }

        return {

            session_id: null,

            client_id: null
        };
    },

    // returns true if socket is still connected
    handleDisconnect: function (io, socket, reason) {

        // Check disconnect event reason and handle
        // see https://socket.io/docs/v2/server-api/index.html

        let knownReasons = {
            // the disconnection was initiated by the server, you need to reconnect manually
            "server namespace disconnect": {
                doReconnect: false,
            },
            // The socket was manually disconnected using socket.disconnect()
            // We don't attempt to reconnect if disconnect was called by client. 
            "client namespace disconnect": {
                doReconnect: false,
            },
            // The connection was closed (example: the user has lost connection, or the network was changed from WiFi to 4G)    
            "transport close": {
                doReconnect: false,
            },
            // The connection has encountered an error (example: the server was killed during a HTTP long-polling cycle)
            "transport error": {
                doReconnect: false,
            },
            // The server did not send a PING within the pingInterval + pingTimeout range.
            "ping timeout": {
                doReconnect: true,
            },
        };

        let doReconnectOnUnknownReason = true;

        // find which session this socket is in
        for (var s of this.sessions) {

            let session_id = s[0];

            let session = s[1];

            if (!(socket.id in session.sockets)) {

                // This isn't the right session, so keep looking.
                continue;
            }

            // We found the right session.
            
            let client_id = session.sockets[socket.id].client_id;

            if ((knownReasons.hasOwnProperty(reason) && knownReasons[reason].doReconnect) || doReconnectOnUnknownReason) {

                return this.reconnectAction(reason, socket, session_id, client_id, session); // Don't continue to check other sessions.
            }

            //Disconnect the socket

            this.logger.info(`Client was disconnected, probably because an old socket was bumped. Reason: ${reason}, session: ${session_id}, client: ${client_id}, clients: ${JSON.stringify(session.clients)}`);

            this.removeSocketFromSession(socket, session_id, client_id);

            this.cleanUpSessionIfEmpty(session_id);

            return false; // Don't continue to check other sessions.
        }

        //socket not found in our records. This will happen for komodo-unity versions v0.3.2 and below, which handle "sync" actions on the main server namespace.
        this.logger.info(`(${socket.id} - disconnected. Not found in sessions. Probably ok.)`);
    },

    createPool: function () {

        if (config.db.host && config.db.host != "") {

            return mysql.createPool(config.db);

        }
        
        this.logger.warn("Could not create MySQL Pool.");

        return null;

    },

    createCapturesDirectory: function () {

        if (!fs.existsSync(CAPTURE_PATH)) {

            this.logger.info(`Creating directory for session captures: ${CAPTURE_PATH}`);

            fs.mkdirSync(CAPTURE_PATH);
        }

    },

    getSessions: function () {
        
        return this.sessions;
    },

    init: function (io, logger) {

        this.logger = logger;

        // session state maps
        this.sessions = new Map();

        this.pool = this.createPool();

        this.createCapturesDirectory();

        let self = this;

        this.bumpAction = function (session_id, socket) {
                
            self.logger.info(`${socket.id}: leaving session ${session_id}`);

            socket.leave(session_id.toString(), (err) => {

                if (err) {

                    this.logger.error(err);

                    return;
                }
            });

            self.logger.info(`${socket.id} Disconnecting: ...`);

            setTimeout(() => {

                socket.disconnect(true);

                self.logger.info(`${socket.id} Disconnecting: Done.`);

            }, 500); // delay half a second and then bump the old socket    
        };

        this.joinSessionAction = function (session_id, client_id) {

            io.to(session_id.toString()).emit('joined', client_id);
        };

        this.disconnectAction = function (socket, session_id, client_id) {
            
            // notify and log event
            socket.to(session_id.toString()).emit('disconnected', client_id);
        };

        // returns true for successful reconnection
        this.reconnectAction = function (reason, socket, session_id, client_id, session) {
    
            self.logger.info(`Client was disconnected; attempting to reconnect. Disconnect reason: ${reason}, session: ${session_id}, client: ${client_id}, clients: ${JSON.stringify(session.clients)}`);
    
            socket.join(session_id.toString(), (err) => { 
    
                self.processReconnectionAttempt(err, socket, session_id, client_id);
            });
        };

        // main relay handler
        io.on('connection', function(socket) {

            logger.info(`Session connection: ${socket.id}.`);

            socket.on('sessionInfo', function (session_id) {

                let session = self.sessions.get(session_id);

                if (!session) {
                    self.logger.warn(`Requested session ${session_id} but it does not exist.`);
                    
                    return;
                }

                socket.to(session_id.toString()).emit('sessionInfo', session);
            });

            //Note: "join" is our own event name, and should not be confused with socket.join. (It does not automatically listen for socket.join either.)
            socket.on('join', function(data) {

                self.logger.info(`${socket.id} - Asked to join: ${data}`);

                let session_id = data[0];

                let client_id = data[1];

                if (!client_id || !session_id) {

                    self.logger.error(`client_id or session_id were null in 'join'.`);

                    return;
                }

                //TODO does this need to be called here???? self.bumpOldSockets(session_id, client_id, socket.id);

                // relay server joins connecting client to session room
                socket.join(session_id.toString(), (err) => { 

                    let success = self.joinSocketToSession(err, socket, session_id, client_id, true); 

                    if (success) {
                        
                        // write join event to database
                        self.writeEventToConnections("connect", session_id, client_id);
                    }
                });
            });

            socket.on('state', function(data) {
                
                self.logger.info(`State: ${JSON.stringify(data)}`);

                let { session_id, state } = self.handleState(io, data);

                if (!state) {

                    self.logger.warn("state was null");

                    return;
                }

                try {

                    // emit versioned state data
                    io.to(session_id).emit('state', state);

                } catch (err) {

                    throw err;

                }

            });

            socket.on('draw', function(data) {

                let session_id = data[1];

                let client_id = data[2];

                if (session_id && client_id) {

                    socket.to(session_id.toString()).emit('draw', data);

                }

            });

            // general message relay
            // TODO(rob): this is where all event data will eventually end up
            // we will be doing compares on the data.type value for to-be-defined const values
            // of the various interactions we care about, eg. grab, drop, start/end recording, etc.
            // in order to update the session state accordingly. we will probably need to protect against
            // garbage values that might be passed by devs who are overwriting reserved message events.  
            socket.on('message', function(data) {

                let session_id = data.session_id;

                let client_id = data.client_id;

                if (session_id && client_id) {

                    socket.to(session_id.toString()).emit('message', data);

                    record_message_data(data);
                }

            });

            // client position update handler
            socket.on('update', function(data) {
        
                if (!self.isValidRelayPacket(data)) {  
                    
                    return;
                }

                let session_id = data[1];

                // relay packet if client is valid
                socket.to(session_id.toString()).emit('relayUpdate', data);

                self.writeRecordedRelayData(data);

                self.updateSessionState(data);
            
            });

            // handle interaction events
            // see `INTERACTION_XXX` declarations for type values
            socket.on('interact', function(data) {

                self.handleInteraction(socket, data);
                
            });
        
            // session capture handler
            socket.on('start_recording', function (session_id) {

                self.start_recording(pool, session_id);

            });
                
            socket.on('end_recording', function (session_id) {

                self.end_recording(pool, session_id);

            });

            socket.on('playback', function(data) {

                self.handlePlayback(io, data);

            });

            socket.on('disconnect', function (reason) {

                const { session_id, client_id } = self.whoDisconnected(socket);

                let didReconnect = self.handleDisconnect(io, socket, reason);

                if (didReconnect) {

                    // log reconnect event with timestamp to db
                    self.writeEventToConnections("reconnect", session_id, client_id);

                    return;
                }

                // log reconnect event with timestamp to db
                self.writeEventToConnections("disconnect", session_id, client_id);
            });
        });
    }
};