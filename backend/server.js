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

// Debug middleware to log requests
app.use((req, res, next) => {
  console.log('Request:', {
    method: req.method,
    url: req.url,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'accept': req.headers['accept']
    }
  });
  next();
});

// Configure static file serving with proper content types first
app.use(express.static(static_path, {
  setHeaders: (res, path, stat) => {
    console.log('Serving static file:', {
      path: path,
      type: path.endsWith('.ico') ? 'image/x-icon' : null
    });
    if (path.endsWith('.ico')) {
      res.setHeader('Content-Type', 'image/x-icon');
    }
  }
}));

// Add Vagrant request handler after static files
app.use(vagrantHandler);

// Enhanced CORS for Cloudflare
const corsOptions = {
  origin: boxConfig.boxvault.origin.value,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['x-access-token', 'Origin', 'Content-Type', 'Accept', 'Content-Length'],
  maxAge: 600, // 10 minutes
  credentials: true
};

app.use(cors(corsOptions));

// Calculate max size from config (converting GB to bytes)
const maxSize = boxConfig.boxvault.box_max_file_size.value * 1024 * 1024 * 1024;

// Configure body parsers with appropriate limits
app.use(express.json({ limit: maxSize }));
app.use(express.urlencoded({ extended: true, limit: maxSize }));
app.use(express.raw({ limit: maxSize }));

// Add headers for Cloudflare
app.use((req, res, next) => {
  // Disable Cloudflare's Auto-Minify
  res.setHeader('Cache-Control', 'no-transform');
  // Indicate large file upload support
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Set longer timeout for uploads
  if (req.url.includes('/file/upload')) {
    // 24 hours in seconds
    res.setHeader('CF-Max-Timeout', '86400');
  }
  next();
});

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

  // SPA catch-all route
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

    // Set timeout to 24 hours for large uploads
    httpsServer.timeout = 24 * 60 * 60 * 1000; // 24 hours
    httpsServer.keepAliveTimeout = 24 * 60 * 60 * 1000; // 24 hours

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
  
  // Set timeout to 24 hours for large uploads
  httpServer.timeout = 24 * 60 * 60 * 1000; // 24 hours
  httpServer.keepAliveTimeout = 24 * 60 * 60 * 1000; // 24 hours
  
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
