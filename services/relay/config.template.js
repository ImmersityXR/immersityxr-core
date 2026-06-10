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
    azure: {
        subscriptionKey: "",
        serviceRegion: ""
    },
    capture: {
        path: './captures/',
    },
};
