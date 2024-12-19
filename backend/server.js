const express = require("express");
const cors = require("cors");
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { vagrantHandler } = require("./app/middleware");

global.__basedir = __dirname;

const boxConfigPath = path.join(__dirname, 'app/config/app.config.yaml');
let boxConfig;
try {
  const fileContents = fs.readFileSync(boxConfigPath, 'utf8');
  boxConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load box configuration: ${e.message}`);
}

const dbConfigPath = path.join(__dirname, 'app/config/db.config.yaml');

function isDialectConfigured() {
  try {
    const dbConfig = yaml.load(fs.readFileSync(dbConfigPath, 'utf8'));
    const dialect = dbConfig.sql.dialect.value;
    return dialect !== undefined && dialect !== null && dialect.trim() !== '';
  } catch (error) {
    console.error('Error reading db.config.yaml:', error);
    return false;
  }
}

function resolveSSLPath(filePath) {
  if (!filePath) return null;
  if (path.isAbsolute(filePath)) {
    return filePath;
  } else {
    return path.join(__dirname, 'app', 'config', 'ssl', filePath);
  }
}

function isSSLConfigured() {
  if (!boxConfig.ssl || 
      !boxConfig.ssl.cert_path || 
      !boxConfig.ssl.key_path) {
    return false;
  }

  const certPath = resolveSSLPath(boxConfig.ssl.cert_path.value);
  const keyPath = resolveSSLPath(boxConfig.ssl.key_path.value);
  return fs.existsSync(certPath) && fs.existsSync(keyPath);
}

const setupTokenPath = path.join(__dirname, 'app/setup.token');

function generateSetupToken() {
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(setupTokenPath, token);
  return token;
}

const static_path = __dirname + '/app/views/';

const app = express();

// Add Vagrant request handler before static file serving
app.use(vagrantHandler);

app.use(express.static(static_path));

var corsOptions = {
  origin: boxConfig.boxvault.origin.value
};

app.use(cors(corsOptions));

// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// Function to initialize the application
function initializeApp() {
  const db = require("./app/models");
  const Role = db.role;

  db.sequelize.sync().then(() => {
    console.log('Database synced');
    initial();
  }).catch(err => {
    console.error("Error syncing database:", err);
  });

  // Load all other routes
  require('./app/routes/auth.routes')(app);
  require('./app/routes/mail.routes')(app);
  require('./app/routes/config.routes')(app);
  require('./app/routes/user.routes')(app);
  require('./app/routes/box.routes')(app);
  require('./app/routes/file.routes')(app);
  require('./app/routes/version.routes')(app);
  require('./app/routes/organization.routes')(app);
  require('./app/routes/provider.routes')(app);
  require('./app/routes/architecture.routes')(app);
  require('./app/routes/service_account.routes')(app);
  require('./app/routes/setup.routes')(app);
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(static_path, 'index.html'));
  });
}

// Check if the database dialect is configured
let isConfigured = isDialectConfigured();

if (isConfigured) {
  initializeApp();
} else {
  const setupToken = generateSetupToken();
  console.log(`Setup token: ${setupToken}`);

  // Load only the setup route
  require('./app/routes/setup.routes')(app);

  app.get('/', (req, res) => {
    res.sendFile(path.join(static_path, 'index.html'));
  });

  // Watch for changes in the db.config.yaml file
  fs.watch(dbConfigPath, (eventType, filename) => {
    if (eventType === 'change') {
      isConfigured = isDialectConfigured();
      if (isConfigured) {
        console.log('Configuration updated. Initializing application...');
        initializeApp();
      }
    }
  });
}

const HTTP_PORT = boxConfig.boxvault.api_listen_port_unencrypted.value || 5000;
const HTTPS_PORT = boxConfig.boxvault.api_listen_port_encrypted.value || 5001;

if (isSSLConfigured()) {
  try {
    const certPath = resolveSSLPath(boxConfig.ssl.cert_path.value);
    const keyPath = resolveSSLPath(boxConfig.ssl.key_path.value);

    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const certificate = fs.readFileSync(certPath, 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    const httpsServer = https.createServer(credentials, app);

    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`HTTPS Server is running on port ${HTTPS_PORT}.`);
    });

    // Create HTTP server to redirect to HTTPS
    const httpServer = http.createServer((req, res) => {
      res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
      res.end();
    });

    httpServer.listen(HTTP_PORT, () => {
      console.log(`HTTP Server is running on port ${HTTP_PORT} (redirecting to HTTPS).`);
    });

  } catch (error) {
    console.error('Failed to start HTTPS server:', error);
    console.log('Falling back to HTTP server...');
    startHTTPServer();
  }
} else {
  startHTTPServer();
}

function startHTTPServer() {
  const httpServer = http.createServer(app);
  httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP Server is running on port ${HTTP_PORT}.`);
  });
}

async function initial() {
  try {
    const db = require("./app/models");
    const Role = db.role;
    const roles = [
      { id: 1, name: "user" },
      { id: 2, name: "moderator" },
      { id: 3, name: "admin" }
    ];

    for (const role of roles) {
      await Role.findOrCreate({
        where: { name: role.name },
        defaults: role
      });
    }
  } catch (error) {
    console.error("Error initializing roles:", error);
  }
}
