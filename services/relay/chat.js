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

const mkdirp = require('mkdirp');

const speechToTextServer = require('./speech-to-text');

var chats = new Map();

module.exports = {
    init: function (io, logger) {
        // server namespace for chat signaling and messaging
        var chat = io.of('/chat');

        chat.on('connection', function(socket) {
            // TODO(Brandon): log connection here

            // setup text chat relay
            socket.on('micText', function(data) {
                let session_id = data.session_id;
                io.of('chat').to(session_id).emit('micText', data);
            });

            socket.on('message', function(data) {
                if (data.session_id && data.client_id) {
                    socket.to(data.session_id.toString()).emit('message', data);
                }
            });

            socket.on('join', function(data) {
                let session_id = data[0];
                let client_id = data[1];
                if (client_id && session_id) {
                    if (!chats.get(session_id)) {
                        // empty chat state tracker
                        chats.set(session_id, { sockets: {} });
                    }

                    socket.join(session_id.toString(), function (err) {
                        if (err) { console.log(err); }
                        else {
                            if (logger) logger.info(`Client joined chat: ${data}`);
                            io.of('chat').to(session_id.toString()).emit('joined', data);
                            let chat = chats.get(session_id);
                            chat.sockets[socket.id] = client_id;
                        }
                    });
                }
            });

            socket.on('disconnect', function(reason) {
                // find which session this socket is in
                for (var c of chats) {
                    let session_id = c[0];

                    let chat = c[1];

                    if (!(socket.id in chat.sockets)) {
                        continue;
                    }

                    // remove socket -> client mapping
                    if (logger) logger.info(`Client disconnected from chat: ${chat.sockets[socket.id]}`);

                    delete chat.sockets[socket.id];

                    // remove chat session if empty
                    if (Object.keys(chat.sockets).length <= 0) {
                        if (logger) logger.info(`Chat session is empty, removing: ${session_id}`);

                        delete chat;
                    }

                    return;
                }

                if (logger) logger.error(`tried disconnecting chat socket ${socket.id}, but it was not found.`);
            });

            // client audio processing
            socket.on('mic', function(data) {
                let session_id = data.session_id;
                let client_id = data.client_id;

                if (session_id && client_id) {
                    // write to disk if recording
                    let session = sessions.get(session_id);
                    if (session) {
                        // speech-to-text
                        try {
                            speechToTextServer.processSpeech(data.blob, session_id, client_id, data.client_name, logger);
                        } catch (error) {
                            if (logger) logger.error(`Error processing speech-to-text: ${client_id}, session: ${session_id}, error: ${error}`);
                        }

                        // TODO(rob): Mar 3 2021 -- audio recording on hold to focus on data playback. 
                        // if (session.isRecording) {
                        //     let seq = Date.now() - session.recordingStart;
                        //     let dir = `${CAPTURE_PATH}/${session_id}/${session.recordingStart}/audio/${client_id}`;
                        //     let path = `${dir}/${seq}.wav`

                        //     mkdirp(dir).then(made => {
                        //         if (made) console.log('Creating audio dir: ', made);
                        //         fs.writeFile(path, data.blob, (err) => {
                        //             if (err) console.log('error writing audio file:', err)
                        //         });
                        //     })
                        // }
                    }
                }
            });
        });

        logger.info(`Chat namespace is waiting for connections...`);

        return chat;
    }
};
