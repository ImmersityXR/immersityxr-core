// Immersity Portal backend configuration.
//
// Copy this file to config.js in the same directory and fill in the values.
// It is mounted into the portal backend container at
// /immersity/portal/backend/config.js (see docker-compose.yml).
//
// config.js is gitignored because it holds secrets - never commit it.

module.exports = {
    mysql: {
        // MariaDB runs inside the backend container, so host stays localhost.
        // user/password/database must match PORTAL_MYSQL_* in your .env.
        host: 'localhost',
        user: 'immersity',
        password: '',
        database: 'immersity',
        port: '3306',
    },
    cors: {
        // Origins allowed to call the API (no trailing slash).
        // Must include the portal frontend URL (https://PORTAL_DOMAIN).
        origins: [
            'https://portal.yourdomain.edu'
        ]
    },
    web: {
        // Any long random phrase, used to encrypt the session cookie
        session_secret: '',
        port: '4040',
        socketIOPort: '',
    },
    aws: {
        // S3 bucket used for 3D asset uploads (leave empty to disable uploads)
        accessKeyId: '',
        secretAccessKey: '',
        region: '',
        bucket: ''
    },
    // Any long random phrase, used to sign login JWTs
    jwt: '',
    // Twilio TURN credentials (only needed for WebRTC media chat,
    // which is currently disabled in the portal)
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: ''
};
