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

// speech-to-text
// docs: https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/speech-to-text

const config = require('./config');

const sdk = require("microsoft-cognitiveservices-speech-sdk");

const subscriptionKey = config.azure.subscriptionKey;

const serviceRegion = config.azure.serviceRegion; // e.g., "westus"

// used to convert raw audio pcm data into format ready for speech-to-text
function convertFloat32ToInt16(buffer) {
    l = buffer.length;
    buf = new Int16Array(l);
    while (l--) {
      buf[l] = Math.min(1, buffer[l])*0x7FFF;
    }

    return buf;
}

module.exports = {
    processSpeech: function (audioBuffer, session_id, client_id, client_name, logger) {
        // create the push stream we need for the speech sdk.
        var pushStream = sdk.AudioInputStream.createPushStream();
    
        // open the file and push it to the push stream.
        pushStream.write(audioBuffer);
        pushStream.close();
    
        // now create the audio-config pointing to our stream and
        // the speech config specifying the language.
        var audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
        var speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);
    
        // setting the recognition language to English.
        speechConfig.speechRecognitionLanguage = "en-US";
    
        // create the speech recognizer.
        var recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    
        // start the recognizer and wait for a result.
        recognizer.recognizeOnceAsync(
            function (result) {
                if (result.privText) {
                    io.of('chat').to(session_id.toString()).emit('micText', { 
                        ts: Date.now(), 
                        session_id: session_id, 
                        client_id: client_id,
                        client_name: client_name,
                        text: result.privText, 
                        type: "speech-to-text" 
                    });
                    let session = sessions.get(session_id);
                    if (session) {
                        if (session.isRecording) {
                            let sttObj = {
                                ts: Date.now(),
                                session_id: session_id,
                                client_id: client_id,
                                text: result.privText
                            }

                            let path = getCapturePath(session_id, session.recordingStart, 'stt');
                            let wstream = fs.createWriteStream(path, { flags: 'a' })
                            wstream.write(JSON.stringify(sttObj)+'\n');
                            wstream.close();
                        }
                    }
                }

                try {
                    recognizer.close();            
                } catch (error) {
                    if (logger) logger.error(`Error closing SpeechRecognizer: ${error}`);
                }
            },
            function(err) {
                if (logger) logger.error(`Error recognizing speech-to-text: ${err}`);
                try {
                    recognizer.close();
                } catch (error) {
                    if (logger) logger.error(`Error closing SpeechRecognizer: ${error}`);
                }
            }
        );
    }        
}