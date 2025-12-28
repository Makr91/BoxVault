const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { loadConfig, getConfigPath, getSetupTokenPath } = require('./app/utils/config-loader');
const { log } = require('./app/utils/Logger');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const { passport, initializeStrategies } = require('./app/auth/passport');

global.__basedir = __dirname;

let boxConfig;
try {
  boxConfig = loadConfig('app');
} catch (e) {
  log.app.error('Failed to load box configuration', { error: e.message });
}

const dbConfigPath = getConfigPath('db');

function isDialectConfigured() {
  try {
    const dbConfig = loadConfig('db');
    const dialect = dbConfig.sql.dialect.value;
    return dialect !== undefined && dialect !== null && dialect.trim() !== '';
  } catch (error) {
    log.database.error('Error reading db.config.yaml', { error: error.message });
    return false;
  }
}

function resolveSSLPath(filePath) {
  if (!filePath) {
    return null;
  }
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(__dirname, 'app', 'config', 'ssl', filePath);
}

function isSSLConfigured() {
  if (!boxConfig.ssl || !boxConfig.ssl.cert_path || !boxConfig.ssl.key_path) {
    return false;
  }

  const certPath = resolveSSLPath(boxConfig.ssl.cert_path.value);
  const keyPath = resolveSSLPath(boxConfig.ssl.key_path.value);
  return fs.existsSync(certPath) && fs.existsSync(keyPath);
}

/**
 * Generate SSL certificates if they don't exist and generate_ssl is enabled
 */
async function generateSSLCertificatesIfNeeded() {
  if (!boxConfig.ssl || !boxConfig.ssl.generate_ssl || !boxConfig.ssl.generate_ssl.value) {
    return false; // SSL generation disabled
  }

  const keyPath = resolveSSLPath(boxConfig.ssl.key_path.value);
  const certPath = resolveSSLPath(boxConfig.ssl.cert_path.value);

  // Check if certificates already exist
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    log.app.info('SSL certificates already exist, skipping generation', { keyPath, certPath });
    return false; // Certificates exist, no need to generate
  }

  try {
    log.app.info('Generating SSL certificates...', { keyPath, certPath });

    // Import child_process for running openssl
    const { execSync } = require('child_process');

    // Ensure SSL directory exists
    const sslDir = path.dirname(keyPath);
    if (!fs.existsSync(sslDir)) {
      fs.mkdirSync(sslDir, { recursive: true, mode: 0o700 });
    }

    // Generate SSL certificate using OpenSSL
    const opensslCmd = `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -subj "/C=US/ST=State/L=City/O=BoxVault/CN=localhost"`;

    execSync(opensslCmd, { stdio: 'pipe' });

    // Set proper permissions (readable by current user only)
    fs.chmodSync(keyPath, 0o600);
    fs.chmodSync(certPath, 0o600);

    log.app.info('SSL certificates generated successfully', { keyPath, certPath });

    return true; // Certificates generated successfully
  } catch (error) {
    log.app.error('Failed to generate SSL certificates', {
      error: error.message,
      keyPath,
      certPath,
    });
    log.app.warn('Continuing with HTTP fallback...');
    return false; // Generation failed
  }
}

function getOrGenerateSetupToken() {
  const setupTokenPath = getSetupTokenPath();

  // Check if setup token already exists (from package installation)
  if (fs.existsSync(setupTokenPath)) {
    try {
      const existingToken = fs.readFileSync(setupTokenPath, 'utf8').trim();
      if (existingToken && existingToken.length === 64) {
        // Valid hex token
        log.app.info('Using existing setup token from installation');
        return existingToken;
      }
    } catch (error) {
      log.app.warn('Error reading existing setup token, generating new one:', error.message);
    }
  }

  // Generate new token if none exists or existing one is invalid
  const token = crypto.randomBytes(32).toString('hex');

  // Ensure the directory exists before writing the token
  const tokenDir = path.dirname(setupTokenPath);
  if (!fs.existsSync(tokenDir)) {
    fs.mkdirSync(tokenDir, { recursive: true, mode: 0o755 });
  }

  fs.writeFileSync(setupTokenPath, token);
  return token;
}

/**
 * Check for Certbot integration and provide guidance if needed
 */
function checkCertbotIntegration() {
  const hookDir = '/etc/letsencrypt/renewal-hooks/deploy';
  const hookPath = `${hookDir}/boxvault-cert-deploy.sh`;
  const sourceHook = '/opt/boxvault/scripts/certbot-deploy-hook.sh';

  // Check if Certbot is installed but hook is missing
  if (fs.existsSync(hookDir) && !fs.existsSync(hookPath) && fs.existsSync(sourceHook)) {
    log.app.info('');
    log.app.info('='.repeat(60));
    log.app.info('BoxVault Certbot Integration Available');
    log.app.info('='.repeat(60));
    log.app.info('Certbot detected but BoxVault hook not installed.');
    log.app.info('To enable automatic certificate renewal, run:');
    log.app.info('');
    log.app.info(`  sudo cp ${sourceHook} ${hookPath}`);
    log.app.info('');
    log.app.info('This will automatically copy renewed certificates to BoxVault');
    log.app.info('and restart the service when certificates are renewed.');
    log.app.info('='.repeat(60));
    log.app.info('');
  }
}

const static_path = `${__dirname}/app/views/`;

const app = express();

// Increase server limits
app.set('timeout', 0);
app.set('keep-alive-timeout', 0);
app.set('headers-timeout', 0);

// Debug middleware to log requests
app.use((req, res, next) => {
  log.app.info('Request:', {
    method: req.method,
    url: req.url,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      accept: req.headers.accept,
    },
  });
  next();
});

// Configure static file serving with proper content types first
app.use(
  express.static(static_path, {
    setHeaders: (res, path, stat) => {
      log.app.info('Serving static file:', {
        path,
        type: path.endsWith('.ico') ? 'image/x-icon' : null,
      });
      if (path.endsWith('.ico')) {
        res.setHeader('Content-Type', 'image/x-icon');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache favicons for 24 hours
      }
    },
  })
);

// Enhanced CORS for Cloudflare
const corsOptions = {
  origin: boxConfig.boxvault.origin.value,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['x-access-token', 'Origin', 'Content-Type', 'Accept', 'Content-Length'],
  maxAge: 600, // 10 minutes
  credentials: true,
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
    express.json({ limit: maxSize })(req, res, err => {
      if (err) {
        log.error.error('JSON parsing error:', err);
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

// Function to initialize the application - REFACTORED with async/await pattern
async function initializeApp() {
  try {
    // Add Vagrant request handler
    const { vagrantHandler } = require('./app/middleware');
    app.use(vagrantHandler);

    const db = require('./app/models');
    const Role = db.role;

    // Configure session middleware for OIDC
    const sessionStore = new SequelizeStore({
      db: db.sequelize,
      tableName: 'Sessions',
      checkExpirationInterval: 15 * 60 * 1000,
      expiration: 30 * 60 * 1000,
    });

    let authConfig;
    try {
      authConfig = loadConfig('auth');
    } catch (e) {
      log.error.error(`Failed to load auth configuration: ${e.message}`);
    }

    app.use(
      session({
        secret: authConfig?.auth?.jwt?.jwt_secret?.value || 'boxvault-session-secret',
        store: sessionStore,
        name: 'boxvault.sid',
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: isSSLConfigured(),
          httpOnly: true,
          maxAge: 30 * 60 * 1000,
          sameSite: 'lax',
        },
      })
    );

    // Wait for database sync
    await db.sequelize.sync();
    log.app.info('Database synced');

    // Sync session store
    await sessionStore.sync();
    log.app.info('Session store synchronized');

    // Initialize Passport middleware
    app.use(passport.initialize());
    app.use(passport.session());

    // Wait for OIDC strategies to register (CRITICAL - must happen before routes load)
    await initializeStrategies();
    log.app.info('Passport.js initialized with OIDC providers');

    // Initialize roles
    await initial();

    // NOW load all routes - strategies are guaranteed to exist
    log.app.info('Loading application routes...');

    require('./app/routes/auth.routes')(app);
    require('./app/routes/oidc.routes')(app);
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

    log.app.info('All routes loaded successfully');

    // Swagger API documentation
    try {
      const { specs, swaggerUi } = require('./app/config/swagger');
      app.use(
        '/api-docs',
        swaggerUi.serve,
        swaggerUi.setup(specs, {
          explorer: true,
          customCss: '.swagger-ui .topbar { display: none }',
          customSiteTitle: 'BoxVault API Documentation',
        })
      );
      log.app.info('Swagger UI available at /api-docs');
    } catch (error) {
      log.app.warn('Swagger configuration not available:', error.message);
    }

    // SPA catch-all route
    app.get('*splat', (req, res) => {
      res.sendFile(path.join(static_path, 'index.html'));
    });

    log.app.info('BoxVault application initialized successfully');
  } catch (error) {
    log.error.error('Application initialization failed', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// Check if the database dialect is configured
let isConfigured = isDialectConfigured();

if (isConfigured) {
  initializeApp();
} else {
  const setupToken = getOrGenerateSetupToken();
  log.app.info(`Setup token: ${setupToken}`);

  // Load only the setup route
  require('./app/routes/setup.routes')(app);

  app.get('/', (req, res) => {
    res.sendFile(path.join(static_path, 'index.html'));
  });

  // Watch for changes in the db.config.yaml file
  fs.watch(dbConfigPath, (eventType, filename) => {
    if (eventType === 'change') {
      // Ignore temporary files created during atomic writes
      if (filename && filename.endsWith('.tmp')) {
        return;
      }

      isConfigured = isDialectConfigured();
      if (isConfigured) {
        log.app.info('Configuration updated. Initializing application...');
        initializeApp();
      }
    }
  });
}

const HTTP_PORT = boxConfig.boxvault.api_listen_port_unencrypted.value || 5000;
const HTTPS_PORT = boxConfig.boxvault.api_listen_port_encrypted.value || 5001;

// SSL/HTTPS Configuration with auto-generation - MOVED TO HAPPEN BEFORE SETUP
(async () => {
  // Generate SSL certificates BEFORE setup wizard, like ZoneWeaver does
  await generateSSLCertificatesIfNeeded();

  // Check for Certbot integration after SSL setup
  checkCertbotIntegration();

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
        ciphers:
          'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
        honorCipherOrder: true,
        // Increase SSL buffer size
        secureOptions: crypto.constants.SSL_OP_NO_COMPRESSION,
      };

      const httpsServer = https.createServer(
        {
          ...credentials,
          requestTimeout: 0,
          headersTimeout: 0,
          keepAliveTimeout: 0,
          maxHeaderSize: 32 * 1024, // 32KB
        },
        app
      );
      // Configure socket for large transfers
      httpsServer.on('connection', socket => {
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 60000); // 60 seconds

        // Set buffer size using the correct Node.js method
        socket.bufferSize = 64 * 1024 * 1024; // 64MB

        // Optimize socket for large transfers
        socket.on('error', err => {
          log.error.error('Socket error:', err);
        });
      });

      // Disable timeouts for uploads
      httpsServer.timeout = 0;
      httpsServer.keepAliveTimeout = 0;

      httpsServer.listen(HTTPS_PORT, () => {
        log.app.info(`HTTPS Server is running on port ${HTTPS_PORT}.`);
      });

      // Create HTTP server to redirect to HTTPS
      const httpServer = http.createServer((req, res) => {
        res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
        res.end();
      });

      httpServer.listen(HTTP_PORT, () => {
        log.app.info(`HTTP Server is running on port ${HTTP_PORT} (redirecting to HTTPS).`);
      });
    } catch (error) {
      log.error.error('Failed to start HTTPS server:', error);
      log.app.info('Falling back to HTTP server...');
      startHTTPServer();
    }
  } else {
    startHTTPServer();
  }
})();

function startHTTPServer() {
  const httpServer = http.createServer(
    {
      requestTimeout: 0,
      headersTimeout: 0,
      keepAliveTimeout: 0,
      maxHeaderSize: 32 * 1024, // 32KB
    },
    app
  );
  httpServer.on('connection', socket => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 60000); // 60 seconds

    // Set buffer size using the correct Node.js method
    socket.bufferSize = 64 * 1024 * 1024; // 64MB

    // Optimize socket for large transfers
    socket.on('error', err => {
      log.error.error('Socket error:', err);
    });
  });

  // Disable timeouts for uploads
  httpServer.timeout = 0;
  httpServer.keepAliveTimeout = 0;

  httpServer.listen(HTTP_PORT, () => {
    log.app.info(`HTTP Server is running on port ${HTTP_PORT}.`);
  });
}

async function initial() {
  try {
    const db = require('./app/models');
    const Role = db.role;
    const roles = [
      { id: 1, name: 'user' },
      { id: 2, name: 'moderator' },
      { id: 3, name: 'admin' },
    ];

    for (const role of roles) {
      await Role.findOrCreate({
        where: { name: role.name },
        defaults: role,
      });
    }
  } catch (error) {
    log.error.error('Error initializing roles:', error);
  }
}
