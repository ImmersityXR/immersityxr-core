class Session {
  constructor(session_id) {
    this.id = session_id;
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

  // Returns success = true if operation succeeded or false if socket or session with session_id were null.
  // Returns isInSession if socket is in this.sockets.
  hasSocket(socket) {
    if (!socket) {
      this.logWarningSessionClientSocketAction(
        session_id,
        null,
        null,
        `hasSocket: socket was null.`
      );

      return {
        success: false,
        isInSession: null,
      };
    }

    let session = this.sessions.get(session_id);

    if (!session) {
      this.logWarningSessionClientSocketAction(
        session_id,
        null,
        socket.id,
        `Could not find session when trying to remove a socket from it.`
      );

      return {
        success: false,
        isInSession: null,
      };
    }

    return {
      success: true,
      isInSession: socket.id in this.sockets,
    };
  }

  removeSocket(socket) {
    let { success, isInSession } = this.hasSocket(socket);

    if (!success || isInSession == null) {
      this.logErrorSessionClientSocketAction(
        session_id,
        null,
        socket.id,
        `tried removing socket from this.sockets, but there was an error.`
      );

      return false;
    }

    if (!isInSession) {
      this.logWarningSessionClientSocketAction(
        session_id,
        null,
        socket.id,
        `tried removing socket from this.sockets, but it was not found.`
      );

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
      this.logErrorSessionClientSocketAction(
        this.id,
        client_id,
        null,
        `tried to remove client from session, but this.clients was null`
      );

      return false;
    }

    let index = this.clients.indexOf(client_id);

    if (this.clients.length == 0 || this.clients.indexOf(client_id) == -1) {
      //client_id is not in the array, so we don't need to remove it.
      this.logWarningSessionClientSocketAction(
        null,
        null,
        client_id,
        `Tried removing client from this.clients, but it was not there.`
      );

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
    const numInstances = this.getNumClientInstances(session_id, client_id);

    if (numInstances >= 1) {
        return true;
    }

    return false;
  }

  getNumClientInstances(client_id) {
    if (this.clients == null) {
        this.logErrorSessionClientSocketAction(
            session_id,
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
        session_id,
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

export default Session;
