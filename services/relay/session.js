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

class Session {
  constructor(id) {
    this.id = id;
    this.sockets = {}; // socket.id -> client_id
    this.clients = [];
    this.entities = [];
    this.scene = null;
    this.isRecording = false;
    this.start = Date.now();
    this.recordingStart = 0;
    this.seq = 0;
    // NOTE(rob) = DEPRECATED; use message_buffer. 8/3/2021
    // writers = {
    //     pos = {
    //         buffer = Buffer.alloc(this.positionWriteBufferSize());
    //         cursor = 0
    //     };
    //     int = {
    //         buffer = Buffer.alloc(this.interactionWriteBufferSize());
    //         cursor = 0
    //     }
    // };
    this.message_buffer = [];
  }

  getId() {
    return this.id;
  }

  getSockets() {
      return this.sockets;
  }

  addSocket(socket, client_id) {
    this.sockets[socket.id] = { client_id: client_id, socket: socket };
  }

  // Returns success = true if operation succeeded or false if socket or session with id were null.
  // Returns isInSession if socket is in this.sockets.
  hasSocket(socket) {
    return socket.id in this.sockets;
  }

  removeSocket(socket) {
    let isInSession = this.hasSocket(socket);

    if (!isInSession) {
      return false;
    }

    delete this.sockets[socket.id];

    return true;
  }

  getSocketsFromClientId(client_id, excluded_socket_id) {
    if (this.sockets == null) {
      this.logErrorSessionClientSocketAction(
        this.id,
        client_id,
        null,
        `tried to get session sockets from client ID, but this.sockets was null`
      );

      return null;
    }

    var result = [];

    for (var candidate_socket_id in this.sockets) {
      let isCorrectId =
        this.sockets[candidate_socket_id].client_id == client_id;

      let doExclude =
        this.sockets[candidate_socket_id].socket.id == excluded_socket_id;

      if (isCorrectId && !doExclude) {
        result.push(this.sockets[candidate_socket_id].socket);
      }
    }

    return result;
  }

  getClients() {
      return this.clients;
  }

  addClient(client_id) {
    if (
      this.clients == null ||
      typeof this.clients === "undefined" ||
      this.clients.length == 0
    ) {
      this.clients = [client_id];

      return true;
    }

    this.clients.push(client_id);

    return true;
  }

  removeClient(client_id) {
    if (this.clients == null) {
      return false;
    }

    let index = this.clients.indexOf(client_id);

    if (this.clients.length == 0 || this.clients.indexOf(client_id) == -1) {
      //client_id is not in the array, so we don't need to remove it.
      return false;
    }

    this.clients.splice(index, 1);
  }

  removeDuplicateClients(client_id) {
    if (this.clients == null) {
      this.logErrorSessionClientSocketAction(
        this.id,
        client_id,
        null,
        `tried to remove duplicate client from session, but this.clients was null`
      );

      return;
    }

    if (this.clients.length == 0) {
      return;
    }

    const first_instance = this.clients.indexOf(client_id);

    for (let i = 0; i < this.clients.length; i += 1) {
      if (i != first_instance && this.clients[i] == client_id) {
        this.clients.splice(i, 1);
      }
    }
  }

  hasClient (client_id) {
    const numInstances = this.getNumClientInstances(client_id);

    if (numInstances >= 1) {
        return true;
    }

    return false;
  }

  getNumClientInstances(client_id) {
    if (this.clients == null) {
        this.logErrorSessionClientSocketAction(
            this.id,
            client_id,
            null,
            `Could not get number of client instances -- session was null or session.clients was null.`
        );

        return -1;
    }

    var count = 0;

    this.clients.forEach((value) => {
      if (value == client_id) {
        count += 1;
      }
    });

    return count;
  }

  getTotalNumInstancesForAllClients () {
    if (this.clients == null) {
      this.logWarningSessionClientSocketAction(
        this.id,
        null,
        null,
        `the session's session.clients was null.`
      );

      return -1;
    }

    return session.clients.length;
  }

  getClientIdFromSocket(socket) {
    if (this.sockets == null) {
      this.logErrorSessionClientSocketAction(
        this.id,
        client_id,
        null,
        `tried to get client ID from session socket, but this.sockets was null`
      );

      return null;
    }

    if (socket.id == null) {
      this.logErrorSessionClientSocketAction(
        this.id,
        client_id,
        null,
        `tried to get client ID from session socket, but socket.id was null`
      );

      return null;
    }

    if (this.sockets[socket.id] == null) {
      this.logErrorSessionClientSocketAction(
        this.id,
        client_id,
        null,
        `tried to get client ID from session socket, but this.sockets[socket.id] was null`
      );

      return null;
    }

    return this.sockets[socket.id].client_id;
  }
}

module.exports = Session;
