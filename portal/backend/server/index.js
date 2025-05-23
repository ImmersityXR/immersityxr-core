const config = require("./config");
const aws = require("./aws");

const mysql = require('mysql2');
const cookieParser = require('cookie-parser');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./openapi.json');

// create the connection to database
const pool = mysql.createPool({
  ...config.mysql,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

let status = "initializing...";

pool.on("connection", (connection) => {
  status = `connection established: ${connection.threadId}`;
  console.debug(status);
});
pool.on("acquire", (connection) => {
  status = `acquired: ${connection.threadId}`;
  console.debug(status);
});
pool.on("release", (connection) => {
  status = `released: ${connection.threadId}`;
  console.debug(status);
});
pool.on("enqueue", () => {
  status = `enqueued`;
  console.debug(status);
});

let conn;
pool.getConnection((error, connection) => {
  if (error) {
    status = `error`;
    console.dir(error.stack);
    return;
  }
  conn = connection;
});

const app = express();
const port = config.web.port;

app.use(cookieParser());
app.use(bodyParser.json({limit: '50mb'}));
app.use(cors({
  origin: config.cors.origins,
  methods: [
    'GET', 'PUT', 'POST', 'DELETE'
  ],
  credentials: true,
}));

app.use(session({
  secret: config.web.session_secret,
  resave: false,
  saveUninitialized: true
}));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const {
  userController,
  courseController,
  labController,
  assetController,
  publicController,
  dataController,
  turnController
} = require("./controller");

app.use("/users", userController);
app.use("/courses", courseController);
app.use("/labs", labController);
app.use("/assets", assetController);
app.use("/data", dataController);
app.use("/public", publicController);
app.use("/turn", turnController);

app.get('/', (req, res) => res.send('<p>Hello Immersity!</p><p>Database status: ' + status + '</p><a href="/api-docs">API Docs</a>'));

app.get('/s3_signed/:name', (req, res) => {
  const name = req.params.name;
  if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
    console.log(name);
    res.end(JSON.stringify({success: false, errorMessage: "illegal name, can only use A-Za-z0-9_"}));
  }
  aws.createPresignedPost(name, (err, data) => {
    if (err) {
      res.end(JSON.stringify({success: false, errorMessage: err.toString()}));
    } else {
      res.end(JSON.stringify({success: true, data: data}));
    }
  })
});


let server = app.listen(port, () => console.log(`Immersity portal backend listening on port ${port}!`));

const shutdownHandler = (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  //app.stoplistening(...)

  console.log(`Releasing connection pool...`);
  pool.releaseConnection(conn);

  console.log(`Releasing connection...`);
  conn.release();

  console.log(`Shutting down server...`);
  server.close();

  console.log(`Done.`);
}

process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
process.on('SIGINT', () => shutdownHandler('SIGINT'));
