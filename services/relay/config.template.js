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
    azure: {
        subscriptionKey: "",
        serviceRegion: ""
    },
    capture: {
        path: './captures/',
    },
};