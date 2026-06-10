// ===========================================================================
// Immersity Relay Server Configuration
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

    // CORS configuration. Space-separated list of allowed origins in
    // host:port form, e.g. "https://yourdomain.edu:443 https://portal.yourdomain.edu:443".
    // Set RELAY_ORIGINS in .env; the fallback only allows localhost.
    cors: {
        origins: process.env.RELAY_ORIGINS || "http://localhost:80 https://localhost:443"
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

    // Azure Speech-to-Text (optional - leave empty strings if not using)
    azure: {
        subscriptionKey: "",
        serviceRegion: ""
    },

    // Capture storage path (relative to container /immersity directory)
    capture: {
        path: './captures/'
    }
};
