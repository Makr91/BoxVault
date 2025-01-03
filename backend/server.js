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

// Increase server limits
app.set('timeout', 0);
app.set('keep-alive-timeout', 0);
app.set('headers-timeout', 0);

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
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache favicons for 24 hours
    }
  }
}));

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

// Configure body parsers with appropriate limits, but exclude file upload route
app.use((req, res, next) => {
  // Skip body parsing for file uploads
  if (req.url.includes('/file/upload')) {
    // Set upload-specific headers
    res.setHeader('Cache-Control', 'no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('CF-Max-Timeout', '86400');
    // Disable request timeouts
    req.setTimeout(0);
    res.setTimeout(0);
    next();
  } else {
    // Apply body parsing for non-upload routes
    express.json({ limit: maxSize })(req, res, (err) => {
      if (err) {
        console.error('JSON parsing error:', err);
        return res.status(413).json({ error: 'Request too large' });
      }
      express.urlencoded({ extended: true, limit: maxSize })(req, res, next);
    });
  }
});

// Add headers for Cloudflare
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-transform');
  next();
});

// Function to initialize the application
function initializeApp() {
  // Add Vagrant request handler
  app.use(vagrantHandler);

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
    const credentials = { 
      key: privateKey, 
      cert: certificate,
      // SSL options for large files
      maxVersion: 'TLSv1.3',
      minVersion: 'TLSv1.2',
      ciphers: 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
      honorCipherOrder: true,
      // Increase SSL buffer size
      secureOptions: crypto.constants.SSL_OP_NO_COMPRESSION,
    };

    const httpsServer = https.createServer({
      ...credentials,
      requestTimeout: 0,
      headersTimeout: 0,
      keepAliveTimeout: 0,
      maxHeaderSize: 32 * 1024 // 32KB
    }, app);
    // Configure socket for large transfers
    httpsServer.on('connection', socket => {
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 60000); // 60 seconds
      
      // Set buffer size using the correct Node.js method
      socket.bufferSize = 64 * 1024 * 1024; // 64MB
      
      // Optimize socket for large transfers
      socket.on('error', err => {
        console.error('Socket error:', err);
      });
    });

    // Disable timeouts for uploads
    httpsServer.timeout = 0;
    httpsServer.keepAliveTimeout = 0;

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
  const httpServer = http.createServer({
    requestTimeout: 0,
    headersTimeout: 0,
    keepAliveTimeout: 0,
    maxHeaderSize: 32 * 1024 // 32KB
  }, app);
  httpServer.on('connection', socket => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 60000); // 60 seconds
    
    // Set buffer size using the correct Node.js method
    socket.bufferSize = 64 * 1024 * 1024; // 64MB
    
    // Optimize socket for large transfers
    socket.on('error', err => {
      console.error('Socket error:', err);
    });
  });
  
  // Disable timeouts for uploads
  httpServer.timeout = 0;
  httpServer.keepAliveTimeout = 0;
  
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
