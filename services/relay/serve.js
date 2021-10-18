// University of Illinois/NCSA
// Open Source License
// http://otm.illinois.edu/disclose-protect/illinois-open-source-license

// Copyright (c) 2020 Grainger Engineering Library Information Center.  All rights reserved.

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

const io = require('socket.io')();

const mysql = require('mysql2');

const syncServer = require('./sync');

const chatServer = require('./chat');

const adminServer = require('./admin');

const config = require('./config');

// set up logging
const { createLogger, format, transports } = require('winston');

const { combine, timestamp, printf } = format;

const printFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

const logger = createLogger({
    format: combine(

        timestamp(),

        printFormat
    ),
    transports: [

        new transports.Console(),
        new transports.File({ filename: 'log.txt' })
    ],
    exitOnError: false
});

let pool;

if (config.db.host && config.db.host != "") {
    pool = mysql.createPool(config.db);

    testQuery = pool.query(`SHOW TABLES;`, (err, res) => {
        if (err) { 
            if (logger) logger.error(`Tried to connect to database: ${err}`);

            process.exit();
        } else { 
            if (logger) logger.info(`Database initialized with ${res.length} tables.`); 
        }
    });

    if (logger) logger.info(`Database pool created: host: ${config.db.host}, database: ${config.db.database}.`);
}

// relay server
const PORT = 3000;

io.listen(PORT, {
    upgradeTimeout: 1000,
    pingTimeout: 30000
});

if (logger) logger.info(`Komodo relay is running on :${PORT}`);

syncServer.init(io, pool, logger);

chatServer.init(io, logger);

adminServer.init(io, syncServer, chatServer);