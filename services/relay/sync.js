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
const config = require("./config");

const fs = require("fs");

const path = require("path");

const util = require("util");
const { syslog } = require("winston/lib/winston/config");
const Session = require("./session");

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
const INTERACTION_RENDER = 2;
const INTERACTION_RENDER_END = 3;
// const INTERACTION_GRAB          = 4;
// const INTERACTION_GRAB_END      = 5;
const INTERACTION_SCENE_CHANGE = 6;
// const INTERACTION_UNSET         = 7; // NOTE(rob): this value is currently unused. 2020-12-1
const INTERACTION_LOCK = 8;
const INTERACTION_LOCK_END = 9;

const SYNC_OBJECTS = 3;

//TODO refactor this.sessions into instances of the Session object.

// Courtesy of Casey Foster on Stack Overflow
// https://stackoverflow.com/a/14368628
function compareKeys(a, b) {
  var aKeys = Object.keys(a).sort();

  var bKeys = Object.keys(b).sort();

  return JSON.stringify(aKeys) === JSON.stringify(bKeys);
}

const SocketIOEvents = {
  disconnect: "disconnect",
  disconnecting: "disconnecting",
  error: "error"
};

const KomodoReceiveEvents = {
  requestToJoinSession: "join",
  leave: "leave",
  sessionInfo: "sessionInfo",
  requestOwnStateCatchup: "state",
  draw: "draw",
  message: "message",
  update: "update",
  interact: "interact",
  start_recording: "start_recording",
  end_recording: "end_recording",
  playback: "playback",
};

const KomodoSendEvents = {
  connectionError: "connectionError",
  interactionUpdate: "interactionUpdate",
  clientJoined: "joined",
  failedToJoin: "failedToJoin",
  successfullyJoined: "successfullyJoined",
  left: "left",
  failedToLeave: "failedToLeave",
  successfullyLeft: "successfullyLeft",
  disconnected: "disconnected",
  sessionInfo: "sessionInfo",
  state: "state",
  draw: "draw",
  message: "message",
  relayUpdate: "relayUpdate",
  notifyBump: "bump",
};

const KomodoMessages = {
    interaction: {
        type: "interaction",
        minLength: 5, //TODO: what should this number be?
        indices: {
            sourceId: 3,
            targetId: 4,
            interactionType: 5,
        },
    },
    sync: {
        type: "sync",
        minLength: 4, //TODO: what should this number be?
        indices: {
            entityId: 3,
            entityType: 4,
        },
    }
};

// see https://socket.io/docs/v2/server-api/index.html

const DisconnectKnownReasons = {
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
    doReconnect: true,
  },
  // The connection has encountered an error (example: the server was killed during a HTTP long-polling cycle)
  "transport error": {
    doReconnect: true,
  },
  // The server did not send a PING within the pingInterval + pingTimeout range.
  "ping timeout": {
    doReconnect: true,
  },
};

const doReconnectOnUnknownReason = true;

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

  logInfoSessionClientSocketAction: function (
    session_id,
    client_id,
    socket_id,
    action
  ) {
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

    if (this.logger)
      this.logger.info(
        ` ${socket_id}    ${session_id}  ${client_id}    ${action}`
      );
  },

  logErrorSessionClientSocketAction: function (
    session_id,
    client_id,
    socket_id,
    action
  ) {
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

    if (this.logger)
      this.logger.error(
        `${socket_id}    ${session_id}  ${client_id}    ${action}`
      );
  },

  logWarningSessionClientSocketAction: function (
    session_id,
    client_id,
    socket_id,
    action
  ) {
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

    if (this.logger)
      this.logger.warn(
        ` ${socket_id}    ${session_id}  ${client_id}    ${action}`
      );
  },

  // generate formatted path for session capture files
  getCapturePath: function (session_id, start, type) {
    return path.join(
      __dirname,
      config.capture.path,
      session_id.toString(),
      start.toString(),
      type
    );
  },

  start_recording: function (pool, session_id) {
    // TODO(rob): require client id and token
    console.log(
      `start_recording called with pool: ${pool}, session: ${session_id}`
    );
    let session = this.sessions.get(session_id);
    if (!session) {
      this.logErrorSessionClientSocketAction(
        session_id,
        null,
        null,
        `Tried to start recording, but session was null`
      );
      return;
    }

    if (session && !session.isRecording) {
      session.isRecording = true;
      session.recordingStart = Date.now();
      let path = this.getCapturePath(session_id, session.recordingStart, "");
      fs.mkdir(path, { recursive: true }, (err) => {
        if (err)
          if (this.logger)
            this.logger.warn(`Error creating capture path: ${err}`);
      });
      let capture_id = session_id + "_" + session.recordingStart;
      session.capture_id = capture_id;
      if (pool) {
        pool.query(
          "INSERT INTO captures(capture_id, session_id, start) VALUES(?, ?, ?)",
          [capture_id, session_id, session.recordingStart],
          (err, res) => {
            if (err != undefined) {
              if (this.logger)
                this.logger.error(
                  `Error writing recording start event to database: ${err} ${res}`
                );
            }
          }
        );
      }

      if (this.logger) this.logger.info(`Capture started: ${session_id}`);
    } else if (session && session.isRecording) {
      if (this.logger)
        this.logger.warn(
          `Requested session capture, but session is already recording: ${session_id}`
        );
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
        let path = this.getCapturePath(
          session_id,
          session.recordingStart,
          "data"
        );
        fs.writeFile(path, JSON.stringify(session.message_buffer), (e) => {
          if (e) {
            console.log(`Error writing message buffer: ${e}`);
          }
        });
        //TODO(Brandon): add success event here. Possibly notify Unity client.
        // reset the buffer.
        session.message_buffer = [];

        // write the capture end event to database
        if (pool) {
          let capture_id = session.capture_id;
          pool.query(
            "UPDATE captures SET end = ? WHERE capture_id = ?",
            [Date.now(), capture_id],
            (err, res) => {
              if (err != undefined) {
                if (this.logger)
                  this.logger.error(
                    `Error writing recording end event to database: ${err} ${res}`
                  );
              }
            }
          );
          session.capture_id = null;
        }
      } else if (session && !session.isRecording) {
        if (this.logger)
          this.logger.warn(
            `Requested to end session capture, but capture is already ended: ${session_id}`
          );
        session.capture_id = null;
      } else {
        if (this.logger)
          this.logger.warn(`Error ending capture for session: ${session_id}`);
      }
    }
  },

  record_message_data: function (data) {
    if (data) {
      let session = this.sessions.get(data.session_id);

      if (!session) {
        this.logErrorSessionClientSocketAction(
          data.session_id,
          null,
          null,
          `Tried to record message data, but session was null`
        );

        return;
      }

      // calculate a canonical session sequence number for this message from session start and message timestamp.
      // NOTE(rob): investigate how we might timestamp incoming packets WHEN THEY ARE RECEIVED BY THE NETWORKING LAYER, ie. not
      // when they are handled by the socket.io library. From a business logic perspective, the canonical order of events is based
      // on when they arrive at the relay server, NOT when the client emits them. 8/3/2021
      data.seq = data.ts - session.recordingStart;

      data.capture_id = session.capture_id; // copy capture id session property and attach it to the message data.

      let session_id = data.session_id;

      let client_id = data.client_id;

      if (typeof data.message != `object`) {
        try {
          data.message = JSON.parse(data.message);
        } catch (e) {
          // if (this.logger) this.logger.warn(`Failed to parse message payload: ${message} ${e}`);
          console.log(`Failed to parse message payload: ${data.message}; ${e}`);

          return;
        }
      }

      if (!session_id || !client_id) {
        this.logErrorSessionClientSocketAction(
          session_id,
          null,
          null,
          `Tried to record message data. One of these properties is missing. session_id: ${session_id}, client_id: ${client_id}, message: ${data}`
        );

        return;
      }

      if (session.message_buffer) {
        // TODO(rob): find optimal buffer size
        // if (session.message_buffer.length < MESSAGE_BUFFER_MAX_SIZE) {
        //     this.session.message_buffer.push(data)
        // } else

        session.message_buffer.push(data);

        // DEBUG(rob):
        // let mb_str = JSON.stringify(session.message_buffer);
        // let bytes = new util.TextEncoder().encode(mb_str).length;
        // console.log(`Session ${data.session_id} message buffer size: ${bytes} bytes`);
      }
    } else {
      this.logErrorSessionClientSocketAction(
        null,
        null,
        null,
        `message was null`
      );
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
      capture_id = playback_id.split("_")[0];
      start = playback_id.split("_")[1];
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
    //     // io.of('chat').to(session_id.toString()).emit(KomodoSendEvents.playbackAudioManifest', audioManifest);

    //     // // stream all audio files for caching and playback by client
    //     // audioManifest.forEach((file) => {
    //     //     fs.readFile(file.path, (err, data) => {
    //     //         file.data = data;
    //     //         if(err) if (this.logger) this.logger.error(`Error reading audio file: ${file.path}`);
    //     //         // console.log('emitting audio packet:', file);
    //     //         io.of('chat').to(session_id.toString()).emit(KomodoSendEvents.playbackAudioData', file);
    //     //     });
    //     // });

    //     // position streaming
    //     let capturePath = this.getCapturePath(capture_id, start, 'pos');
    //     let stream = fs.createReadStream(capturePath, { highWaterMark: positionChunkSize() });

    //     // set actual playback start time
    //     let playbackStart = Date.now();

    //     // position data emit loop
    //     stream.on(KomodoReceiveEvents.data, function(chunk) {
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
    //                 //     io.of('chat').to(session_id.toString()).emit(KomodoSendEvents.startPlaybackAudio');
    //                 // }
    //                 io.to(session_id.toString()).emit(KomodoSendEvents.relayUpdate', arr);
    //                 stream.resume();
    //                 clearInterval(timer);
    //             }
    //         }, 1);
    //     });

    //     stream.on(KomodoReceiveEvents.error, function(err) {
    //         if (this.logger) this.logger.error(`Error creating position playback stream for ${playback_id} ${start}: ${err}`);
    //         io.to(session_id.toString()).emit(KomodoSendEvents.playbackEnd');
    //     });

    //     stream.on(KomodoReceiveEvents.end, function() {
    //         if (this.logger) this.logger.info(`End of pos data for playback session: ${session_id}`);
    //         io.to(session_id.toString()).emit(KomodoSendEvents.playbackEnd');
    //     });

    //     // interaction streaming
    //     let ipath = this.getCapturePath(capture_id, start, 'int');
    //     let istream = fs.createReadStream(ipath, { highWaterMark: interactionChunkSize() });

    //     istream.on(KomodoReceiveEvents.data, function(chunk) {
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
    //                 io.to(session_id.toString()).emit(KomodoSendEvents.interactionUpdate', arr);
    //                 istream.resume();
    //                 clearInterval(timer);
    //             }
    //         }, 1);

    //     });

    //     istream.on(KomodoReceiveEvents.error, function(err) {
    //         if (this.logger) this.logger.error(`Error creating interaction playback stream for session ${session_id}: ${err}`);
    //         io.to(session_id.toString()).emit(KomodoSendEvents.interactionpPlaybackEnd');
    //     });

    //     istream.on(KomodoReceiveEvents.end, function() {
    //         if (this.logger) this.logger.info(`End of int data for playback session: ${session_id}`);
    //         io.to(session_id.toString()).emit(KomodoSendEvents.interactionPlaybackEnd');
    //     });
    // }
  },

  isValidRelayPacket: function (data) {
    let session_id = data[1];

    let client_id = data[2];

    if (session_id && client_id) {
      let session = this.sessions.get(session_id);

      if (!session) {
        return;
      }

      // check if the incoming packet is from a client who is valid for this session
      return session.hasClient(client_id);
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
      this.logErrorSessionClientSocketAction(
        null,
        null,
        null,
        `Tried to update session state, but data was null or not long enough`
      );

      return;
    }

    let session_id = data[1];

    let session = this.sessions.get(session_id);

    if (!session) {
      this.logErrorSessionClientSocketAction(
        session_id,
        null,
        null,
        `Tried to update session state, but there was no such session`
      );

      return;
    }

    // update session state with latest entity positions
    let entity_type = data[4];

    if (entity_type == 3) {
      let entity_id = data[3];

      let i = session.entities.findIndex((e) => e.id == entity_id);

      if (i != -1) {
        session.entities[i].latest = data;
      } else {
        let entity = {
          id: entity_id,
          latest: data,
          render: true,
          locked: false,
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
      socket
        .to(session_id.toString())
        .emit(KomodoSendEvents.interactionUpdate, data);

      // do session state update if needed
      let source_id = data[3];
      let target_id = data[4];
      let interaction_type = data[5];
      let session = this.sessions.get(session_id);
      if (!session) return;

      // check if the incoming packet is from a client who is valid for this session
      if (!session.hasClient(client_id)) {
        return;
      }

      // entity should be rendered
      if (interaction_type == INTERACTION_RENDER) {
        let i = session.entities.findIndex((e) => e.id == target_id);
        if (i != -1) {
          session.entities[i].render = true;
        } else {
          let entity = {
            id: target_id,
            latest: [],
            render: true,
            locked: false,
          };
          session.entities.push(entity);
        }
      }

      // entity should stop being rendered
      if (interaction_type == INTERACTION_RENDER_END) {
        let i = session.entities.findIndex((e) => e.id == target_id);
        if (i != -1) {
          session.entities[i].render = false;
        } else {
          let entity = {
            id: target_id,
            latest: data,
            render: false,
            locked: false,
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
        let i = session.entities.findIndex((e) => e.id == target_id);
        if (i != -1) {
          session.entities[i].locked = true;
        } else {
          let entity = {
            id: target_id,
            latest: [],
            render: false,
            locked: true,
          };
          session.entities.push(entity);
        }
      }

      // entity is unlocked
      if (interaction_type == INTERACTION_LOCK_END) {
        let i = session.entities.findIndex((e) => e.id == target_id);
        if (i != -1) {
          session.entities[i].locked = false;
        } else {
          let entity = {
            id: target_id,
            latest: [],
            render: false,
            locked: false,
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
    if (!socket) {
      this.logErrorSessionClientSocketAction(
        null,
        null,
        null,
        `tried to handle state, but socket was null`
      );

      return { session_id: -1, state: null };
    }

    if (!data) {
      this.logErrorSessionClientSocketAction(
        null,
        null,
        socket.id,
        `tried to handle state, but data was null`
      );

      return { session_id: -1, state: null };
    }

    let session_id = data.session_id;

    let client_id = data.client_id;

    this.logInfoSessionClientSocketAction(
      session_id,
      client_id,
      socket.id,
      `State: ${JSON.stringify(data)}`
    );

    if (!session_id || !client_id) {
      this.connectionAuthorizationErrorAction(
        socket,
        "You must provide a session ID and a client ID in the URL options."
      );

      return { session_id: -1, state: null };
    }

    let version = data.version;

    let session = this.sessions.get(session_id);

    if (!session) {
      this.stateErrorAction(
        socket,
        "The session was null, so no state could be found."
      );

      return { session_id: -1, state: null };
    }

    let state = {};

    // check requested api version
    if (version === 2) {
      state = {
        clients: session.getClients(),
        entities: session.entities,
        scene: session.scene,
        isRecording: session.isRecording,
      };
    } else {
      // version 1 or no api version indicated

      let entities = [];

      let locked = [];

      for (let i = 0; i < session.entities.length; i++) {
        entities.push(session.entities[i].id);

        if (session.entities[i].locked) {
          locked.push(session.entities[i].id);
        }
      }

      state = {
        clients: session.getClients(),
        entities: entities,
        locked: locked,
        scene: session.scene,
        isRecording: session.isRecording,
      };
    }

    return { session_id, state };
  },

  // returns true on success and false on failure
  addClientToSession: function (session_id, client_id, do_create_session) {
    let { success, session } = this.getSession(session_id);

    if (!success || !session) {
      this.logWarningSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        "session was null when making socket and client join session. Creating a session for you."
      );

      session = this.createSession(session_id);
    }

    if (session == null && !do_create_session) {
      this.logErrorSessionClientSocketAction(
        null,
        client_id,
        null,
        `tried to add client to session, but session was null and do_create_session was false`
      );

      return false;
    }

    if (session == null && do_create_session) {
      session = this.createSession();
    }

    session.addClient(client_id);

    return true;
  },

  removeDuplicateClientsFromSession: function (session_id, client_id) {
    let { success, session } = this.getSession(session_id);

    if (!success) {
      this.logErrorSessionClientSocketAction(
        null,
        client_id,
        null,
        `tried to remove duplicate client from session, but failed to get session`
      );

      return;
    }

    if (session == null) {
      this.logErrorSessionClientSocketAction(
        null,
        client_id,
        null,
        `tried to remove duplicate client from session, but session was null`
      );

      return;
    }

    session.removeDuplicateClients(client_id);
  },

  removeClientFromSession: function (session_id, client_id) {
    let session = this.getSession(session_id);

    if (session == null) {
      this.logErrorSessionClientSocketAction(
        null,
        client_id,
        null,
        `tried to remove client from session, but session was null`
      );

      return false;
    }

    session.removeClient(client_id);

    this.logInfoSessionClientSocketAction(
      session_id,
      client_id,
      null,
      `Removed client from session.`
    );

    return true;
  },

  // returns true iff socket was successfully joined to session
  addSocketAndClientToSession: function (
    err,
    socket,
    session_id,
    client_id,
    do_bump_duplicates
  ) {
    var reason;

    if (!this.failedToJoinAction) {
      this.logWarningSessionClientSocketAction(
        session_id,
        client_id,
        null,
        `in addSocketAndClientToSession, failedToJoinAction callback was not provided. Proceeding anyways.`
      );
    }

    if (!socket) {
      reason = `tried to handle join, but socket was null`;

      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        null,
        reason
      );

      // don't call failedToJoinAction here because we don't have a socket.

      return false;
    }

    if (err) {
      reason = `Error joining client to session: ${err}`;

      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        reason
      );

      this.failedToJoinAction(session_id, reason);

      return false;
    }

    let session = this.getOrCreateSession(session_id);

    success = session.addClient(client_id);

    if (!success) {
      reason = `tried to make socket and client join session, but adding client to session failed.`;

      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        reason
      );
      
      this.failedToJoinAction(session_id, reason);

      return false;
    }

    this.bumpDuplicateSockets(
      session_id,
      client_id,
      do_bump_duplicates,
      socket.id
    );

    if (do_bump_duplicates) {
      session.removeDuplicateClients(client_id);
    }

    // socket to client mapping
    session.addSocket(socket, client_id);

    if (!this.successfullyJoinedAction) {
      this.logWarningSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        `in addSocketAndClientToSession, successfullyJoinedAction callback was not provided. Skipping.`
      );

      return true;
    }

    this.successfullyJoinedAction(session_id, client_id);
    
    return true;
  },

  makeSocketLeave: function (session_id, client_id) {
    if (!this.requestToLeaveSessionAction) {
      this.logWarningSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        `in makeSocketLeave, requestToLeaveSessionAction callback was not provided. Skipping.`
      );

      return;
    }

    this.requestToLeaveSessionAction(session_id, client_id);
  },

  tryToRemoveSocketAndClientFromSessionThenNotifyLeft: function (err, session_id, client_id, socket) {
    var success;
    var reason;
    
    if (!this.failedToLeaveAction) {
      this.logWarningSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        `in tryToRemoveSocketAndClientFromSessionThenNotifyLeft, failedToLeaveAction callback was not provided. Skipping.`
      );

      return;
    }

    if (!socket) {
      reason = `tryToRemoveSocketAndClientFromSessionThenNotifyLeft: socket was null`;

      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        null,
        reason
      );

      // don't call failedToLeaveAction here because we don't have a socket.

      return;
    }

    if (err) {
      reason = `Error joining client to session: ${err}`;
  
      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        err
      );

      this.failedToLeaveAction(session_id, reason);

      return;
    }

    success = session.removeSocket(socket);

    if (!success) {
      reason = `removeSocketFromSession failed`;

      this.failedToLeaveAction(session_id, reason);

      return;
    }

    success = session.removeClient(client_id);

    if (!success) {
      reason = `session.removeClient failed`;

      this.failedToLeaveAction(session_id, reason);

      return;
    }

    if (!this.successfullyLeftAction) {
      this.logWarningSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        `in removeSocketAndClientFromSession, successfullyLeftAction callback was not provided. Skipping.`
      );

      return;
    }

    this.successfullyLeftAction(session_id, client_id);
    
    this.logInfoSessionClientSocketAction(
      session_id,
      client_id,
      socket.id,
      `Left.`
    );
  },

  notifyBump: function (session_id, socket) {
    if (this.notifyBumpAction == null) {
      this.logWarningSessionClientSocketAction(
        session_id,
        client_id,
        socket_id,
        `notifyBumpAction callback was not provided`
      );
    }

    this.notifyBumpAction(session_id, socket);
  },

  makeSocketLeaveSession: function (session_id, socket) {
    if (this.makeSocketLeaveSessionAction == null) {
      this.logWarningSessionClientSocketAction(
        session_id,
        client_id,
        socket_id,
        `makeSocketLeaveSessionAction callback was not provided`
      );
    }

    this.makeSocketLeaveSessionAction(session_id, socket);
  },

  //TODO rewrite this so that do_bump_duplicates and socket_id become ids_to_keep
  bumpDuplicateSockets: function (
    session_id,
    client_id,
    do_bump_duplicates,
    socket_id
  ) {
    let session = this.getSession(session_id);

    if (session == null) {
      this.logErrorSessionClientSocketAction(
        null,
        client_id,
        socket_id,
        `tried to bump duplicate sockets, but session was null`
      );

      return;
    }

    let sockets;

    if (do_bump_duplicates) {
      sockets = session.getSocketsFromClientId(
        client_id,
        socket_id
      );
    } else {
      sockets = session.getSocketsFromClientId(client_id, null);
    }

    let self = this;

    if (!sockets) {
      this.logWarningSessionClientSocketAction(
        session_id,
        client_id,
        socket_id,
        `tried to bump duplicate sockets, but result of getSocketsFromClientId was null. Proceeding anyways.`
      );
    }

    sockets.forEach((socket) => {
      self.removeSocketAndClientFromSession(socket, session_id, client_id);

      self.notifyBump(session_id, socket);

      self.makeSocketLeaveSession(session_id, socket);

      self.disconnectSocket(socket, session_id, client_id);
    });
  },

  writeEventToConnections: function (event, session_id, client_id) {
    if (event && session_id && client_id) { //TODO(Brandon): support session_id = null and client_id = null
      if (!this.pool) {
        this.logErrorSessionClientSocketAction(
          session_id,
          client_id,
          null,
          "pool was null"
        );

        return;
      }

      if (this.pool == null) {
        this.logger.error(
          `Failed to log event to database: ${event}, ${session_id}, ${client_id}: this.pool was null`);

        return;
      }

      this.pool.query(
        "INSERT INTO connections(timestamp, session_id, client_id, event) VALUES(?, ?, ?, ?)",
        [Date.now(), session_id, client_id, event],

        (err, res) => {
          if (err != undefined) {
            this.logErrorSessionClientSocketAction(
              session_id,
              client_id,
              null,
              `Error writing ${event} event to database: ${err} ${res}`
            );
          }
        }
      );
    }
  },

  getClientIdFromSessionSocket: function (session_id, socket) {
    let session = this.getSession(session_id);

    if (session == null) {
      this.logErrorSessionClientSocketAction(
        null,
        client_id,
        null,
        `tried to get client ID from session socket, but session was null`
      );

      return null;
    }
  },

  getSessionSocketsFromClientId: function (
    session_id,
    client_id,
    excluded_socket_id
  ) {
    let session = this.getSession(session_id);

    if (session == null) {
      this.logErrorSessionClientSocketAction(
        null,
        client_id,
        null,
        `tried to get session sockets from client ID, but session was null`
      );

      return null;
    }

    return session.getSocketsFromClientId(client_id, excluded_socket_id);
  },

  isClientInSession: function (session_id, client_id) {
    let session = this.getSession(session_id);

    return session.hasClient(client_id);
  },

  // returns number of client instances of the same ID on success; returns -1 on failure;
  getNumClientInstancesForSession: function (session_id, client_id) {
    let session = this.getSession(session_id);

    if (session == null) {
      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        null,
        `Could not get number of client instances -- session was null`
      );

      return -1;
    }

    return session.getNumClientInstances(client_id);
  },

  // Return true iff removing the socket succeeded.
  removeSocketFromSession: function (socket, session_id) {
    let session = this.sessions.get(session_id);

    if (!session) {
      this.logWarningSessionClientSocketAction(
        session_id,
        null,
        null,
        `tried to removeSocketFromSession, but session was not found.`
      );

      return false;
    }

    return session.removeSocket(socket);
  },

  disconnectSocket: function (socket, session_id, client_id) {
    if (!socket) {
      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        null,
        `tried removing socket from session, but socket was null`
      );

      return;
    }

    if (!this.disconnectedAction) {
      this.logWarningSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        `in disconnectSocket, disconnectedAction callback was not provided`
      );
    }

    this.disconnectedAction(socket, session_id, client_id);
  },

  // cleanup socket and client references in session state if reconnect fails
  removeSocketAndClientFromSession: function (socket, session_id, client_id) {
    if (!socket) {
      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        null,
        `tried removing socket from session, but socket was null`
      );

      return;
    }

    let session = this.sessions.get(session_id);

    session.removeClient(client_id);

    session.removeSocket(socket);
  },

  getTotalNumInstancesForAllClientsForSession: function (session_id) {
    let session = this.sessions.get(session_id);

    if (!session) {
      this.logWarningSessionClientSocketAction(
        session_id,
        null,
        null,
        `tried to get number of clients for a session, but it was not found.`
      );

      return -1;
    }

    return session.getTotalNumInstancesForAllClients();
  },

  try_to_end_recording: function (session_id) {
    let session = this.sessions.get(session_id);

    if (!session) {
      this.logWarningSessionClientSocketAction(
        session_id,
        null,
        null,
        `tried to end recording for session ${session_id}, but it was not found.`
      );

      return;
    }

    if (!session.isRecording) {
      return;
    }

    this.logInfoSessionClientSocketAction(
      session_id,
      null,
      null,
      `Stopping recording for empty session`
    );

    this.end_recording(session_id);
  },

  // clean up session from sessions map if empty, write
  cleanUpSessionIfEmpty: function (session_id) {
    if (this.getNumClientInstancesForSession(session_id) >= 0) {
      // don't clean up if there are still clients in the session
      return;
    }

    this.logInfoSessionClientSocketAction(
      session_id,
      null,
      null,
      `Ending empty session`
    );

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

        session: _session,
      };
    }

    return {
      success: false,

      session: null,
    };
  },

  initialize_recording_writers: function () {},

  createSession: function (session_id) {
    this.logInfoSessionClientSocketAction(
      session_id,
      null,
      null,
      `Creating session: ${session_id}`
    );

    this.sessions.set(session_id, new Session());

    session = this.sessions.get(session_id);

    return session;
  },

  processReconnectionAttempt: function (err, socket, session_id, client_id) {
    let success = this.addSocketAndClientToSession(err, socket, session_id, client_id, true);

    if (!success) {
      this.logInfoSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        "failed to reconnect"
      );

      this.tryToRemoveSocketAndClientFromSessionAndNotifyLeft(socket, session_id, client_id);

      this.disconnectSocket(socket, session_id, client_id);

      this.cleanUpSessionIfEmpty(session_id);

      return false;
    }

    ////TODO does this need to be called here???? this.bumpOldSockets(session_id, client_id, socket.id);

    this.logInfoSessionClientSocketAction(
      session_id,
      client_id,
      socket.id,
      "successfully reconnected"
    );

    return true;
  },

  whoDisconnected: function (socket) {
    for (var s in this.sessions) {
      const session_id = s[0];

      let session = s[1];

      let { success, isInSession } = session.hasSocket(socket);

      if (!success || !isInSession) {
        // This isn't the right session, so keep looking.
        continue;
      }

      // We found the right session.
      return {
        session_id: session_id,

        client_id: session.getClientIdFromSocket(socket),
      };
    }

    return {
      session_id: null,

      client_id: null,
    };
  },

  doTryReconnecting: function (reason) {
    if (doReconnectOnUnknownReason) {
      return true;
    }

    return (DisconnectKnownReasons.hasOwnProperty(reason) &&
    DisconnectKnownReasons[reason].doReconnect);
  },

  // Returns true if socket is still connected
  handleDisconnect: function (socket, reason) {
    if (!socket) {
      this.logErrorSessionClientSocketAction(
        null,
        null,
        null,
        `tried handling disconnect, but socket was null`
      );

      return false;
    }

    if (!this.reconnectAction) {
      this.logErrorSessionClientSocketAction(
        null,
        null,
        socket.id,
        `in handleDisconnect, reconnectAction callback was not provided`
      );

      return false;
    }

    // Check disconnect event reason and handle
    const { session_id, client_id } = this.whoDisconnected(socket);

    if (session_id == null || client_id == null) {
      //socket not found in our records. This will happen for komodo-unity versions v0.3.2 and below, which handle "sync" actions on the main server namespace.
      this.logInfoSessionClientSocketAction(
        null,
        null,
        socket.id,
        `disconnected. Not found in sessions. Probably ok. Skipping reconnectAction, removeSocketAndClientFromSession, and/or DisconnectSocket.)`
      );

      return true;
    }

    if (this.doTryReconnecting(reason)) {
      // Try to reconnect the socket
      return this.reconnectAction(
        reason,
        socket,
        session_id,
        client_id,
        session
      );
    }

    // Disconnect the socket
    this.logInfoSessionClientSocketAction(
      session_id,
      client_id,
      socket.id,
      `Client was disconnected, probably because an old socket was bumped. Reason: ${reason}, clients: ${JSON.stringify(
        session.getClients()
      )}`
    );

    this.tryToRemoveSocketAndClientFromSessionThenNotifyLeft(socket, session_id, client_id);

    this.disconnectSocket(socket, session_id, client_id);

    this.cleanUpSessionIfEmpty(session_id);

    return false;
  },

  createCapturesDirectory: function () {
    if (!fs.existsSync(config.capture.path)) {
      this.logInfoSessionClientSocketAction(
        null,
        null,
        null,
        `Creating directory for session captures: ${config.capture.path}`
      );

      fs.mkdirSync(config.capture.path);
    }
  },

  getSessions: function () {
    return this.sessions;
  },

  initGlobals: function () {
    this.sessions = new Map();
  },

// Check if message payload is pre-parsed.
  // mutates data.message
  // returns data.message
  parseMessageIfNeeded: function (data, session_id, client_id) {
    // TODO(Brandon): evaluate whether to unpack here or keep as a string.
    if (typeof data.message == `object`) {
        //payload is already parsed.
        return data.message;
    }

    try {
        // parse and replace message payload
        data.message = JSON.parse(data.message);

        return data.message;
    } catch (e) {
        this.logWarningSessionClientSocketAction(session_id, client_id, "n/a",
        `Failed to parse 'interaction' message payload: ${data.message}; `
        );

        return data.message;
    }
  },

  getEntityFromState: function (session, id) {
    let i = session.entities.findIndex((candidateEntity) => candidateEntity.id == id);

    if (i == -1) {
        return null;
    }

    return session.entities[i];
  },

  applyShowInteractionToState: function (session, target_id) {
    let foundEntity = this.getEntityFromState(session, target_id);

    if (foundEntity == null) {
      this.logInfoSessionClientSocketAction("unk", "unk", "unk", `apply show interaction to state: no entity with target_id ${target_id} found. Creating one.`);
        
        let entity = {
            id: target_id,
            latest: data.message,
            render: true,
            locked: false,
        };

        session.entities.push(entity);
        
        return;
    }

    foundEntity.render = true;
  },

  applyHideInteractionToState: function (session, target_id) {
    let foundEntity = this.getEntityFromState(session, target_id);

    if (foundEntity == null) {
      this.logInfoSessionClientSocketAction("unk", "unk", "unk", `apply hide interaction to state: no entity with target_id ${target_id} found. Creating one.`);
        
        let entity = {
            id: target_id,
            latest: [],
            render: false,
            locked: false,
        };

        session.entities.push(entity);
        
        return;
    }

    foundEntity.render = false;
  },

  applyLockInteractionToState: function (session, target_id) {
    let foundEntity = this.getEntityFromState(session, target_id);

    if (foundEntity == null) {
        self.logInfoSessionClientSocketAction("unk", "unk", "unk", `apply lock interaction to state: no entity with target_id ${target_id} found. Creating one.`);
        
        let entity = {
            id: target_id,
            latest: [], // TODO(Brandon): investigate this. data.message?
            render: true,
            locked: true,
        };

        session.entities.push(entity);

        return;
    }

    foundEntity.locked = true;
  },

  applyUnlockInteractionToState: function (session, target_id) {
    let foundEntity = this.getEntityFromState(session, target_id);

    if (foundEntity == null) {
      this.logInfoSessionClientSocketAction("unk", "unk", "unk", `apply unlock interaction to state: no entity with target_id ${target_id} found. Creating one.`);
        
        let entity = {
            id: target_id,
            latest: [], // TODO(Brandon): investigate this. data.message?
            render: true,
            locked: false,
        };

        session.entities.push(entity);

        return;
    }

    foundEntity.locked = false;
  },

  applyStartMoveInteractionToState: function (session, target_id) {
  },

  applyEndMoveInteractionToState: function (session, target_id) {
  },

  applyDrawToState: function () {
  },

  applyEraseToState: function () {
  },

  applyInteractionMessageToState: function (session, target_id, interaction_type) {
    // entity should be rendered
    if (interaction_type == INTERACTION_RENDER) {
      this.applyShowInteractionToState(session, target_id);
    }

    // entity should stop being rendered
    if (interaction_type == INTERACTION_RENDER_END) {
      this.applyHideInteractionToState(session, target_id);
    }

    // scene has changed
    if (interaction_type == INTERACTION_SCENE_CHANGE) {
        session.scene = target_id;
    }

    // entity is locked
    if (interaction_type == INTERACTION_LOCK) {
      this.applyLockInteractionToState(session, target_id);
    }

    // entity is unlocked
    if (interaction_type == INTERACTION_LOCK_END) {
      this.applyUnlockInteractionToState(session, target_id);
    }
  },

  applyObjectsSyncToState: function (session, data) {
    let entity_id = data.message[KomodoMessages.sync.indices.entityId];

    let foundEntity = self.getEntityFromState(session, entity_id);

    if (foundEntity == null) {
      this.logInfoSessionClientSocketAction("unk", "unk", "unk", `apply sync message to state: no entity with target_id ${target_id} found. Creating one.`);
        
        let entity = {
            id: entity_id,
            latest: data.message,
            render: true,
            locked: false,
        };

        session.entities.push(entity);

        return;
    }

    foundEntity.latest = data.message;
  },

  applySyncMessageToState: function (session, data) {
    // update session state with latest entity positions

    let entity_type = data.message[KomodoMessages.sync.indices.entityType];

    if (entity_type == SYNC_OBJECTS) {
      this.applyObjectsSyncToState(session, data);
    }
  },

  processMessage: function (data, socket) {
    if (data == null) {
      this.logErrorSessionClientSocketAction(
        null,
        null,
        socket.id,
        "tried to process message, but data was null"
      );
    }
    
    let session_id = data.session_id;

    if (!session_id) {
      this.logErrorSessionClientSocketAction(
        null,
        null,
        socket.id,
        "tried to process message, but session_id was null"
      );

      return;
    }

    let client_id = data.client_id;

    if (!client_id) {
      this.logErrorSessionClientSocketAction(
        session_id,
        null,
        socket.id,
        "tried to process message, but client_id was null"
      );

      return;
    }

    let type = data.type;

    if (!type) {
      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        "tried to process message, but type was null"
      );

      return;
    }

    let session = self.sessions.get(session_id);

    if (!session) {
      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        "tried to process message, but session was not found"
      );

      return;
    }

    if (!data.message) {
      this.logErrorSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        "tried to process message, but data.message was null"
      );

      return;
    }
    
    // `message` here will be in the legacy packed-array format.

    // NOTE(rob): the following code is copypasta from the old interactionUpdate handler. 7/21/2021

    // check if the incoming packet is from a client who is valid for this session
    if (!this.isClientInSession(session_id, client_id)) {
        this.logErrorSessionClientSocketAction(session_id, client_id, socket.id, "tried to process message, but client was not in session.");

        return;
    }

    if (!data.message.length) {
        this.logErrorSessionClientSocketAction(session_id, client_id, socket.id, "tried to process message, but data.message.length was 0.");

        return;
    }
    
    // relay the message
    this.messageAction(socket, session_id, data);

    data.message = this.parseMessageIfNeeded(data, session_id, client_id);

    // get reference to session and parse message payload for state updates, if needed.
    if (type == KomodoMessages.interaction.type) {
        if (data.message.length != KomodoMessages.interaction.minLength) {
            this.logErrorSessionClientSocketAction(session_id, client_id, socket.id, "could not apply interaction message to state: data.message.length was incorrect");
    
            return;
        }
    
        let source_id = data.message[KomodoMessages.interaction.indices.sourceId];

        if (source_id == null) {
            this.logErrorSessionClientSocketAction(session_id, client_id, socket.id, "could not apply interaction message to state: source_id was null");
        }

        let target_id = data.message[KomodoMessages.interaction.indices.targetId];

        if (target_id == null) {
            this.logErrorSessionClientSocketAction(session_id, client_id, socket.id, "could not apply interaction message to state: target_id was null");
        }

        let interaction_type = data.message[KomodoMessages.interaction.indices.interactionType];

        if (interaction_type == null) {
            this.logErrorSessionClientSocketAction(session_id, client_id, socket.id, "could not apply interaction message to state: interaction_type was null");
        }

        this.applyInteractionMessageToState(session, target_id, interaction_type);
    }

    if (type == KomodoMessages.sync.type) {
      this.applySyncMessageToState(e, id, latest, render, locked);
    }

    // data capture
    if (session.isRecording) {
      this.record_message_data(data);
    }
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

    this.logInfoSessionClientSocketAction(
      "Session ID",
      "Client ID",
      "Socket ID",
      "Message"
    );

    if (pool == null) {
      if (this.logger) this.logger.warn("No MySQL Pool was found.");
    }

    this.pool = pool;

    let self = this;

    if (io == null) {
      if (this.logger) this.logger.warn("No SocketIO server was found.");
    }

    this.connectionAuthorizationErrorAction = function (socket, message) {
      socket.emit(KomodoSendEvents.connectionError, message);
    };

    this.messageAction = function (socket, session_id, data) {
      socket.to(session_id.toString()).emit(KomodoSendEvents.message, data);
    };

    this.notifyBumpAction = function (session_id, socket) {
      self.logInfoSessionClientSocketAction(
        session_id,
        null,
        socket.id,
        `Notifying about bump`
      );

      // Let the client know it has been bumped
      socket.emit(KomodoSendEvents.notifyBump, session_id);
    };

    this.makeSocketLeaveSessionAction = function (session_id, socket) {
      socket.leave(session_id.toString(), (err) => {
        this.failedToLeaveAction(session_id, `Failed to leave during bump: ${err}.`);
      });
    };

    // TODO(Brandon) -- review if this function is needed. I detached it 10/16/21.
    this.disconnectSocketAfterDelayAction = function (session_id, socket) {
      self.logInfoSessionClientSocketAction(
        session_id,
        null,
        socket.id,
        `Disconnecting: ...`
      );

      setTimeout(() => {
        socket.disconnect(true);

        self.logInfoSessionClientSocketAction(
          session_id,
          null,
          socket.id,
          `Disconnecting: Done.`
        );
      }, 500); // delay half a second and then bump the old socket
    };

    this.requestToJoinSessionAction = function (session_id, client_id) {
      socket.join(session_id.toString(), (err) => {
        self.addSocketAndClientToSession(
          err,
          socket,
          session_id,
          client_id,
          true
        );
      });
    };

    this.failedToJoinAction = function (session_id, reason) {
      socket.emit(KomodoSendEvents.failedToJoin, session_id, reason);
    };

    this.successfullyJoinedAction = function (session_id, client_id) {
      // write join event to database
      self.writeEventToConnections("connect", session_id, client_id);

      // tell other clients that a client joined
      io.to(session_id.toString()).emit(KomodoSendEvents.clientJoined, client_id);

      // tell the joining client that they successfully joined
      socket.emit(KomodoSendEvents.successfullyJoined, session_id);
    };

    this.requestToLeaveSessionAction = function (session_id, client_id) {
      socket.leave(session_id.toString(), (err) => {
        self.tryToRemoveSocketAndClientFromSessionThenNotifyLeft(err, session_id, client_id, socket);
      });
    };

    this.failedToLeaveAction = function (session_id, reason) {
      socket.emit(KomodoSendEvents.failedToLeave, session_id, reason);
    };

    this.successfullyLeftAction = function (session_id, client_id) {
      // notify others the client has left
      io.to(session_id.toString()).emit(KomodoSendEvents.left, client_id);

      // tell the leaving client that they successfully left
      socket.emit(KomodoSendEvents.successfullyLeft, session_id);
    };

    this.disconnectedAction = function (socket, session_id, client_id) {
      // notify others the client has disconnected
      socket
        .to(session_id.toString())
        .emit(KomodoSendEvents.disconnected, client_id);
    };

    this.stateErrorAction = function (socket, message) {
      socket.emit(KomodoSendEvents.stateError, message);
    };

    // returns true for successful reconnection
    this.reconnectAction = function (
      reason,
      socket,
      session_id,
      client_id,
      session
    ) {
      self.logInfoSessionClientSocketAction(
        session_id,
        client_id,
        socket.id,
        `Client was disconnected; attempting to reconnect. Disconnect reason: , clients: ${JSON.stringify(
          session.getClients()
        )}`
      );

      //TODO -- do we need to rejoin it manually?
      socket.join(session_id.toString(), (err) => {
        self.processReconnectionAttempt(err, socket, session_id, client_id);
      });
    };

    // main relay handler
    io.on(KomodoReceiveEvents.connection, function (socket) {
      self.logInfoSessionClientSocketAction(
        null,
        null,
        socket.id,
        `Session connection`
      );

      socket.on(KomodoReceiveEvents.sessionInfo, function (session_id) {
        let session = self.sessions.get(session_id);

        if (!session) {
          self.logWarningSessionClientSocketAction(
            session_id,
            null,
            socket.id,
            `Requested session, but it does not exist.`
          );

          return;
        }

        socket.to(session_id.toString()).emit(KomodoSendEvents.sessionInfo, session);
      });

      socket.on(KomodoReceiveEvents.requestToJoinSession, function (data) {
        let session_id = data[0];

        let client_id = data[1];

        self.logInfoSessionClientSocketAction(
          session_id,
          client_id,
          socket.id,
          `Asked to join`
        );

        if (!client_id || !session_id) {
          self.connectionAuthorizationErrorAction(
            socket,
            "You must provide a client ID and a session ID in the URL options."
          );

          return;
        }

        //TODO does this need to be called here???? self.bumpOldSockets(session_id, client_id, socket.id);

        if (!this.requestToJoinSessionAction) {
          self.logErrorSessionClientSocketAction(
            session_id,
            client_id,
            socket.id,
            `in socket.on(${KomodoReceiveEvents.requestToJoinSession}), requestToJoinSessionAction callback was not provided`
          );

          return;
        }

        this.requestToJoinSessionAction(session_id, client_id);
      });

      // When a client requests a state catch-up, send the current session state. Supports versioning.
      socket.on(KomodoReceiveEvents.requestOwnStateCatchup, function (data) {
        let { session_id, state } = self.handleState(socket, data);

        if (session_id == -1 || !state) {
          self.logWarningSessionClientSocketAction(
            session_id,
            null,
            socket.id,
            "state was null"
          );

          return;
        }

        try {
          // emit versioned state data
          socket.emit(KomodoSendEvents.state, state); // Behavior as of 10/7/21: Sends the state only to the client who requested it.
        } catch (err) {
          this.logErrorSessionClientSocketAction(
            session_id,
            null,
            socket.id,
            err.message
          );
        }
      });

      socket.on(KomodoReceiveEvents.draw, function (data) {
        let session_id = data[1];

        let client_id = data[2];

        if (!session_id) {
          this.logErrorSessionClientSocketAction(
            null,
            client_id,
            socket.id,
            "tried to process draw event, but there was no session_id."
          );

          return;
        }

        if (!client_id) {
          this.logWarningSessionClientSocketAction(
            session_id,
            null,
            socket.id,
            "tried to process draw event, but there was no client_id. Proceeding anyways."
          );

          return;
        }

        socket.to(session_id.toString()).emit(KomodoSendEvents.draw, data);
      });

      // general message relay
      // TODO(rob): this is where all event data will eventually end up
      // we will be doing compares on the data.type value for to-be-defined const values
      // of the various interactions we care about, eg. grab, drop, start/end recording, etc.
      // in order to update the session state accordingly. we will probably need to protect against
      // garbage values that might be passed by devs who are overwriting reserved message events.
      socket.on(KomodoReceiveEvents.message, function (data) {
        if (socket == null) {
          this.logErrorSessionClientSocketAction(
            null,
            null,
            null,
            "tried to process message, but socket was null"
          );
        }

        self.processMessage(data, socket);
      });

      // client position update handler
      socket.on(KomodoReceiveEvents.update, function (data) {
        if (!self.isValidRelayPacket(data)) {
          return;
        }

        let session_id = data[1];

        // relay packet if client is valid
        socket
          .to(session_id.toString())
          .emit(KomodoSendEvents.relayUpdate, data);

        // self.writeRecordedRelayData(data); NOTE(rob): DEPRECATED. 8/5/21.

        self.updateSessionState(data);
      });

      // handle interaction events
      // see `INTERACTION_XXX` declarations for type values
      socket.on(KomodoReceiveEvents.interact, function (data) {
        self.handleInteraction(socket, data);
      });

      // session capture handler
      socket.on(KomodoReceiveEvents.start_recording, function (session_id) {
        self.start_recording(pool, session_id);
      });

      socket.on(KomodoReceiveEvents.end_recording, function (session_id) {
        self.end_recording(pool, session_id);
      });

      socket.on(KomodoReceiveEvents.playback, function (data) {
        self.handlePlayback(io, data);
      });

      socket.on(SocketIOEvents.disconnect, function (reason) {
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

      socket.on(SocketIOEvents.disconnecting, function (reason) {
      });

      socket.on(SocketIOEvents.error, function (err) {
        self.logErrorSessionClientSocketAction(null, null, socket.id || "null", err);
      });
    });
  },
};
