module.exports = {
    config_hint: 'use single quotes only for maximum compatibility with GitHub Actions scripts',
    mysql: {
        host: '',
        user: '',
        password: '',
        database: '',
        port: '',
    },
    cors: {
        origins: [
            'http://localhost:8080'
        ]
    },
    cors_hint: 'comma-separated list of origins (no trailing slash) for build server, analytics server, front end',
    mysql_hint: 'find config values from setenv.sh or environment variables starting with MYSQL_',
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

