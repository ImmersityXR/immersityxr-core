// ===========================================================================
// ImmersityXR Relay Server Configuration
// ===========================================================================
// Values come from environment variables set in docker-compose.yml / .env.

module.exports = {
    // Database connection (optional - leave empty strings if not using)
    db: {
        user: "",
        host: "",
        database: "",
        password: "",
        port: "",
        ssl: { rejectUnauthorized: false }
    },

    // CORS configuration. RELAY_ORIGINS in .env is a space-separated list,
    // e.g. "https://yourdomain.edu:443 https://portal.yourdomain.edu:443";
    // the fallback only allows localhost. Socket.IO 4 matches the browser's
    // Origin header exactly, and browsers omit default ports, so those are
    // stripped here (the old host:port form was for Socket.IO 2).
    cors: {
        origins: (process.env.RELAY_ORIGINS || "http://localhost:80 https://localhost:443")
            .split(/\s+/)
            .filter(Boolean)
            .map(function (origin) {
                return origin.replace(/^(https:\/\/[^/]+):443$|^(http:\/\/[^/]+):80$/, "$1$2");
            })
    },

    // Shared-secret authentication (requires a relay image built from a
    // version that includes auth support - see docs/ARCHITECTURE.md).
    // Older images ignore this section.
    auth: {
        // Required from VR clients and the portal to use /sync and /chat.
        // Empty = no client authentication (a warning is logged).
        clientSecret: process.env.RELAY_CLIENT_SECRET || "",
        // Required for the /admin diagnostics dashboard.
        // Empty = /admin rejects all connections.
        adminSecret: process.env.RELAY_ADMIN_SECRET || ""
    },

    // STUN/TURN servers for WebRTC voice/video (the /rtc namespace hands
    // these to clients). Defaults to public Google STUN, which works when
    // all participants can reach each other directly; set the RTC_TURN_*
    // variables in .env to support participants behind strict NATs.
    rtc: {
        iceServers: [
            {
                urls: (process.env.RTC_STUN_URLS || 'stun:stun.l.google.com:19302 stun:stun1.l.google.com:19302').split(' ')
            }
        ].concat(process.env.RTC_TURN_URL ? [{
            urls: [process.env.RTC_TURN_URL],
            username: process.env.RTC_TURN_USERNAME || '',
            credential: process.env.RTC_TURN_CREDENTIAL || ''
        }] : [])
    },

    // Azure Speech-to-Text (optional - leave empty strings if not using)
    azure: {
        subscriptionKey: "",
        serviceRegion: ""
    },

    // Capture storage path (relative to container /immersity directory).
    // entityIds is written to each capture's manifest so analysis knows how
    // clients numbered a model's parts: 'import-order' or 'gltf-node'.
    capture: {
        path: './captures/',
        entityIds: process.env.CAPTURE_ENTITY_IDS || 'import-order'
    },

    // Base URL of the portal API (or a static stand-in). When set, each
    // capture's manifest lists the lab's assets from <url>/labs/<session id>.
    portal: {
        url: process.env.RELAY_PORTAL_API_URL || ""
    },

    // Session state persistence: shared state (entities, scene, draw
    // strokes) is snapshotted to disk and restored on restart or when a
    // session is rejoined later, so late joiners see previous changes.
    // The sessions directory is volume-mounted in docker-compose.yml.
    persistence: {
        enabled: true,
        path: './sessions/',
        snapshotIntervalMs: 10000,
        // stored state expires after this many hours (default: 7 days)
        ttlHours: parseInt(process.env.SESSION_STATE_TTL_HOURS, 10) || 168
    }
};
