// University of Illinois/NCSA
// Open Source License
// http://otm.illinois.edu/disclose-protect/illinois-open-source-license

// Copyright (c) 2026 Grainger Engineering Library Information Center.  All rights reserved.

// Developed by: IDEA Lab
//               Grainger Engineering Library Information Center - University of Illinois Urbana-Champaign
//               https://library.illinois.edu/enx

// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal with
// the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
// of the Software, and to permit persons to whom the Software is furnished to
// do so, subject to the following conditions:
// * Redistributions of source code must retain the above copyright notice,
//   this list of conditions and the following disclaimers.
// * Redistributions in binary form must reproduce the above copyright notice,
//   this list of conditions and the following disclaimers in the documentation
//   and/or other materials provided with the distribution.
// * Neither the names of IDEA Lab, Grainger Engineering Library Information Center,
//   nor the names of its contributors may be used to endorse or promote products
//   derived from this Software without specific prior written permission.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
// CONTRIBUTORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS WITH THE
// SOFTWARE.

/* jshint esversion: 6 */

// Shared-secret authentication middleware for the Socket.IO namespaces.
//
// Clients pass the secret as an `auth` query parameter on the connection,
// e.g. io('https://relay.example.edu/sync?auth=<secret>') or
// io(url, { query: { auth: '<secret>' } }).
//
// Secrets are configured in config.js:
//
//   auth: {
//       clientSecret: '...',   // required for /sync and /chat when set
//       adminSecret: '...'     // required for /admin; /admin rejects ALL
//                              // connections while this is unset
//   }

const crypto = require('crypto');
const config = require('./config');

const clientSecret = (config.auth && config.auth.clientSecret) || '';
const adminSecret = (config.auth && config.auth.adminSecret) || '';

// Compare hashes so the comparison is constant-time regardless of input length.
function secretMatches(provided, expected) {
    const providedHash = crypto.createHash('sha256').update(String(provided)).digest();
    const expectedHash = crypto.createHash('sha256').update(String(expected)).digest();

    return crypto.timingSafeEqual(providedHash, expectedHash);
}

function getProvidedSecret(socket) {
    return (socket.handshake && socket.handshake.query && socket.handshake.query.auth) || '';
}

module.exports = {
    // Middleware for the /sync and /chat namespaces. When no clientSecret is
    // configured, connections are allowed (backwards-compatible) and a
    // warning is logged at startup.
    clientAuth: function (namespaceName, logger) {
        if (!clientSecret) {
            if (logger) logger.warn(`auth.clientSecret is not set in config.js - connections to ${namespaceName} are NOT authenticated. Set it to require a shared secret.`);

            return function (socket, next) {
                next();
            };
        }

        return function (socket, next) {
            if (secretMatches(getProvidedSecret(socket), clientSecret)) {
                return next();
            }

            if (logger) logger.warn(`Rejected connection to ${namespaceName} with missing or invalid auth token (socket ${socket.id})`);

            next(new Error('unauthorized'));
        };
    },

    // Middleware for the /admin namespace. Deny-by-default: when no
    // adminSecret is configured, every connection is rejected.
    adminAuth: function (logger) {
        if (!adminSecret) {
            if (logger) logger.warn(`auth.adminSecret is not set in config.js - ALL connections to /admin will be rejected. Set it to enable the admin dashboard.`);

            return function (socket, next) {
                next(new Error('unauthorized'));
            };
        }

        return function (socket, next) {
            if (secretMatches(getProvidedSecret(socket), adminSecret)) {
                return next();
            }

            if (logger) logger.warn(`Rejected connection to /admin with missing or invalid auth token (socket ${socket.id})`);

            next(new Error('unauthorized'));
        };
    }
};
