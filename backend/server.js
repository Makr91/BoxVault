import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, chmodSync, readFileSync, writeFileSync, watch } from 'fs';
import { isAbsolute, join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import responseTime from 'response-time';
import { loadConfig, getConfigPath, getSetupTokenPath } from './app/utils/config-loader.js';
import { log, morganMiddleware } from './app/utils/Logger.js';
import { randomBytes, constants } from 'crypto';
import { createServer } from 'http';
import { createServer as _createServer } from 'https';
import session from 'express-session';
import connectSessionSequelize from 'connect-session-sequelize';
import { passport, initializeStrategies } from './app/auth/passport.js';
import lusca from 'lusca';
import { rateLimit } from 'express-rate-limit';
import { execSync } from 'child_process';

// Import routes and middleware
import {
  vagrantHandler,
  i18nMiddleware,
  rateLimiter,
  errorHandler,
} from './app/middleware/index.js';
import db from './app/models/index.js';
import healthRoutes from './app/routes/health.routes.js';
import authRoutes from './app/routes/auth.routes.js';
import mailRoutes from './app/routes/mail.routes.js';
import configRoutes from './app/routes/config.routes.js';
import userRoutes from './app/routes/user.routes.js';
import requestRoutes from './app/routes/request.routes.js';
import boxRouter from './app/routes/box.routes.js';
import fileRoutes from './app/routes/file.routes.js';
import versionRoutes from './app/routes/version.routes.js';
import organizationRoutes from './app/routes/organization.routes.js';
import providerRoutes from './app/routes/provider.routes.js';
import architectureRoutes from './app/routes/architecture.routes.js';
import serviceAccountRoutes from './app/routes/service_account.routes.js';
import favoritesRoutes from './app/routes/favorites.routes.js';
import setupRoutes from './app/routes/setup.routes.js';
import sslRoutes from './app/routes/ssl.routes.js';
import isoRoutes from './app/routes/iso.routes.js';
import systemRoutes from './app/routes/system.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

global.__basedir = __dirname;

const { json, urlencoded } = express;
const SequelizeStore = connectSessionSequelize(session.Store);
const { csrf } = lusca;

let boxConfig;
try {
  boxConfig = loadConfig('app');
} catch (e) {
  log.app.error('Failed to load box configuration', { error: e.message });
  // Fallback defaults to prevent crash during tests or misconfiguration
  boxConfig = {
    boxvault: {
      origin: { value: 'http://localhost:3000' },
      box_max_file_size: { value: 1 },
      api_listen_port_unencrypted: { value: 5000 },
      api_listen_port_encrypted: { value: 5001 },
    },
    ssl: {
      cert_path: { value: '' },
      key_path: { value: '' },
    },
  };
}

const dbConfigPath = getConfigPath('db');

const isDialectConfigured = () => {
  try {
    const dbConfig = loadConfig('db');
    const dialect = dbConfig.sql.dialect.value;
    return dialect !== undefined && dialect !== null && dialect.trim() !== '';
  } catch (error) {
    log.database.error('Error reading db.config.yaml', { error: error.message });
    return false;
  }
};

const resolveSSLPath = filePath => {
  if (!filePath) {
    return null;
  }
  if (isAbsolute(filePath)) {
    return filePath;
  }
  return join(__dirname, 'app', 'config', 'ssl', filePath);
};

const isSSLConfigured = () => {
  if (!boxConfig.ssl || !boxConfig.ssl.cert_path || !boxConfig.ssl.key_path) {
    return false;
  }

  const certPath = resolveSSLPath(boxConfig.ssl.cert_path.value);
  const keyPath = resolveSSLPath(boxConfig.ssl.key_path.value);
  return existsSync(certPath) && existsSync(keyPath);
};

/**
 * Generate SSL certificates if they don't exist and generate_ssl is enabled
 */
const generateSSLCertificatesIfNeeded = () => {
  if (!boxConfig.ssl || !boxConfig.ssl.generate_ssl || !boxConfig.ssl.generate_ssl.value) {
    return false; // SSL generation disabled
  }

  const keyPath = resolveSSLPath(boxConfig.ssl.key_path.value);
  const certPath = resolveSSLPath(boxConfig.ssl.cert_path.value);

  // Check if certificates already exist
  if (existsSync(keyPath) && existsSync(certPath)) {
    log.app.info('SSL certificates already exist, skipping generation', { keyPath, certPath });
    return false; // Certificates exist, no need to generate
  }

  try {
    log.app.info('Generating SSL certificates...', { keyPath, certPath });

    // Ensure SSL directory exists
    const sslDir = dirname(keyPath);
    if (!existsSync(sslDir)) {
      mkdirSync(sslDir, { recursive: true, mode: 0o700 });
    }

    // Generate SSL certificate using OpenSSL
    const opensslCmd = `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -subj "/C=US/ST=State/L=City/O=BoxVault/CN=localhost"`;

    execSync(opensslCmd, { stdio: 'pipe' });

    // Set proper permissions (readable by current user only)
    chmodSync(keyPath, 0o600);
    chmodSync(certPath, 0o600);

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
};

const getOrGenerateSetupToken = () => {
  const setupTokenPath = getSetupTokenPath();

  // Check if setup token already exists (from package installation)
  if (existsSync(setupTokenPath)) {
    try {
      const existingToken = readFileSync(setupTokenPath, 'utf8').trim();
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
  const token = randomBytes(32).toString('hex');

  // Ensure the directory exists before writing the token
  const tokenDir = dirname(setupTokenPath);
  if (!existsSync(tokenDir)) {
    mkdirSync(tokenDir, { recursive: true, mode: 0o755 });
  }

  writeFileSync(setupTokenPath, token);
  return token;
};

/**
 * Check for Certbot integration and provide guidance if needed
 */
const checkCertbotIntegration = () => {
  const hookDir = '/etc/letsencrypt/renewal-hooks/deploy';
  const hookPath = `${hookDir}/boxvault-cert-deploy.sh`;
  const sourceHook = '/opt/boxvault/scripts/certbot-deploy-hook.sh';

  // Check if Certbot is installed but hook is missing
  if (existsSync(hookDir) && !existsSync(hookPath) && existsSync(sourceHook)) {
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
};

const static_path = `${__dirname}/app/views/`;

const app = express();

// Increase server limits
app.set('timeout', 0);
app.set('keep-alive-timeout', 0);
app.set('headers-timeout', 0);

// Add response time tracking to all requests (with logging)
app.use(
  responseTime((req, res, time) => {
    log.api.info('Response time', {
      method: req.method,
      url: req.url,
      duration_ms: time.toFixed(2),
      status: res.statusCode,
    });
  })
);

// Debug middleware to log requests
app.use((req, res, next) => {
  void res;
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
    setHeaders: (res, filePath, stat) => {
      void stat;
      log.app.info('Serving static file:', {
        path: filePath,
        type: filePath.endsWith('.ico') ? 'image/x-icon' : null,
      });
      if (filePath.endsWith('.ico')) {
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
  if (
    req.url.includes('/file/upload') ||
    req.url.includes('/config/ssl/upload') ||
    req.url.includes('/iso')
  ) {
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
    json({ limit: maxSize })(req, res, err => {
      if (err) {
        log.error.error('JSON parsing error:', err);
        return res.status(413).json({ error: 'Request too large' });
      }
      return urlencoded({ extended: true, limit: maxSize })(req, res, next);
    });
  }
});

// Add headers for Cloudflare
app.use((req, res, next) => {
  void req;
  res.setHeader('Cache-Control', 'no-transform');
  next();
});

// Morgan HTTP request logging
app.use(morganMiddleware);

// Rate limiting middleware (applied at top level for CodeQL detection)
app.use(rateLimiter);
log.app.info('Rate limiting middleware applied globally');

// Initialize roles in database (must be defined before initializeApp uses it)
const initial = async () => {
  try {
    const { role: Role } = db;
    const roles = [
      { id: 1, name: 'user' },
      { id: 2, name: 'moderator' },
      { id: 3, name: 'admin' },
    ];

    await Promise.all(
      roles.map(role =>
        Role.findOrCreate({
          where: { name: role.name },
          defaults: role,
        })
      )
    );
  } catch (error) {
    log.error.error('Error initializing roles:', error);
  }
};

// Function to initialize the application - REFACTORED with async/await pattern
const initializeApp = async () => {
  try {
    // Add Vagrant request handler
    app.use(vagrantHandler);

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
    const passportSession = passport.session();
    app.use((req, res, next) => {
      if (req.session) {
        passportSession(req, res, next);
      } else {
        next();
      }
    });

    // Wait for OIDC strategies to register (CRITICAL - must happen before routes load)
    await initializeStrategies();
    log.app.info('Passport.js initialized with OIDC providers');

    // Selective CSRF protection middleware (following Armor pattern)
    const selectiveCSRF = (req, res, next) => {
      // Skip CSRF for API routes with JWT auth, GET requests, and static files
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/auth/') ||
        req.method === 'GET' ||
        req.headers['x-access-token'] || // Skip for JWT authentication
        req.headers.accept === 'text/event-stream'
      ) {
        return next();
      }

      // Apply CSRF protection for traditional form submissions
      return csrf()(req, res, next);
    };

    app.use(selectiveCSRF);
    log.app.info('Selective CSRF protection middleware applied');

    // i18n internationalization middleware
    app.use(i18nMiddleware);
    log.app.info('i18n internationalization middleware applied');

    // Initialize roles, but not in test environment as setup.js handles it
    if (process.env.NODE_ENV !== 'test') {
      await initial();
    } else {
      // Log that we're skipping for clarity during testing
      log.app.info('Skipping role initialization in test environment.');
    }

    // NOW load all routes - strategies are guaranteed to exist
    log.app.info('Loading application routes...');

    app.use('/api', healthRoutes);
    app.use('/api', authRoutes);
    app.use('/api', mailRoutes);
    app.use('/api', configRoutes);
    app.use('/api', userRoutes);
    app.use('/api', requestRoutes);
    app.use('/api', boxRouter);
    app.use('/', boxRouter); // Also mount at root for Vagrant download route
    app.use('/api', fileRoutes);
    app.use('/api', versionRoutes);
    app.use('/api', organizationRoutes);
    app.use('/api', providerRoutes);
    app.use('/api', architectureRoutes);
    app.use('/api', serviceAccountRoutes);
    app.use('/api', favoritesRoutes);
    app.use('/api', setupRoutes);
    app.use('/api', sslRoutes);
    app.use('/api', isoRoutes);
    app.use('/api', systemRoutes);

    log.app.info('All routes loaded successfully');

    // Swagger API documentation with dynamic server URL
    try {
      const swaggerModule = await import('./app/config/swagger.js');
      const { specs, swaggerUi } = swaggerModule.default;

      app.use('/api-docs', swaggerUi.serve, (req, res, next) => {
        const { protocol } = req;
        const host = req.get('host');
        const dynamicSpecs = {
          ...specs,
          servers: [
            {
              url: `${protocol}://${host}`,
              description: 'Current server (auto-detected)',
            },
            ...specs.servers,
          ],
        };

        swaggerUi.setup(dynamicSpecs, {
          explorer: true,
          customCss: '.swagger-ui .topbar { display: none }',
          customSiteTitle: 'BoxVault API Documentation',
        })(req, res, next);
      });

      log.app.info('Swagger UI available at /api-docs');
    } catch (error) {
      log.app.warn('Swagger configuration not available:', error.message);
    }

    // Explicit rate limiter for SPA catch-all (CodeQL requirement)
    const spaLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 2000,
      standardHeaders: true,
      legacyHeaders: false,
    });

    // SPA catch-all route
    app.get('*splat', spaLimiter, (req, res) => {
      void req;
      res.sendFile(join(static_path, 'index.html'));
    });

    // Error handler middleware (MUST be last)
    app.use(errorHandler);
    log.app.info('Error handler middleware applied');

    log.app.info('BoxVault application initialized successfully');
  } catch (error) {
    log.error.error('Application initialization failed', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// Check if the database dialect is configured
let isConfigured = isDialectConfigured();

if (isConfigured) {
  initializeApp();
} else {
  const setupToken = getOrGenerateSetupToken();
  log.app.info(`Setup token: ${setupToken}`);

  // Apply i18n middleware for setup routes
  app.use(i18nMiddleware);

  // Load only the setup route
  app.use('/api', setupRoutes);

  app.get('/', (req, res) => {
    void req;
    res.sendFile(join(static_path, 'index.html'));
  });

  // Watch for changes in the db.config.yaml file
  if (process.env.NODE_ENV !== 'test') {
    const watchTarget = existsSync(dbConfigPath) ? dbConfigPath : dirname(dbConfigPath);
    const dbConfigFileName = basename(dbConfigPath);

    try {
      watch(watchTarget, (eventType, filename) => {
        // If watching directory, ensure we only react to the specific config file
        if (watchTarget !== dbConfigPath && filename && filename !== dbConfigFileName) {
          return;
        }

        if (eventType === 'change' || eventType === 'rename') {
          // Ignore temporary files created during atomic writes
          if (filename && filename.endsWith('.tmp')) {
            return;
          }

          const newConfiguredState = isDialectConfigured();
          if (!isConfigured && newConfiguredState) {
            isConfigured = true;
            log.app.info('Configuration updated. Initializing application...');
            initializeApp();
          }
        }
      });
    } catch (error) {
      log.app.warn('Failed to setup file watcher for config:', error.message);
    }
  }
}

const HTTP_PORT = boxConfig.boxvault.api_listen_port_unencrypted.value || 5000;
const HTTPS_PORT = boxConfig.boxvault.api_listen_port_encrypted.value || 5001;

// HTTP Server starter function (must be defined before IIFE uses it)
const startHTTPServer = (port = HTTP_PORT) => {
  const httpServer = createServer(
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

    // Optimize socket for large transfers
    socket.on('error', err => {
      log.error.error('Socket error:', err);
    });
  });

  // Disable timeouts for uploads
  httpServer.timeout = 0;
  httpServer.keepAliveTimeout = 0;

  httpServer.listen(port, () => {
    log.app.info(`HTTP Server is running on port ${port}.`);
  });

  return httpServer;
};

// SSL/HTTPS Configuration with auto-generation
const startServer = () => {
  // Generate SSL certificates BEFORE setup wizard (synchronous operation)
  generateSSLCertificatesIfNeeded();

  // Check for Certbot integration after SSL setup
  checkCertbotIntegration();

  if (isSSLConfigured()) {
    try {
      const certPath = resolveSSLPath(boxConfig.ssl.cert_path.value);
      const keyPath = resolveSSLPath(boxConfig.ssl.key_path.value);

      const privateKey = readFileSync(keyPath, 'utf8');
      const certificate = readFileSync(certPath, 'utf8');
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
        secureOptions: constants.SSL_OP_NO_COMPRESSION,
      };

      const httpsServer = _createServer(
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
      const httpServer = createServer((req, res) => {
        void req;
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
};

// Export app for testing
export default app;

// Only start the server if this file is run directly (not required as a module)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
