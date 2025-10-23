// ===========================================================================
// Immersity Relay Server Configuration
// ===========================================================================

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
    
    // CORS configuration
    cors: {
        origins: "*:*"
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

