module.exports = {
    mysql: {
        host: '',
        user: '',
        password: '',
        database: '',
        port: '',
    },
    mysql_hint: 'find config values from immersity-db environment variables',
    web: {
        session_secret: '',
        hint_session_secret: 'any phrase to encrypt the session cookie',
        port: '',
        socketIOPort: '',
    },
    aws: {
        accessKeyId: '',
        secretAccessKey: '',
        region: '',
        bucket: ''
    },
    jwt: '',
    jwt_hint: 'any phrase to encrypt the session cookie',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: ''
};

