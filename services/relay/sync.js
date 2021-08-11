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

const util = require('util');
const { syslog } = require('winston/lib/winston/config');

// event data globals
// NOTE(rob): deprecated. 
// const POS_FIELDS            = 14;
// const POS_BYTES_PER_FIELD   = 4;
// const POS_COUNT             = 10000;
// const INT_FIELDS            = 7;
// const INT_BYTES_PER_FIELD   = 4;
// const INT_COUNT             = 128;

// interaction event values
// TODO(rob): finish deprecate.
// const INTERACTION_LOOK          = 0;
// const INTERACTION_LOOK_END      = 1;
const INTERACTION_RENDER        = 2;
const INTERACTION_RENDER_END    = 3;
// const INTERACTION_GRAB          = 4;
// const INTERACTION_GRAB_END      = 5;
const INTERACTION_SCENE_CHANGE  = 6;
// const INTERACTION_UNSET         = 7; // NOTE(rob): this value is currently unused. 2020-12-1
const INTERACTION_LOCK          = 8;
const INTERACTION_LOCK_END      = 9;

//TODO refactor this.sessions into instances of the Session object.

// Courtesy of Casey Foster on Stack Overflow
// https://stackoverflow.com/a/14368628
function compareKeys(a, b) {
    var aKeys = Object.keys(a).sort();

    var bKeys = Object.keys(b).sort();

    return JSON.stringify(aKeys) === JSON.stringify(bKeys);
}

module.exports = {
    // NOTE(rob): deprecated. sessions must use message_buffer. 
    // // write buffers are multiples of corresponding chunks
    // positionWriteBufferSize: function () {
    //     return POS_COUNT * positionChunkSize();
    // },
    
    // // write buffers are multiples of corresponding chunks
    // interactionWriteBufferSize: function () {
    //     return INT_COUNT * interactionChunkSize();
    // },

    logInfoSessionClientSocketAction: function (session_id, client_id, socket_id, action) {
        if (session_id == null) {
            session_id = "---";
        }

        session_id = `s${session_id}`;

        if (client_id == null) {
            client_id = "---";
        }

        client_id = `c${client_id}`;

        if (socket_id == null) {
            socket_id = "---.................";
        }

        if (action == null) {
            action = "---";
        }

        if (!this.logger) {
            return;
        }

        if (this.logger) this.logger.info(` ${socket_id}    ${session_id}  ${client_id}    ${action}`);
    },

    logErrorSessionClientSocketAction: function (session_id, client_id, socket_id, action) {
        if (session_id == null) {
            session_id = "---";
        }

        session_id = `s${session_id}`;

        if (client_id == null) {
            client_id = "---";
        }

        client_id = `c${client_id}`;

        if (socket_id == null) {
            socket_id = "---.................";
        }

        if (action == null) {
            action = "---";
        }

        if (!this.logger) {
            return;
        }

        if (this.logger) this.logger.error(`${socket_id}    ${session_id}  ${client_id}    ${action}`);
    },

    logWarningSessionClientSocketAction: function (session_id, client_id, socket_id, action) {
        if (session_id == null) {
            session_id = "---";
        }

        session_id = `s${session_id}`;

        if (client_id == null) {
            client_id = "---";
        }

        client_id = `c${client_id}`;

        if (socket_id == null) {
            socket_id = "---.................";
        }

        if (action == null) {
            action = "---";
        }

        if (!this.logger) {
            return;
        }

        if (this.logger) this.logger.warn(` ${socket_id}    ${session_id}  ${client_id}    ${action}`);
    },
    
    // generate formatted path for session capture files
    getCapturePath: function (session_id, start, type) {
        return path.join(__dirname, config.capture.path, session_id.toString(), start.toString(), type);
    },

    start_recording: function (pool, session_id) {// TODO(rob): require client id and token
        console.log(`start_recording called with pool: ${pool}, session: ${session_id}`)
        let session = this.sessions.get(session_id);
        if (!session) {
            this.logErrorSessionClientSocketAction(session_id, null, null, `Tried to start recording, but session was null`);

            logger.info("DEBUG" + Object.keys(this.sessions));

            return;
        }

        if (session && !session.isRecording) {
            session.isRecording = true;
            session.recordingStart = Date.now();
            let path = this.getCapturePath(session_id, session.recordingStart, '');
            fs.mkdir(path, { recursive: true }, (err) => {
                if(err) if (this.logger) this.logger.warn(`Error creating capture path: ${err}`);
            });
            let capture_id = session_id+'_'+session.recordingStart;
            if (pool) {
                pool.query(
                    "INSERT INTO captures(capture_id, session_id, start) VALUES(?, ?, ?)", [capture_id, session_id, session.recordingStart],
                    (err, res) => {
                        if (err != undefined) {
                            if (this.logger) this.logger.error(`Error writing recording start event to database: ${err} ${res}`);
                        }
                    }
                );
            }

            if (this.logger) this.logger.info(`Capture started: ${session_id}`);
        } else if (session && session.isRecording) {
            if (this.logger) this.logger.warn(`Requested session capture, but session is already recording: ${session_id}`);
        }
    }, 

    // define end_recording event handler, use on socket event as well as on server cleanup for empty sessions
    end_recording: function (pool, session_id) {
        if (session_id) {
            let session = this.sessions.get(session_id);
            if (session && session.isRecording) {
                session.isRecording = false;
                if (this.logger) this.logger.info(`Capture ended: ${session_id}`);                
                // write out the buffers if not empty, but only up to where the cursor is

                // NOTE(rob): deprecated, use messages. 
                // let pos_writer = session.writers.pos;
                // if (pos_writer.cursor > 0) {
                //     let path = this.getCapturePath(session_id, session.recordingStart, 'pos');
                //     let wstream = fs.createWriteStream(path, { flags: 'a' });
                //     wstream.write(pos_writer.buffer.slice(0, pos_writer.cursor));
                //     wstream.close();
                //     pos_writer.cursor = 0;
                // }
                // let int_writer = session.writers.int;
                // if (int_writer.cursor > 0) {
                //     let path = this.getCapturePath(session_id, session.recordingStart, 'int');
                //     let wstream = fs.createWriteStream(path, { flags: 'a' });
                //     wstream.write(int_writer.buffer.slice(0, int_writer.cursor));
                //     wstream.close();
                //     int_writer.cursor = 0;
                // }

                // write out message buffer. 
                let path = this.getCapturePath(session_id, session.recordingStart, 'data');
                fs.writeFile(path, JSON.stringify(session.message_buffer), (e) => { if (e) {console.log(`Error writing message buffer: ${e}`);} });
                // reset the buffer.
                session.message_buffer = [];
                
                // write the capture end event to database
                if (pool) {
                    let capture_id = session_id+'_'+session.recordingStart;
                    pool.query(
                        "UPDATE captures SET end = ? WHERE capture_id = ?", [Date.now(), capture_id],
                        (err, res) => {
                            if (err != undefined) {
                                if (this.logger) this.logger.error(`Error writing recording end event to database: ${err} ${res}`);
                            }
                        }
                    );
                }
            } else if (session && !session.isRecording) {
                if (this.logger) this.logger.warn(`Requested to end session capture, but capture is already ended: ${session_id}`);
            } else {
                if (this.logger) this.logger.warn(`Error ending capture for session: ${session_id}`);
            }
        }
    },

    record_message_data: function (message) {
        if (message) {
            let session = this.sessions.get(message.session_id);

            // calculate a canonical session sequence number for this message from session start and message timestamp.
            // NOTE(rob): investigate how we might timestamp incoming packets WHEN THEY ARE RECEIVED BY THE NETWORKING LAYER, ie. not
            // when they are handled by the socket.io library. From a business logic perspective, the canonical order of events is based
            // on when they arrive at the relay server, NOT when the client emits them. 8/3/2021

            let seq =  message.ts - session.recordingStart;

            let session_id = message.session_id;

            let client_id = message.client_id;

            if (!session_id || !client_id) {
                this.logErrorSessionClientSocketAction(session_id, null, null, `Tried to record message data. One of these properties is missing. session_id: ${session_id}, client_id: ${client_id}, message: ${message}`);

                return;
            }

            // create message record with sequence metadata
            let record = {
                seq: seq,
                message: message
            };

            if (session.message_buffer) {
                // TODO(rob): find optimal buffer size
                // if (session.message_buffer.length < MESSAGE_BUFFER_MAX_SIZE) {
                //     this.session.message_buffer.push(record)
                // } else

                session.message_buffer.push(record);

                // DEBUG(rob): 
                // let mb_str = JSON.stringify(session.message_buffer);
                // let bytes = new util.TextEncoder().encode(mb_str).length
                // console.log(`Session ${message.session_id} message buffer size: ${bytes} bytes`)
            }
        } else {
            this.logErrorSessionClientSocketAction(null, null, null, `message was null`);
        }
    },

    handlePlayback: function (io, data) {
        // TODO(rob): need to use playback object to track seq and group by playback_id, 
        // so users can request to pause playback, maybe rewind?
        if (this.logger) this.logger.info(`Playback request: ${data.playback_id}`);
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

        // NOTE(rob): deprecated; playback data must use message system. 
        // check that all params are valid
        // if (capture_id && start) {
        //     // TODO(rob): Mar 3 2021 -- audio playback on hold to focus on data. 
        //     // build audio file manifest
        //     // if (this.logger) this.logger.info(`Buiding audio file manifest for capture replay: ${playback_id}`)
        //     // let audioManifest = [];
        //     // let baseAudioPath = this.getCapturePath(capture_id, start, 'audio');
        //     // if(fs.existsSync(baseAudioPath)) {              // TODO(rob): change this to async operation
        //     //     let items = fs.readdirSync(baseAudioPath);  // TODO(rob): change this to async operation
        //     //     items.forEach(clientDir => {
        //     //         let clientPath = path.join(baseAudioPath, clientDir)
        //     //         let files = fs.readdirSync(clientPath)  // TODO(rob): change this to async operation
        //     //         files.forEach(file => {
        //     //             let client_id = clientDir;
        //     //             let seq = file.split('.')[0];
        //     //             let audioFilePath = path.join(clientPath, file);
        //     //             let item = {
        //     //                 seq: seq,
        //     //                 client_id: client_id,
        //     //                 path: audioFilePath,
        //     //                 data: null
        //     //             }
        //     //             audioManifest.push(item);
        //     //         });
        //     //     });
        //     // }

        //     // // emit audio manifest to connected clients
        //     // io.of('chat').to(session_id.toString()).emit('playbackAudioManifest', audioManifest);

        //     // // stream all audio files for caching and playback by client
        //     // audioManifest.forEach((file) => {
        //     //     fs.readFile(file.path, (err, data) => {
        //     //         file.data = data;
        //     //         if(err) if (this.logger) this.logger.error(`Error reading audio file: ${file.path}`);
        //     //         // console.log('emitting audio packet:', file);
        //     //         io.of('chat').to(session_id.toString()).emit('playbackAudioData', file);
        //     //     });
        //     // });

        //     // position streaming
        //     let capturePath = this.getCapturePath(capture_id, start, 'pos');
        //     let stream = fs.createReadStream(capturePath, { highWaterMark: positionChunkSize() });

        //     // set actual playback start time
        //     let playbackStart = Date.now();

        //     // position data emit loop
        //     stream.on('data', function(chunk) {
        //         stream.pause();

        //         // start data buffer loop
        //         let buff = Buffer.from(chunk);
        //         let farr = new Float32Array(chunk.byteLength / 4);
        //         for (var i = 0; i < farr.length; i++) {
        //             farr[i] = buff.readFloatLE(i * 4);
        //         }
        //         var arr = Array.from(farr);

        //         let timer = setInterval( () => {
        //             current_seq = Date.now() - playbackStart;

        //             // console.log(`=== POS === current seq ${current_seq}; arr seq ${arr[POS_FIELDS-1]}`);

        //             if (arr[POS_FIELDS-1] <= current_seq) {
        //                 // alias client and entity id with prefix if entity type is not an asset
        //                 if (arr[4] != 3) {
        //                     arr[2] = 90000 + arr[2];
        //                     arr[3] = 90000 + arr[3];
        //                 }
        //                 // if (!audioStarted) {
        //                 //     // HACK(rob): trigger clients to begin playing buffered audio 
        //                 //     audioStarted = true;
        //                 //     io.of('chat').to(session_id.toString()).emit('startPlaybackAudio');
        //                 // }
        //                 io.to(session_id.toString()).emit('relayUpdate', arr);
        //                 stream.resume();
        //                 clearInterval(timer);
        //             }
        //         }, 1);
        //     });

        //     stream.on('error', function(err) {
        //         if (this.logger) this.logger.error(`Error creating position playback stream for ${playback_id} ${start}: ${err}`);
        //         io.to(session_id.toString()).emit('playbackEnd');
        //     });

        //     stream.on('end', function() {
        //         if (this.logger) this.logger.info(`End of pos data for playback session: ${session_id}`);
        //         io.to(session_id.toString()).emit('playbackEnd');
        //     });

        //     // interaction streaming
        //     let ipath = this.getCapturePath(capture_id, start, 'int');
        //     let istream = fs.createReadStream(ipath, { highWaterMark: interactionChunkSize() });

        //     istream.on('data', function(chunk) {
        //         istream.pause();

        //         let buff = Buffer.from(chunk);
        //         let farr = new Int32Array(chunk.byteLength / 4);
        //         for (var i = 0; i < farr.length; i++) {
        //             farr[i] = buff.readInt32LE(i * 4);
        //         }
        //         var arr = Array.from(farr);

        //         let timer = setInterval( () => {
        //             // console.log(`=== INT === current seq ${current_seq}; arr seq ${arr[INT_FIELDS-1]}`);

        //             if (arr[INT_FIELDS-1] <= current_seq) {
        //                 io.to(session_id.toString()).emit('interactionUpdate', arr);
        //                 istream.resume();
        //                 clearInterval(timer);
        //             }
        //         }, 1);

        //     });

        //     istream.on('error', function(err) {
        //         if (this.logger) this.logger.error(`Error creating interaction playback stream for session ${session_id}: ${err}`);
        //         io.to(session_id.toString()).emit('interactionpPlaybackEnd');
        //     });

        //     istream.on('end', function() {
        //         if (this.logger) this.logger.info(`End of int data for playback session: ${session_id}`);
        //         io.to(session_id.toString()).emit('interactionPlaybackEnd');
        //     });
        // }
    },

    isValidRelayPacket: function (data) {
        let session_id = data[1];

        let client_id = data[2];
        
        if (session_id && client_id)  {
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

    // NOTE(rob): DEPRECATED. 8/5/21. 
    // writeRecordedRelayData: function (data) {
    //     if (!data) {
    //         throw new ReferenceError ("data was null");
    //     }

    //     let session_id = data[1];

    //     let session = this.sessions.get(session_id);

    //     if (!session) {
    //         throw new ReferenceError ("session was null");
    //     }

    //     if (!session.isRecording) {
    //         return;
    //     }

        // // calculate and write session sequence number using client timestamp
        // data[POS_FIELDS-1] = data[POS_FIELDS-1] - session.recordingStart;

        // // get reference to session writer (buffer and cursor)
        // let writer = session.writers.pos;

        // if (positionChunkSize() + writer.cursor > writer.buffer.byteLength) {
        //     // if buffer is full, dump to disk and reset the cursor
        //     let path = this.getCapturePath(session_id, session.recordingStart, 'pos');

        //     let wstream = fs.createWriteStream(path, { flags: 'a' });

        //     wstream.write(writer.buffer.slice(0, writer.cursor));

        //     wstream.close();

        //     writer.cursor = 0;
        // }

        // for (let i = 0; i < data.length; i++) {
        //     writer.buffer.writeFloatLE(data[i], (i*POS_BYTES_PER_FIELD) + writer.cursor);
        // }

        // writer.cursor += positionChunkSize();
    // },

    updateSessionState: function (data) {
        if (!data || data.length < 5) {
            this.logErrorSessionClientSocketAction(null, null, null, `Tried to update session state, but data was null or not long enough`);
            
            return;
        }

        let session_id = data[1];

        let session = this.sessions.get(session_id);

        if (!session) {
            this.logErrorSessionClientSocketAction(session_id, null, null, `Tried to update session state, but there was no such session`);

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

            // NOTE(rob): deprecated, use messages. 
            // write to file as binary data
            // if (session.isRecording) {
                // // calculate and write session sequence number
                // data[INT_FIELDS-1] = data[INT_FIELDS-1] - session.recordingStart;
                
                // // get reference to session writer (buffer and cursor)
                // let writer = session.writers.int;

                // if (interactionChunkSize() + writer.cursor > writer.buffer.byteLength) {
                //     // if buffer is full, dump to disk and reset the cursor
                //     let path = this.getCapturePath(session_id, session.recordingStart, 'int');
                //     let wstream = fs.createWriteStream(path, { flags: 'a' });
                //     wstream.write(writer.buffer.slice(0, writer.cursor));
                //     wstream.close();
                //     writer.cursor = 0;
                // }
                // for (let i = 0; i < data.length; i++) {
                //     writer.buffer.writeInt32LE(data[i], (i*INT_BYTES_PER_FIELD) + writer.cursor);
                // }
                // writer.cursor += interactionChunkSize();
            // }
        }
    },

    handleState: function (socket, data) {
        if(!socket) {
            this.logErrorSessionClientSocketAction(null, null, null, `tried to handle state, but socket was null`);

            return { session_id: -1, state: null };
        }

        if (!data) {
            this.logErrorSessionClientSocketAction(null, null, socket.id, `tried to handle state, but data was null`);
        
            return { session_id: -1, state: null };
        }
            
        let session_id = data.session_id;
            
        let client_id = data.client_id;
        
        this.logInfoSessionClientSocketAction(session_id, client_id, socket.id, `State: ${JSON.stringify(data)}`);
            
        if (!session_id || !client_id) {
            this.connectionAuthorizationErrorAction(socket, "You must provide a session ID and a client ID in the URL options.");

            return { session_id: -1, state: null };
        }
        
        let version = data.version;

        let session = this.sessions.get(session_id);

        if (!session) {
            this.stateErrorAction(socket, "The session was null, so no state could be found.");

            return { session_id: -1, state: null };
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

    // returns true on success and false on failure    
    addClientToSession: function (session, client_id, do_create_session) {
        if (session == null && !do_create_session) {
            this.logErrorSessionClientSocketAction(null, client_id, null, `tried to add client to session, but session was null and do_create_session was false`);

            return false;
        }

        if (session == null && do_create_session) {
            session = this.createSession();
        }

        if (session.clients == null || 
            typeof session.clients === "undefined" || 
            session.clients.length == 0) {
            session.clients = [ client_id ];

            return true;
        }

        session.clients.push(client_id);

        return true;
    },

    removeDuplicateClientsFromSession: function (session, client_id) {
        if (session == null) {
            this.logErrorSessionClientSocketAction(null, client_id, null, `tried to remove duplicate client from session, but session was null`);

            return;
        }

        if (session.clients == null) {
            this.logErrorSessionClientSocketAction(session.id, client_id, null, `tried to remove duplicate client from session, but session.clients was null`);

            return;
        }

        if (session.clients.length == 0) {
            return;
        }

        const first_instance = session.clients.indexOf(client_id);

        for (let i = 0; i < session.clients.length; i += 1) {
            if (i != first_instance && session.clients[i] == client_id) {
                session.clients.splice(i, 1);
            }
        }
    },

    removeClientFromSession: function (session, client_id) {
        if (session == null) {
            this.logErrorSessionClientSocketAction(null, client_id, null, `tried to remove client from session, but session was null`);

            return;
        }

        if (session.clients == null) {
            this.logErrorSessionClientSocketAction(session.id, client_id, null, `tried to remove client from session, but session.clients was null`);

            return;
        }

        let index = session.clients.indexOf(client_id);

        if (session.clients.length == 0 || 
            session.clients.indexOf(client_id) == -1) {
            //client_id is not in the array, so we don't need to remove it.
            this.logWarningSessionClientSocketAction(null, null, client_id, `Tried removing client from session.clients, but it was not there. Proceeding anyways.`);

            return; 
        }

        session.clients.splice(index, 1);
    },

    addSocketToSession: function (session, socket, client_id) {
        if (!session) {
            this.logErrorSessionClientSocketAction(null, client_id, socket.id, `tried to add socket to session, but session was null`);

            return;
        }

        session.sockets[socket.id] = { client_id: client_id, socket: socket };
    },

    // returns true iff socket was successfully joined to session
    handleJoin: function (err, socket, session_id, client_id, do_bump_duplicates) {
        if (!socket) {
            this.logErrorSessionClientSocketAction(session_id, client_id, null, `tried to handle join, but socket was null`);
            
            return false;
        }

        if (!this.joinSessionAction) {
            this.logWarningSessionClientSocketAction(session_id, client_id, socket.id, `in handleJoin, joinSessionAction callback was not provided. Proceeding anyways.`);
        }

        if (err) {
            this.logErrorSessionClientSocketAction(session_id, client_id, socket.id, `Error joining client to session: ${err}`);

            return false;
        }

        let { success, session } = this.getSession(session_id);

        if (!success || !session) {
            this.logWarningSessionClientSocketAction(session_id, client_id, socket.id, "session was null when adding socket to session. Creating a session for you.");

            session = this.createSession(session_id);
        }

        success = this.addClientToSession(session, client_id);

        if (!success) {
            this.logErrorSessionClientSocketAction(session_id, client_id, socket.id, `tried to handle join, but adding client to session failed.`);
        
            return;
        }

        this.bumpDuplicateSockets(session, client_id, do_bump_duplicates, socket.id);
        
        if (do_bump_duplicates) {
            this.removeDuplicateClientsFromSession(session, client_id);
        }

        // socket to client mapping
        this.addSocketToSession(session, socket, client_id);

        this.joinSessionAction(session_id, client_id);

        // socket successfully joined to session
        return true;
    },

    //TODO rewrite this so that do_bump_duplicates and socket_id become ids_to_keep
    bumpDuplicateSockets: function (session, client_id, do_bump_duplicates, socket_id) {
        if (session == null) {
            this.logErrorSessionClientSocketAction(null, client_id, socket_id, `tried to bump duplicate sockets, but session was null`);

            return;
        }

        let session_id = this.getSessionIdFromSession(session);

        if (this.bumpAction == null) {
            this.logWarningSessionClientSocketAction(session.id, client_id, socket_id, `in bumpDuplicateSockets, bumpAction callback was not provided`);
        }
        
        let sockets;
        
        if (do_bump_duplicates) {
            sockets = this.getSessionSocketsFromClientId(session, client_id, socket_id);
        } else {
            sockets = this.getSessionSocketsFromClientId(session, client_id, null);
        }

        let self = this;

        if (!sockets) {
            this.logWarningSessionClientSocketAction(session.id, client_id, socket_id, `tried to bump duplicate sockets, but result of getSessionSocketsFromClientId was null. Proceeding anyways.`);
        }
            
        sockets.forEach((socket) => {
            self.bumpAction(session_id, socket);

            self.removeSocketFromSession(socket, session_id, client_id);
        });
    },

    writeEventToConnections: function (event, session_id, client_id) {
        if (event && session_id && client_id) {
            if (!this.pool) {
                this.logErrorSessionClientSocketAction(session_id, client_id, null, "pool was null");

                return;
            }
            
            if (this.pool) {
                this.pool.query(
                    "INSERT INTO connections(timestamp, session_id, client_id, event) VALUES(?, ?, ?, ?)", [Date.now(), session_id, client_id, event],

                    (err, res) => {
                        if (err != undefined) {
                            this.logErrorSessionClientSocketAction(session_id, client_id, null, `Error writing ${event} event to database: ${err} ${res}`);
                        }
                    }
                );
            }
        } else {
            this.logger.error(`Failed to log event to database: ${event}, ${session_id}, ${client_id}`);
        }
    },

    // returns session ID on success; returns -1 on failure
    // TODO(Brandon): deprecate and remove 8/10/21
    getSessionIdFromSession: function (session) {
        let result = -1;

        if (session == null || typeof session === "undefined") {
            this.logErrorSessionClientSocketAction(null, null, null, `tried to get session ID from session, but session was null or undefined`);

            return result;
        }

        if (typeof session !== "object") {
            this.logErrorSessionClientSocketAction(null, null, null, `tried to get session ID from session, but session was not an object`);

            return result;
        }

        if (session.clients == null || typeof session.clients === "undefined") {
            this.logErrorSessionClientSocketAction(session.id, null, null, `session.clients was null or undefined`);

            return result;
        }

        if (session.sockets == null || typeof session.sockets === "undefined") {
            this.logErrorSessionClientSocketAction(session.id, null, null, `session.sockets was null or undefined`);

            return result;
        }

        this.sessions.forEach((candidate_session, candidate_session_id) => {
            if (candidate_session.clients == null || 
                typeof candidate_session.clients === "undefined") {
                return; // return from the inner function only.
            }
    
            if (candidate_session.sockets == null || 
                typeof candidate_session.sockets === "undefined") {
                return; // return from the inner function only.
            }

            if (candidate_session.sockets.size != session.sockets.size) {
                return; // return from the inner function only.
            }

            if (compareKeys(candidate_session.sockets, session.sockets)) {
                result = candidate_session_id;
            }
        });

        return result;
    },
    
    getSessionSocketsFromClientId: function (session, client_id, excluded_socket_id) {
        if (session == null) {
            this.logErrorSessionClientSocketAction(null, client_id, null, `tried to get session sockets from client ID, but session was null`);

            return null;
        }

        if (session.sockets == null) {
            this.logErrorSessionClientSocketAction(session.id, client_id, null, `tried to get session sockets from client ID, but session.sockets was null`);

            return null;
        }

        var result = [];

        for (var candidate_socket_id in session.sockets) {
            let isCorrectId = session.sockets[candidate_socket_id].client_id == client_id;

            let doExclude = (session.sockets[candidate_socket_id].socket.id == excluded_socket_id);

            if (isCorrectId && !doExclude) {
                result.push(session.sockets[candidate_socket_id].socket);
            }
        }

        return result;
    },

    // returns number of client instances of the same ID on success; returns -1 on failure;
    getNumClientInstancesForClient: function (session_id, client_id) {
        let session = this.sessions.get(session_id);

        if (session == null || session.clients == null) {
            this.logErrorSessionClientSocketAction(session_id, client_id, null, `Could not get number of client instances -- session was null or session.clients was null.`);

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
        if (!socket) {
            this.logErrorSessionClientSocketAction(session_id, client_id, null, `tried removing socket from session, but socket was null`);

            return;
        }

        if (!this.disconnectAction) {
            this.logWarningSessionClientSocketAction(null, client_id, socket.id, `in removeSocketFromSession, disconnectAction callback was not provided`);
        }

        this.disconnectAction(socket, session_id, client_id);

        // clean up
        let session = this.sessions.get(session_id);

        if (!session) {
            this.logWarningSessionClientSocketAction(session_id, client_id, socket.id, `Could not find session when trying to remove a socket from it.`);

            return;
        }

        if (!(socket.id in session.sockets)) {
            this.logErrorSessionClientSocketAction(session_id, client_id, socket.id, `tried removing socket from session.sockets, but it was not found.`);

            return;
        }

        // remove socket->client mapping
        delete session.sockets[socket.id];

        this.logInfoSessionClientSocketAction(session_id, client_id, socket.id, `Removed client from session.`);
        
        this.removeClientFromSession(session, client_id);
    },

    getNumClientInstances: function (session_id) {
        let session = this.sessions.get(session_id);

        if (!session) {
            this.logWarningSessionClientSocketAction(session_id, null, null, `tried to get number of clients for a session, but it was not found.`);

            return -1;
        }

        if (session.clients == null) {
            this.logWarningSessionClientSocketAction(session_id, null, null, `the session's session.clients was null.`);

            return -1;
        }

        return session.clients.length;
    },

    try_to_end_recording: function (session_id) {
        let session = this.sessions.get(session_id);

        if (!session) {
            this.logWarningSessionClientSocketAction(session_id, null, null, `tried to end recording for session ${session_id}, but it was not found.`);

            return;
        }

        if (!session.isRecording) {
            return;
        }

        this.logInfoSessionClientSocketAction(session_id, null, null, `Stopping recording for empty session`);

        this.end_recording(session_id);
    },

    // clean up session from sessions map if empty, write 
    cleanUpSessionIfEmpty: function (session_id) {
        if (this.getNumClientInstancesForClient(session_id) >= 0) {
            // don't clean up if there are still clients in the session
            return;
        }

        this.logInfoSessionClientSocketAction(session_id, null, null, `Ending empty session`);

        this.try_to_end_recording(session_id);
        
        this.sessions.delete(session_id);
    },

    // if a session exists, return it. Otherwise, create one with default values, register it, and return it.
    getOrCreateSession: function (session_id) {
        let { success, session } = this.getSession(session_id);

        if (success) {
            return session;
        }

        return this.createSession(session_id);
    },

    getSession: function (session_id) {
        let _session = this.sessions.get(session_id);

        if (_session != null && typeof _session != "undefined") {
            return {
                success: true,

                session: _session
            };
        }

        return { 
            success: false, 

            session: null 
        };
    }, 

    initialize_recording_writers: function () {
    },

    createSession: function (session_id) {
        this.logInfoSessionClientSocketAction(session_id, null, null, `Creating session: ${session_id}`);

        this.sessions.set(session_id, {
            id: session_id,
            sockets: {}, // socket.id -> client_id
            clients: [],
            entities: [],
            scene: null,
            isRecording: false,
            start: Date.now(),
            recordingStart: 0,
            seq: 0,
            // NOTE(rob): DEPRECATED, use message_buffer. 8/3/2021
            // writers: {
            //     pos: {
            //         buffer: Buffer.alloc(this.positionWriteBufferSize()),
            //         cursor: 0
            //     },
            //     int: {
            //         buffer: Buffer.alloc(this.interactionWriteBufferSize()),
            //         cursor: 0
            //     }
            // },
            message_buffer: []
        });

        session = this.sessions.get(session_id);
        
        return session;
    },

    processReconnectionAttempt: function (err, socket, session_id, client_id) {
        let success = this.handleJoin(err, socket, session_id, client_id, true);

        if (!success) { 
            this.logInfoSessionClientSocketAction(session_id, client_id, socket.id, 'failed to reconnect');

            this.removeSocketFromSession(socket, session_id, client_id);

            this.cleanUpSessionIfEmpty(session_id);

            return false;
        } 

        ////TODO does this need to be called here???? this.bumpOldSockets(session_id, client_id, socket.id);

        this.logInfoSessionClientSocketAction(session_id, client_id, socket.id, 'successfully reconnected');

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
    handleDisconnect: function (socket, reason) {
        if (!socket) {
            this.logErrorSessionClientSocketAction(null, null, null, `tried handling disconnect, but socket was null`);

            return false;
        }

        if (!this.reconnectAction) {
            this.logErrorSessionClientSocketAction(null, null, socket.id, `in handleDisconnect, reconnectAction callback was not provided`);

            return false;
        }

        // Check disconnect event reason and handle
        // see https://socket.io/docs/v2/server-api/index.html

        let knownReasons = {
            // the disconnection was initiated by the server
            "server namespace disconnect": {
                doReconnect: false,
            },
            // The socket was manually disconnected using socket.disconnect()
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
                return this.reconnectAction(reason, socket, session_id, client_id, session);
            }

            //Disconnect the socket

            this.logInfoSessionClientSocketAction(session_id, client_id, socket.id, `Client was disconnected, probably because an old socket was bumped. Reason: ${reason}, clients: ${JSON.stringify(session.clients)}`);

            this.removeSocketFromSession(socket, session_id, client_id);

            this.cleanUpSessionIfEmpty(session_id);

            return false; // Don't continue to check other sessions.
        }

        //socket not found in our records. This will happen for komodo-unity versions v0.3.2 and below, which handle "sync" actions on the main server namespace.
        this.logInfoSessionClientSocketAction(null, null, socket.id, `disconnected. Not found in sessions. Probably ok.)`);
    },

    createCapturesDirectory: function () {
        if (!fs.existsSync(config.capture.path)) {
            this.logInfoSessionClientSocketAction(null, null, null, `Creating directory for session captures: ${config.capture.path}`);

            fs.mkdirSync(config.capture.path);
        }
    },

    getSessions: function () {
        return this.sessions;
    },

    initGlobals: function () {
        this.sessions = new Map();
    },

    init: function (io, pool, logger) {
        this.initGlobals();

        this.createCapturesDirectory();

        if (logger == null) {
            console.warn("No logger was found.");
        }

        this.logger = logger;
        if (!this.logger) {
            console.error("Failed to init logger. Exiting.");
            process.exit();
        }

        this.logInfoSessionClientSocketAction("Session ID", "Client ID", "Socket ID", "Message");

        if (pool == null) {
            if (this.logger) this.logger.warn("No MySQL Pool was found.");
        }

        this.pool = pool;

        let self = this;

        if (io == null) {
            if (this.logger) this.logger.warn("No SocketIO server was found.");
        }

        this.connectionAuthorizationErrorAction = function (socket, message) {
            socket.emit("connectionError", message);
        };

        this.bumpAction = function (session_id, socket) {
            self.logInfoSessionClientSocketAction(session_id, null, socket.id, `leaving session`);

            socket.leave(session_id.toString(), (err) => {
                if (err) {
                    self.logErrorSessionClientSocketAction(session_id, null, socket.id, err);

                    return;
                }
            });

            self.logInfoSessionClientSocketAction(session_id, null, socket.id, `Disconnecting: ...`);

            setTimeout(() => {
                socket.disconnect(true);

                self.logInfoSessionClientSocketAction(session_id, null, socket.id, `Disconnecting: Done.`);
            }, 500); // delay half a second and then bump the old socket    
        };

        this.joinSessionAction = function (session_id, client_id) {
            io.to(session_id.toString()).emit('joined', client_id);
        };

        this.disconnectAction = function (socket, session_id, client_id) {
            // notify and log event
            socket.to(session_id.toString()).emit('disconnected', client_id);
        };

        this.stateErrorAction = function (socket, message) {
            socket.emit('stateError', message);
        };

        // returns true for successful reconnection
        this.reconnectAction = function (reason, socket, session_id, client_id, session) {
            self.logInfoSessionClientSocketAction(session_id, client_id, socket.id, `Client was disconnected; attempting to reconnect. Disconnect reason: ${reason}, clients: ${JSON.stringify(session.clients)}`);
    
            socket.join(session_id.toString(), (err) => { 
                self.processReconnectionAttempt(err, socket, session_id, client_id);
            });
        };

        // main relay handler
        io.on('connection', function(socket) {
            self.logInfoSessionClientSocketAction(null, null, socket.id, `Session connection`);

            socket.on('sessionInfo', function (session_id) {
                let session = self.sessions.get(session_id);

                if (!session) {
                    self.logWarningSessionClientSocketAction(session_id, null, socket.id, `Requested session, but it does not exist.`);
                    
                    return;
                }

                socket.to(session_id.toString()).emit('sessionInfo', session);
            });

            //Note: "join" is our own event name, and should not be confused with socket.join. (It does not automatically listen for socket.join either.)
            socket.on('join', function(data) {
                let session_id = data[0];

                let client_id = data[1];

                self.logInfoSessionClientSocketAction(session_id, client_id, socket.id, `Asked to join`);

                if (!client_id || !session_id) {
                    self.connectionAuthorizationErrorAction(socket, "You must provide a client ID and a session ID in the URL options.");

                    return;
                }

                //TODO does this need to be called here???? self.bumpOldSockets(session_id, client_id, socket.id);

                // relay server joins connecting client to session room
                socket.join(session_id.toString(), (err) => { 
                    let success = self.handleJoin(err, socket, session_id, client_id, true); 

                    if (success) {
                        // write join event to database
                        self.writeEventToConnections("connect", session_id, client_id);
                    }
                });
            });

            socket.on('state', function(data) {
                let { session_id, state } = self.handleState(socket, data);

                if (session_id == -1 || !state) {
                    self.logWarningSessionClientSocketAction(session_id, null, socket.id, "state was null");

                    return;
                }

                try {
                    // emit versioned state data
                    io.to(session_id).emit('state', state);
                } catch (err) {
                    this.logErrorSessionClientSocketAction(session_id, null, socket.id, err.message);
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
                if (data) {
                    let session_id = data.session_id;
                    let client_id = data.client_id;

                    if (session_id && client_id) {
                        // relay the message
                        socket.to(session_id.toString()).emit('message', data);

                        // get reference to session and parse message payload for state updates, if needed. 
                        let session = self.sessions.get(session_id);
                        if (session) {
                            // DEBUG(rob): 
                            // console.log(`message received for session: ${session.id}`)
                            // console.log(`message packet: ${JSON.stringify(data)}`);
                            
                            let message = data.message;

                            if (!message) return;
                            if (!message.type) return;

                            if (message.type == "interaction") {
                                console.log("core interaction message received, handling...");

                                // `data` here will be in the legacy packed-array format. 

                                // NOTE(rob): the following code is copypasta from the old interactionUpdate handler. 7/21/2021

                                // check if the incoming packet is from a client who is valid for this session
                                let joined = false;
                                for (let i=0; i < session.clients.length; i++) {
                                    if (client_id == session.clients[i]) {
                                        joined = true;
                                        break;
                                    }
                                }

                                if (!joined) return;

                                let payload = message.data;

                                // Check if message payload is pre-parsed. 
                                // TODO(Brandon): evaluate whether to unpack here or keep as a string.
                                if (typeof payload != `object`) {
                                    try {
                                        payload = JSON.parse(message.data);
                                    } catch (e) {
                                        this.logger.warn(`Failed to parse 'interaction' message payload: ${e}`);
                                        return;
                                    }
                                }

                                let source_id = payload[3];
                                let target_id = payload[4];
                                let interaction_type = payload[5];
                                
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
                                            latest: payload,
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
                            }

                            if (message.type == "sync") {
                                // update session state with latest entity positions
                                let payload = message.data;

                                // Check if message payload is pre-parsed. 
                                // TODO(Brandon): evaluate whether to unpack here or keep as a string.
                                if (typeof payload != `object`) {
                                    try {
                                        payload = JSON.parse(message.data);
                                    } catch (e) {
                                        this.logger.warn(`Failed to parse 'sync' message payload: ${e}`);
                                        return;
                                    }
                                }

                                let entity_type = payload[4];

                                if (entity_type == 3) {
                                    let entity_id = payload[3];

                                    let i = session.entities.findIndex(e => e.id == entity_id);

                                    if (i != -1) {
                                        session.entities[i].latest = payload;
                                    } else {
                                        let entity = {
                                            id: entity_id,
                                            latest: payload,
                                            render: true,
                                            locked: false
                                        };

                                        session.entities.push(entity);
                                    }
                                }
                            }
                            
                            // data capture
                            if (session.isRecording) {
                                self.record_message_data(data);
                            }
                        }
                    }
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

                // self.writeRecordedRelayData(data); NOTE(rob): DEPRECATED. 8/5/21. 

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

                let didReconnect = self.handleDisconnect(socket, reason);

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