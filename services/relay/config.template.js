module.exports = {
    db: {
        user: "",
        host: "",
        database: "",
        password: "",
        port: "",
        ssl: {
            rejectUnauthorized: false
        }
    },
    cors: {
        origins: [
            'http://localhost',
            'https://localhost'
        ]
    },
    auth: {
        // Shared secret clients must send (as the `auth` query parameter on
        // the Socket.IO connection) to use /sync and /chat.
        // Empty string = no authentication (a warning is logged).
        clientSecret: "",
        // Shared secret required for the /admin diagnostics namespace.
        // Empty string = /admin rejects ALL connections.
        adminSecret: ""
    },
    rtc: {
        // STUN/TURN servers handed to WebRTC clients connecting to /rtc.
        // Empty array = public Google STUN servers (fine on one network;
        // add a TURN server for participants behind strict NATs), e.g.:
        // [
        //     { urls: ['stun:stun.l.google.com:19302'] },
        //     { urls: ['turn:turn.example.edu:3478'], username: '...', credential: '...' }
        // ]
        iceServers: []
    },
    azure: {
        subscriptionKey: "",
        serviceRegion: ""
    },
    capture: {
        path: './captures/',
    },
};
