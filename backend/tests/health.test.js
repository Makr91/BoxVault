import { jest } from '@jest/globals';
import path from 'path';
import { EventEmitter } from 'events';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const originalFs = require('fs');

// Define FS Mocks
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockStatSync = jest.fn();
const mockAccessSync = jest.fn();
const mockCallbackAccess = jest.fn();
const mockStatfs = jest.fn();
const mockCallbackStatfs = jest.fn();
const mockPromiseAccess = jest.fn();
const mockPromiseStat = jest.fn();

// Mutable promises object for testing missing statfs
const mockPromises = {
  ...originalFs.promises,
  statfs: mockStatfs,
  access: mockPromiseAccess,
  stat: mockPromiseStat,
};

// Mock nodemailer
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const mockCreateTransport = jest.fn().mockReturnValue({
  sendMail: mockSendMail,
  verify: jest.fn().mockResolvedValue(true),
});
const mockGetTestMessageUrl = jest.fn().mockReturnValue('https://ethereal.email/message/test-id');

jest.unstable_mockModule('nodemailer', () => ({
  createTransport: mockCreateTransport,
  getTestMessageUrl: mockGetTestMessageUrl,
  default: { createTransport: mockCreateTransport, getTestMessageUrl: mockGetTestMessageUrl },
}));

// Mock axios
const mockAxios = {
  get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
  post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
};

// Mock config-loader to allow injecting test configurations
const mockConfigLoader = {
  loadConfig: jest.fn(name => {
    // Default implementation for server.js startup
    if (name === 'app') {
      return {
        boxvault: {
          origin: { value: 'http://localhost:3000' },
          api_url: { value: 'http://localhost:3000/api' },
          box_storage_directory: { value: '/box-storage' },
          iso_storage_directory: { value: '/iso-storage' },
          box_max_file_size: { value: 20 },
          api_listen_port_unencrypted: { value: 5001 },
          api_listen_port_encrypted: { value: 5002 },
          repository_packages_url: { value: 'https://public.debian.packages.startcloud.com/' },
        },
        gravatar: {
          base_url: { value: 'https://api.gravatar.com/v3/profiles/' },
          api_key: { value: 'test-key' },
        },
        ticket_system: {
          enabled: { value: true },
          base_url: { value: 'https://example.com/ticket' },
          req_type: { value: 'sso' },
          context: { value: 'https://github.com/Makr91/BoxVault' },
        },
        ssl: {
          generate_ssl: { value: false },
          cert_path: { value: '/etc/boxvault/ssl/cert.pem' },
          key_path: { value: '/etc/boxvault/ssl/key.pem' },
        },
        // Provide a safe log directory for tests to prevent EACCES errors in Logger.js
        logging: {
          level: { value: 'info' },
          console_enabled: { value: true },
          log_directory: { value: path.join(process.cwd(), '__test_logs__') },
          performance_threshold_ms: { value: 1000 },
          enable_compression: { value: true },
          compression_age_days: { value: 7 },
          max_files: { value: 30 },
        },
        frontend_logging: {
          enabled: { value: true },
          level: { value: 'info' },
          categories: {
            app: { value: 'info' },
            auth: { value: 'info' },
            api: { value: 'info' },
            file: { value: 'info' },
            component: { value: 'debug' },
          },
        },
        rate_limiting: { window_minutes: { value: 15 }, max_requests: { value: 100 } },
        monitoring: {
          disk_space_critical_threshold: { value: 95 },
          disk_space_warning_threshold: { value: 90 },
          alert_frequency_hours: { value: 24 },
        },
      };
    }
    if (name === 'db') {
      return {
        database_type: { value: 'sqlite' },
        sql: {
          dialect: { value: 'sqlite' },
          storage: { value: ':memory:' },
          logging: { value: false },
          host: { value: 'localhost' },
          port: { value: 3306 },
          user: { value: 'root' },
          password: { value: '' },
          database: { value: 'boxvault' },
        },
        mysql_pool: {
          max: { value: 5 },
          min: { value: 0 },
          acquire: { value: 30000 },
          idle: { value: 10000 },
        },
      };
    }
    if (name === 'auth') {
      return {
        auth: {
          enabled_strategies: { value: ['local', 'jwt', 'oidc'] },
          default_strategy: { value: 'local' },
          jwt: {
            jwt_secret: { value: 'test-secret' },
            jwt_expiration: { value: '24h' },
            jwt_issuer: { value: 'boxvault' },
            jwt_audience: { value: 'boxvault-api' },
          },
          oidc: {
            token_refresh_threshold_minutes: { value: 5 },
            token_default_expiry_minutes: { value: 30 },
            providers: {
              google: {
                enabled: { value: true },
                issuer: { value: 'https://accounts.google.com' },
              },
            },
          },
          external: {
            domain_mapping_enabled: { value: true },
            provisioning_enabled: { value: true },
          },
        },
      };
    }
    if (name === 'mail') {
      return {
        smtp_connect: {
          host: { value: 'smtp.example.com' },
          port: { value: 25 },
          secure: { value: false },
          rejectUnauthorized: { value: false },
          alert_emails: { value: ['admin@example.com'] },
          alert_email: { value: ['admin@example.com'] }, // Handle both keys if code varies
        },
        smtp_settings: {
          from: { value: 'support@startcloud.com' },
          replyTo: { value: 'support@startcloud.com' },
          rateLimit: { value: 10 },
        },
        smtp_auth: {
          user: { value: 'user' },
          password: { value: 'pass' },
        },
      };
    }
    // Return a safe default structure for any other config to prevent crashes
    return {
      boxvault: {},
      auth: { jwt: {}, oidc: { providers: {} } },
      db: { sql: {} },
      mail: { smtp_settings: {} },
      logging: { level: { value: 'info' } },
      rate_limiting: {},
      internationalization: {},
      gravatar: {},
    };
  }),
  loadConfigs: jest.fn(() => ({})),
  getConfigPath: jest.fn(),
  getSetupTokenPath: jest.fn().mockReturnValue('/tmp/setup.token'),
  getRateLimitConfig: jest.fn().mockReturnValue({
    window_minutes: 15,
    max_requests: 100,
    message: 'Too many requests',
    skip_successful_requests: false,
    skip_failed_requests: false,
  }),
  getI18nConfig: jest.fn().mockReturnValue({
    default_language: 'en',
    supported_languages: ['en'],
    fallback_language: 'en',
    auto_detect: true,
  }),
};

const mockIsoHelpers = {
  getIsoStorageRoot: jest.fn().mockReturnValue('/iso-storage'),
  cleanupTempFile: jest.fn(),
  getSecureIsoPath: jest.fn(),
};

// Mock FS module
jest.unstable_mockModule('fs', () => ({
  default: {
    ...originalFs,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    mkdirSync: mockMkdirSync,
    statSync: mockStatSync,
    accessSync: mockAccessSync,
    access: mockCallbackAccess,
    statfs: mockCallbackStatfs,
    promises: mockPromises,
  },
  ...originalFs,
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  mkdirSync: mockMkdirSync,
  statSync: mockStatSync,
  accessSync: mockAccessSync,
  access: mockCallbackAccess,
  statfs: mockCallbackStatfs,
  promises: mockPromises,
}));

// Apply module mocks
jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
  ...mockConfigLoader,
  default: mockConfigLoader,
}));
jest.unstable_mockModule('../app/controllers/iso/helpers.js', () => mockIsoHelpers);
jest.unstable_mockModule('axios', () => ({ default: mockAxios }));

// Import app after mocks
const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const http = (await import('http')).default;
const https = (await import('https')).default;
// Import nodemailer to ensure mock is used (though we use the mock object directly)
await import('nodemailer');

describe('Health API Integration Tests', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockSendMail.mockClear();
    mockCreateTransport.mockClear();

    // Default Config Mock Implementation
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'app') {
        return {
          boxvault: {
            box_storage_directory: { value: '/box-storage' },
            iso_storage_directory: { value: '/iso-storage' },
            origin: { value: 'http://localhost:3000' },
            api_url: { value: 'http://localhost:3000/api' },
            box_max_file_size: { value: 20 },
            api_listen_port_unencrypted: { value: 5001 },
            api_listen_port_encrypted: { value: 5002 },
            repository_packages_url: { value: 'https://public.debian.packages.startcloud.com/' },
          },
          monitoring: {
            disk_space_critical_threshold: { value: 95 },
            disk_space_warning_threshold: { value: 90 },
            alert_frequency_hours: { value: 24 },
          },
          frontend_logging: {
            enabled: { value: true },
            level: { value: 'info' },
            categories: {
              app: { value: 'info' },
              auth: { value: 'info' },
              api: { value: 'info' },
              file: { value: 'info' },
              component: { value: 'debug' },
            },
          },
          logging: {
            level: { value: 'info' },
            log_directory: { value: path.join(process.cwd(), '__test_logs__') },
          },
          rate_limiting: { window_minutes: { value: 15 }, max_requests: { value: 100 } },
        };
      }
      if (name === 'auth') {
        return {
          auth: {
            oidc: {
              providers: {
                google: {
                  enabled: { value: true },
                  issuer: { value: 'https://accounts.google.com' },
                },
              },
            },
          },
        };
      }
      if (name === 'mail') {
        return {
          smtp_connect: {
            host: { value: 'smtp.example.com' },
            port: { value: 587 },
            secure: { value: false },
            rejectUnauthorized: { value: false },
          },
          smtp_settings: {
            alert_emails: { value: ['admin@example.com'] },
            from: { value: 'support@startcloud.com' },
          },
          smtp_auth: {
            user: { value: 'user' },
            password: { value: 'pass' },
          },
        };
      }
      if (name === 'db') {
        return {
          database_type: { value: 'sqlite' },
          sql: {
            dialect: { value: 'sqlite' },
            storage: { value: ':memory:' },
            logging: { value: false },
            host: { value: 'localhost' },
            port: { value: 3306 },
            user: { value: 'root' },
            password: { value: '' },
            database: { value: 'boxvault' },
          },
        };
      }
      return {};
    });

    // Default FS Mocks (Success Case)
    mockExistsSync.mockImplementation(p => {
      // Mock storage paths
      if (
        p &&
        typeof p === 'string' &&
        (p.includes('/box-storage') || p.includes('/iso-storage'))
      ) {
        return true;
      }
      // Delegate to real FS for everything else
      return originalFs.existsSync(p);
    });

    // Default ReadFile Mock
    mockReadFileSync.mockImplementation((filePath, options) =>
      originalFs.readFileSync(filePath, options)
    );

    // Default Mkdir Mock
    mockMkdirSync.mockImplementation((p, options) => {
      // Allow creating test log directory
      if (p && typeof p === 'string' && p.includes('__test_logs__')) {
        return originalFs.mkdirSync(p, { ...options, recursive: true });
      }
      return originalFs.mkdirSync(p, options);
    });

    mockPromiseAccess.mockImplementation((p, mode) => {
      if (
        p &&
        typeof p === 'string' &&
        (p.includes('/box-storage') || p.includes('/iso-storage'))
      ) {
        return Promise.resolve();
      }
      return originalFs.promises.access(p, mode);
    });

    mockPromiseStat.mockImplementation((p, options) => {
      if (
        p &&
        typeof p === 'string' &&
        (p.includes('/box-storage') || p.includes('/iso-storage'))
      ) {
        return Promise.resolve({ isDirectory: () => true, isFile: () => false, size: 4096 });
      }
      return originalFs.promises.stat(p, options);
    });

    mockStatSync.mockImplementation((p, options) => {
      if (
        p &&
        typeof p === 'string' &&
        (p.includes('/box-storage') || p.includes('/iso-storage'))
      ) {
        return { isDirectory: () => true, isFile: () => false, size: 4096 };
      }
      return originalFs.statSync(p, options);
    });

    mockAccessSync.mockImplementation((p, mode) => {
      if (
        p &&
        typeof p === 'string' &&
        (p.includes('/box-storage') || p.includes('/iso-storage'))
      ) {
        return;
      }
      originalFs.accessSync(p, mode);
    });

    mockCallbackAccess.mockImplementation((p, mode, cb) => {
      let callback = cb;
      let modeArg = mode;
      if (typeof mode === 'function') {
        callback = mode;
        modeArg = undefined;
      }
      if (
        p &&
        typeof p === 'string' &&
        (p.includes('/box-storage') || p.includes('/iso-storage'))
      ) {
        if (callback) {
          callback(null);
        }
        return;
      }
      if (modeArg === undefined) {
        originalFs.access(p, callback);
        return;
      }
      originalFs.access(p, modeArg, callback);
    });

    mockStatfs.mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 500, // 50% free
      bfree: 500,
    });

    mockCallbackStatfs.mockImplementation((p, cb) => {
      if (
        p &&
        typeof p === 'string' &&
        (p.includes('/box-storage') || p.includes('/iso-storage'))
      ) {
        cb(null, {
          blocks: 1000,
          bsize: 4096,
          bavail: 500,
          bfree: 500,
        });
        return;
      }
      if (originalFs.statfs) {
        originalFs.statfs(p, cb);
      } else {
        cb(new Error('statfs not implemented'));
      }
    });

    // Default DB Mock
    jest.spyOn(db.sequelize, 'authenticate').mockResolvedValue();
    jest.spyOn(db.sequelize, 'query').mockResolvedValue([{ 1: 1 }]);

    // Capture original network functions
    const originalHttpGet = http.get;
    const originalHttpsGet = https.get;
    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;

    const createMockImplementation = (original, moduleCtx) => (url, options, cb) => {
      // Determine if this is an external request (to be mocked) or internal (supertest)
      let isExternal = false;
      let urlStr = '';
      let urlObj = null;

      if (typeof url === 'string') {
        urlStr = url;
      } else if (typeof url === 'object' && url !== null) {
        urlObj = url;
        if (url.href) {
          urlStr = url.href;
        }
      }

      // Helper to check string against mocked domains
      const shouldMock = str => {
        if (!str) {
          return false;
        }
        return [
          'accounts.google.com',
          'good.com',
          'bad.com',
          'warn.com',
          'enabled.com',
          'disabled.com',
          'localhost:8080',
        ].some(domain => str.includes(domain));
      };

      // Only intercept if it matches our specific test domains
      if (shouldMock(urlStr)) {
        isExternal = true;
      } else if (urlObj) {
        if (shouldMock(urlObj.hostname) || shouldMock(urlObj.host)) {
          isExternal = true;
        }
      }

      if (!isExternal) {
        return original.apply(moduleCtx, [url, options, cb]);
      }

      // Create a fresh request object for each call
      const mockReq = new EventEmitter();
      mockReq.end = jest.fn();
      mockReq.destroy = jest.fn();
      mockReq.setTimeout = jest.fn();
      mockReq.setNoDelay = jest.fn();
      mockReq.setHeader = jest.fn();
      mockReq.getHeader = jest.fn();
      mockReq.write = jest.fn();
      mockReq.abort = jest.fn();
      mockReq.socket = new EventEmitter();
      mockReq.connection = mockReq.socket;

      let callback = cb;
      if (typeof options === 'function') {
        callback = options;
      }

      const mockRes = new EventEmitter();
      mockRes.statusCode = 200;
      mockRes.headers = { 'content-type': 'application/json' };
      mockRes.resume = jest.fn();
      mockRes.setEncoding = jest.fn();
      mockRes.pipe = jest.fn();
      mockRes.destroy = jest.fn();

      const emitEnd = () => {
        process.nextTick(() => {
          mockRes.emit('data', Buffer.from('{}'));
          mockRes.emit('end');
        });
      };

      if (callback) {
        callback(mockRes);
        emitEnd();
      } else {
        process.nextTick(() => mockReq.emit('response', mockRes));
        process.nextTick(emitEnd);
      }
      return mockReq;
    };

    jest.spyOn(https, 'get').mockImplementation(createMockImplementation(originalHttpsGet, https));
    jest.spyOn(http, 'get').mockImplementation(createMockImplementation(originalHttpGet, http));
    jest
      .spyOn(https, 'request')
      .mockImplementation(createMockImplementation(originalHttpsRequest, https));
    jest
      .spyOn(http, 'request')
      .mockImplementation(createMockImplementation(originalHttpRequest, http));
  });

  it('should return healthy status (200)', async () => {
    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services.database).toBe('ok');
    expect(res.body.services.storage_boxes).toBe('Good');
  });

  it('should report database error', async () => {
    jest.spyOn(db.sequelize, 'authenticate').mockRejectedValue(new Error('DB Error'));

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('error');
    expect(res.body.services.database).toBe('Error');
  });

  it('should report database error with non-standard error object', async () => {
    jest.spyOn(db.sequelize, 'authenticate').mockRejectedValue('String Error');

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('error');
    expect(res.body.services.database).toBe('Error');
  });

  it('should report disk warning', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockStatfs.mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 50, // 5% free -> 95% used (warning threshold is 90)
      bfree: 50,
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('warning');
    expect(res.body.services.storage_boxes).toBe('Warning');

    consoleSpy.mockRestore();
  });

  it('should report disk critical', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockStatfs.mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 10, // 1% free -> 99% used (critical threshold is 95)
      bfree: 10,
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('warning');
    expect(res.body.services.storage_boxes).toBe('Warning');

    consoleSpy.mockRestore();
  });

  it('should handle missing storage path', async () => {
    mockExistsSync.mockImplementation(pathArg => {
      const p = String(pathArg);
      if (p.includes('/box-storage')) {
        return false;
      }
      return originalFs.existsSync(pathArg);
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('error');
    expect(res.body.services.storage_boxes).toBe('Error');
  });

  it('should handle statfs error', async () => {
    mockStatfs.mockRejectedValue(new Error('FS Error'));

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('error');
    expect(res.body.services.storage_boxes).toBe('Error');
  });

  it('should handle OIDC provider failure', async () => {
    const mockReq = new EventEmitter();
    mockReq.end = jest.fn();
    mockReq.setNoDelay = jest.fn();
    mockReq.setHeader = jest.fn();
    mockReq.getHeader = jest.fn();
    mockReq.write = jest.fn();
    mockReq.abort = jest.fn();
    mockReq.on = (event, cb) => {
      if (event === 'error') {
        cb(new Error('Network Error'));
      }
    };
    https.get.mockReturnValue(mockReq);

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).not.toBe('ok');
    expect(res.body.services.oidc_providers).toContain('Bad');
  });

  it('should handle OIDC provider timeout', async () => {
    const mockReq = new EventEmitter();
    mockReq.end = jest.fn();
    mockReq.setTimeout = jest.fn((ms, cb) => {
      void ms;
      cb();
    }); // Trigger timeout
    mockReq.setNoDelay = jest.fn();
    mockReq.setHeader = jest.fn();
    mockReq.getHeader = jest.fn();
    mockReq.write = jest.fn();
    mockReq.abort = jest.fn();
    mockReq.destroy = jest.fn();
    https.get.mockReturnValue(mockReq);

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.services.oidc_providers).toContain('Bad');
  });

  it('should handle HTTP OIDC provider', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'auth') {
        return {
          auth: {
            oidc: {
              providers: {
                local: {
                  enabled: { value: true },
                  issuer: { value: 'http://localhost:8080' },
                },
              },
            },
          },
        };
      }
      return {};
    });

    const mockReq = new EventEmitter();
    mockReq.end = jest.fn();
    mockReq.setTimeout = jest.fn();
    mockReq.setNoDelay = jest.fn();
    mockReq.setHeader = jest.fn();
    mockReq.getHeader = jest.fn();
    mockReq.write = jest.fn();
    mockReq.abort = jest.fn();

    http.get.mockImplementation((url, options, cb) => {
      void url;
      let callback = cb;
      if (typeof options === 'function') {
        callback = options;
      }

      const req = new EventEmitter();
      req.end = jest.fn();
      req.setTimeout = jest.fn();
      req.setNoDelay = jest.fn();
      req.setHeader = jest.fn();
      req.getHeader = jest.fn();
      req.write = jest.fn();
      req.abort = jest.fn();
      req.socket = new EventEmitter();
      req.connection = req.socket;

      const mockRes = new EventEmitter();
      mockRes.statusCode = 200;
      mockRes.headers = { 'content-type': 'application/json' };
      mockRes.pipe = jest.fn();
      mockRes.destroy = jest.fn();
      mockRes.resume = jest.fn();

      if (callback) {
        callback(mockRes);
      } else {
        process.nextTick(() => mockReq.emit('response', mockRes));
      }
      process.nextTick(() => mockRes.emit('end'));
      return mockReq;
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.services.oidc_providers).toContain('Good');

    // http.get can be called with (url, options, cb) or (url, cb)
    // We check if it was called with at least the url and a function as the last argument
    expect(http.get).toHaveBeenCalled();
    const lastCall = http.get.mock.calls[http.get.mock.calls.length - 1];
    expect(lastCall[0]).toContain('http://');
    // The callback is the last argument
    expect(typeof lastCall[lastCall.length - 1]).toBe('function');
  });

  it('should handle version file read error', async () => {
    // Spy on readFileSync to throw ONLY for package.json
    mockReadFileSync.mockImplementation((pathArg, options) => {
      const p = String(pathArg);
      if (p.includes('package.json')) {
        throw new Error('Read Error');
      }
      return originalFs.readFileSync(pathArg, options);
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.version).toBe('0.0.0');
  });

  it('should handle top-level controller error', async () => {
    // Force error by making loadConfig throw
    mockConfigLoader.loadConfig.mockImplementation(() => {
      throw new Error('Config Error');
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(500);
    expect(res.body.status).toBe('error');
  });

  it('should trigger disk alerting', async () => {
    // Mock warning state
    mockStatfs.mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 50, // 5% free
      bfree: 50,
    });

    // Override config to ensure alert triggers
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          monitoring: {
            disk_space_critical_threshold: { value: 95 },
            disk_space_warning_threshold: { value: 90 },
            alert_frequency_hours: { value: 0 }, // Force alert
          },
          frontend_logging: {
            enabled: { value: true },
            level: { value: 'info' },
            categories: {
              app: { value: 'info' },
              auth: { value: 'info' },
              api: { value: 'info' },
              file: { value: 'info' },
              component: { value: 'debug' },
            },
          },
        };
      }
      if (name === 'mail') {
        return {
          smtp_settings: {
            alert_emails: { value: ['admin@example.com'] },
            from: { value: 'noreply@example.com' },
          },
          smtp_connect: {
            host: { value: 'localhost' },
            port: { value: 25 },
            secure: { value: false },
            rejectUnauthorized: { value: false },
          },
          smtp_auth: { user: { value: 'user' }, password: { value: 'pass' } },
        };
      }
      return {};
    });

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await request(app).get('/api/health');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ALERT] High disk usage detected')
    );

    consoleSpy.mockRestore();
  });

  it('should handle missing statfs (unsupported platform)', async () => {
    const originalStatfs = mockPromises.statfs;
    mockPromises.statfs = undefined;

    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.services.storage_boxes).toBe('Good');

    mockPromises.statfs = originalStatfs;
  });

  it('should handle OIDC provider check with mixed results', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'auth') {
        return {
          auth: {
            oidc: {
              providers: {
                good: { enabled: { value: true }, issuer: { value: 'https://good.com' } },
                bad: { enabled: { value: true }, issuer: { value: 'https://bad.com' } },
                warn: { enabled: { value: true }, issuer: { value: 'https://warn.com' } },
              },
            },
          },
        };
      }
      return {};
    });

    https.get.mockImplementation((url, cb) => {
      void url;
      const req = new EventEmitter();
      req.end = jest.fn();
      req.setTimeout = jest.fn();
      req.setNoDelay = jest.fn();
      req.setHeader = jest.fn();
      req.getHeader = jest.fn();
      req.write = jest.fn();
      req.abort = jest.fn();
      req.socket = new EventEmitter();
      req.connection = req.socket;

      const mockRes = new EventEmitter();
      mockRes.statusCode = 200;
      mockRes.headers = {};
      mockRes.resume = jest.fn();
      if (url === 'https://good.com') {
        mockRes.statusCode = 200;
      } else if (url === 'https://bad.com') {
        mockRes.statusCode = 500;
      } else if (url === 'https://warn.com') {
        mockRes.statusCode = 404;
      }

      if (cb) {
        cb(mockRes);
      } else {
        process.nextTick(() => req.emit('response', mockRes));
      }
      process.nextTick(() => mockRes.emit('end'));
      return req;
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.services.oidc_providers).toContain('1 Good');
    expect(res.body.services.oidc_providers).toContain('2 Bad');
  });

  it('should handle handleDiskAlerting with no emails configured', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'mail') {
        return {
          smtp_connect: { alert_email: { value: [] } },
          smtp_settings: { alert_emails: { value: [] } },
        };
      }
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          monitoring: {
            disk_space_critical_threshold: { value: 95 },
            disk_space_warning_threshold: { value: 90 },
            alert_frequency_hours: { value: 0 },
          },
          frontend_logging: {
            enabled: { value: true },
            level: { value: 'info' },
            categories: {
              app: { value: 'info' },
              auth: { value: 'info' },
              api: { value: 'info' },
              file: { value: 'info' },
              component: { value: 'debug' },
            },
          },
        };
      }
      if (name === 'auth') {
        return { auth: { oidc: { providers: {} } } };
      }
      return {};
    });

    mockStatfs.mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 50,
      bfree: 50,
    });
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await request(app).get('/api/health');
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('[ALERT]'));
    consoleSpy.mockRestore();
  });

  it('should send email alert on critical disk usage', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock critical disk usage
    mockStatfs.mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 10, // 1% free
      bfree: 10,
    });

    // Ensure config allows alerting
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          monitoring: {
            disk_space_critical_threshold: { value: 95 },
            disk_space_warning_threshold: { value: 90 },
            alert_frequency_hours: { value: 0 }, // 0 to allow immediate re-alerting
          },
          frontend_logging: {
            enabled: { value: true },
            level: { value: 'info' },
            categories: {
              app: { value: 'info' },
              auth: { value: 'info' },
              api: { value: 'info' },
              file: { value: 'info' },
              component: { value: 'debug' },
            },
          },
        };
      }
      if (name === 'mail') {
        return {
          smtp_connect: {
            host: { value: 'smtp.example.com' },
            port: { value: 587 },
            secure: { value: false },
            rejectUnauthorized: { value: false },
          },
          smtp_settings: {
            alert_emails: { value: ['admin@example.com'] },
            from: { value: 'noreply@example.com' },
          },
          smtp_auth: { user: { value: 'user' }, password: { value: 'pass' } },
        };
      }
      return {};
    });

    await request(app).get('/api/health');

    expect(mockCreateTransport).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        subject: expect.stringContaining('Critical Disk Usage'),
      })
    );

    consoleSpy.mockRestore();
  });

  it('should skip disabled OIDC providers', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'auth') {
        return {
          auth: {
            oidc: {
              providers: {
                disabled: { enabled: { value: false }, issuer: { value: 'https://disabled.com' } },
                enabled: { enabled: { value: true }, issuer: { value: 'https://enabled.com' } },
              },
            },
          },
        };
      }
      return {};
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    // Should not check disabled provider
    expect(https.get).toHaveBeenCalledTimes(1); // Only for enabled
    expect(https.get).toHaveBeenCalledWith(
      expect.stringContaining('enabled.com'),
      expect.any(Function)
    );
  });

  it('should handle OIDC provider with missing issuer', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'auth') {
        return {
          auth: { oidc: { providers: { broken: { enabled: { value: true } } } } },
        };
      }
      return {};
    });

    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
  });

  it('should handle OIDC config load error', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          frontend_logging: {
            enabled: { value: true },
            level: { value: 'info' },
            categories: {
              app: { value: 'info' },
              auth: { value: 'info' },
              api: { value: 'info' },
              file: { value: 'info' },
              component: { value: 'debug' },
            },
          },
        };
      }
      if (name === 'auth') {
        throw new Error('Auth Config Error');
      }
      return {};
    });

    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.services).not.toHaveProperty('oidc_providers');
  });

  it('should handle email sending failure', async () => {
    // Mock critical disk usage
    mockStatfs.mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 10, // 1% free
      bfree: 10,
    });

    // Ensure config allows alerting
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          monitoring: {
            disk_space_critical_threshold: { value: 95 },
            disk_space_warning_threshold: { value: 90 },
            alert_frequency_hours: { value: 0 }, // Force alert
          },
          frontend_logging: {
            enabled: { value: true },
            level: { value: 'info' },
            categories: {
              app: { value: 'info' },
              auth: { value: 'info' },
              api: { value: 'info' },
              file: { value: 'info' },
              component: { value: 'debug' },
            },
          },
        };
      }
      if (name === 'mail') {
        return {
          smtp_connect: {
            host: { value: 'localhost' },
            port: { value: 25 },
            secure: { value: false },
            rejectUnauthorized: { value: false },
          },
          smtp_settings: {
            alert_emails: { value: ['admin@example.com'] },
            from: { value: 'noreply@example.com' },
          },
          smtp_auth: { user: { value: 'user' }, password: { value: 'pass' } },
        };
      }
      return {};
    });

    mockSendMail.mockRejectedValueOnce(new Error('SMTP Error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await request(app).get('/api/health');

    expect(consoleSpy).toHaveBeenCalledWith('Failed to send alert email', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should report OIDC warning for rate limited provider', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'auth') {
        return {
          auth: {
            oidc: {
              providers: {
                rate_limited: { enabled: { value: true }, issuer: { value: 'https://warn.com' } },
              },
            },
          },
        };
      }
      return {};
    });

    // Mock https.get to return 429 for warn.com
    https.get.mockImplementation((url, cb) => {
      const req = new EventEmitter();
      req.end = jest.fn();
      req.setTimeout = jest.fn();
      req.setNoDelay = jest.fn();
      req.setHeader = jest.fn();
      req.getHeader = jest.fn();
      req.write = jest.fn();
      req.abort = jest.fn();
      req.socket = new EventEmitter();
      req.connection = req.socket;
      req.destroy = jest.fn();

      const mockRes = new EventEmitter();
      mockRes.statusCode = 200;
      mockRes.headers = {};
      mockRes.resume = jest.fn();

      if (url === 'https://warn.com') {
        mockRes.statusCode = 429;
      }

      if (cb) {
        cb(mockRes);
      } else {
        process.nextTick(() => req.emit('response', mockRes));
      }
      process.nextTick(() => mockRes.emit('end'));
      return req;
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.services.oidc_providers).toContain('1 Warn');
  });

  it('should use default logging config when missing', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          // frontend_logging missing
        };
      }
      return {};
    });

    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.frontend_logging.enabled).toBe(true); // Default
  });

  it('should handle missing OIDC configuration gracefully', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'auth') {
        return { auth: {} }; // No oidc
      }
      return {};
    });

    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.services).not.toHaveProperty('oidc_providers');
  });

  it('should handle disk alerting with undefined emails', async () => {
    mockStatfs.mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 10,
      bfree: 10,
    });

    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          monitoring: {
            disk_space_critical_threshold: { value: 95 },
            disk_space_warning_threshold: { value: 90 },
            alert_frequency_hours: { value: 0 },
          },
        };
      }
      if (name === 'mail') {
        return { smtp_settings: {} }; // No alert_emails
      }
      return {};
    });

    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
  });

  it('should handle missing version in package.json', async () => {
    mockReadFileSync.mockImplementation((pathArg, options) => {
      if (String(pathArg).includes('package.json')) {
        return JSON.stringify({}); // No version
      }
      return originalFs.readFileSync(pathArg, options);
    });

    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.version).toBe('0.0.0');
  });

  it('should skip malformed OIDC providers', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'auth') {
        return {
          auth: {
            oidc: {
              providers: {
                malformed1: {},
                malformed2: { enabled: {} }, // value missing
                malformed3: { enabled: { value: true } }, // issuer missing
              },
            },
          },
        };
      }
      return {};
    });

    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.services).not.toHaveProperty('oidc_providers');
  });

  it('should use default logging categories when partial config provided', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          frontend_logging: {
            enabled: { value: true },
            level: { value: 'info' },
            categories: {}, // Empty categories to trigger fallbacks
          },
        };
      }
      return {};
    });

    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.frontend_logging.categories.app).toBe('info');
    expect(res.body.frontend_logging.categories.auth).toBe('info');
    expect(res.body.frontend_logging.categories.component).toBe('debug');
  });

  it('should use default alert frequency when monitoring config is missing', async () => {
    // Mock critical disk usage to trigger alert logic
    mockStatfs.mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bavail: 10,
      bfree: 10,
    });

    // Advance time to ensure alert triggers even if previous tests set lastAlertTime
    const realNow = Date.now();
    const futureNow = realNow + 25 * 60 * 60 * 1000; // 25 hours later
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(futureNow);

    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          // monitoring config missing
        };
      }
      if (name === 'mail') {
        return {
          smtp_settings: {
            alert_emails: { value: ['admin@example.com'] },
            from: { value: 'noreply@example.com' },
          },
          smtp_connect: {
            host: { value: 'localhost' },
            port: { value: 25 },
            secure: { value: false },
            rejectUnauthorized: { value: false },
          },
          smtp_auth: { user: { value: 'user' }, password: { value: 'pass' } },
        };
      }
      return {};
    });

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Should not throw and should attempt to alert (since default frequency is 24h and lastAlertTime is 0)
    await request(app).get('/api/health');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[ALERT]'));
    consoleSpy.mockRestore();
    dateSpy.mockRestore();
  });

  it('should explicitly report Good OIDC providers', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'auth') {
        return {
          auth: {
            oidc: {
              providers: {
                explicit_good: {
                  enabled: { value: true },
                  issuer: { value: 'https://good-explicit.com' },
                },
              },
            },
          },
        };
      }
      // Return valid app config to avoid disk check errors
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          frontend_logging: { enabled: { value: true }, level: { value: 'info' }, categories: {} },
          monitoring: {
            disk_space_critical_threshold: { value: 95 },
            disk_space_warning_threshold: { value: 90 },
            alert_frequency_hours: { value: 24 },
          },
        };
      }
      return {};
    });

    // Mock https.get to return 200 OK
    https.get.mockImplementation((url, cb) => {
      void url;
      const mockReq = new EventEmitter();
      mockReq.end = jest.fn();
      mockReq.setTimeout = jest.fn();
      mockReq.setNoDelay = jest.fn();
      mockReq.setHeader = jest.fn();
      mockReq.getHeader = jest.fn();
      mockReq.write = jest.fn();
      mockReq.abort = jest.fn();
      mockReq.socket = new EventEmitter();
      mockReq.connection = mockReq.socket;
      mockReq.destroy = jest.fn();

      const mockRes = new EventEmitter();
      mockRes.statusCode = 200;
      mockRes.headers = {};
      mockRes.resume = jest.fn();

      if (cb) {
        cb(mockRes);
      } else {
        process.nextTick(() => mockReq.emit('response', mockRes));
      }
      process.nextTick(() => mockRes.emit('end'));
      return mockReq;
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.services.oidc_providers).toContain('1 Good');
  });

  it('should report multiple Good OIDC providers', async () => {
    mockConfigLoader.loadConfig.mockImplementation(name => {
      if (name === 'auth') {
        return {
          auth: {
            oidc: {
              providers: {
                p1: { enabled: { value: true }, issuer: { value: 'https://p1.com' } },
                p2: { enabled: { value: true }, issuer: { value: 'https://p2.com' } },
              },
            },
          },
        };
      }
      // Return valid app config
      if (name === 'app') {
        return {
          boxvault: { box_storage_directory: { value: '/box-storage' } },
          frontend_logging: { enabled: { value: true }, level: { value: 'info' }, categories: {} },
          monitoring: {
            disk_space_critical_threshold: { value: 95 },
            disk_space_warning_threshold: { value: 90 },
            alert_frequency_hours: { value: 24 },
          },
        };
      }
      return {};
    });

    https.get.mockImplementation((url, cb) => {
      void url;
      const mockReq = new EventEmitter();
      mockReq.end = jest.fn();
      mockReq.setTimeout = jest.fn();
      mockReq.setNoDelay = jest.fn();
      mockReq.setHeader = jest.fn();
      mockReq.getHeader = jest.fn();
      mockReq.write = jest.fn();
      mockReq.abort = jest.fn();
      mockReq.socket = new EventEmitter();
      mockReq.connection = mockReq.socket;
      mockReq.destroy = jest.fn();

      const mockRes = new EventEmitter();
      mockRes.statusCode = 200;
      mockRes.headers = {};
      mockRes.resume = jest.fn();

      if (cb) {
        cb(mockRes);
      } else {
        process.nextTick(() => mockReq.emit('response', mockRes));
      }
      process.nextTick(() => mockRes.emit('end'));
      return mockReq;
    });

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body.services.oidc_providers).toContain('2 Good');
  });

  it('should default environment to development if NODE_ENV is missing', async () => {
    const originalEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    try {
      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.environment).toBe('development');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
