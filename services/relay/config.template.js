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
    azure: {
        subscriptionKey: "",
        serviceRegion: ""
    },
    sync: {
        POS_FIELDS: 14,
        POS_BYTES_PER_FIELD: 4,
        POS_COUNT: 10000,
        INT_FIELDS: 7,
        INT_BYTES_PER_FIELD: 4,
        INT_COUNT: 128
    },
    capture: {
        path: './captures/',
    },
};