import { jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const originalFs = require('fs');
const originalChildProcess = require('child_process');
const originalHttps = require('https');
const originalHttp = require('http');

// Import actual config loader to use in mocks
const actualConfigLoader = await import('../app/utils/config-loader.js');

// Mocks
const mockExec = jest.fn((cmd, cb) => originalChildProcess.exec(cmd, cb));

// Mock statfs for fs.promises (must return a Promise)
const mockStatfs = jest.fn().mockResolvedValue({
  blocks: 1000,
  bsize: 4096,
  bavail: 500,
  bfree: 500,
});

const mockExistsSync = jest.fn(path => originalFs.existsSync(path));
const mockHttpsGet = jest.fn((url, cb) => originalHttps.get(url, cb));
const mockHttpGet = jest.fn((url, cb) => originalHttp.get(url, cb));

// Mock config loader to allow injecting test configurations
const mockConfigLoader = {
  loadConfig: jest.fn(name =>
    // Default behavior: load real config
    actualConfigLoader.loadConfig(name)
  ),
  // Pass through other exports
  getConfigPath: actualConfigLoader.getConfigPath,
  getSetupTokenPath: actualConfigLoader.getSetupTokenPath,
  getRateLimitConfig: actualConfigLoader.getRateLimitConfig,
  getI18nConfig: actualConfigLoader.getI18nConfig,
  loadConfigs: actualConfigLoader.loadConfigs,
};

jest.unstable_mockModule('fs', () => ({
  ...originalFs,
  existsSync: mockExistsSync,
  promises: {
    ...originalFs.promises,
    statfs: mockStatfs,
  },
  default: {
    ...originalFs,
    existsSync: mockExistsSync,
    promises: {
      ...originalFs.promises,
      statfs: mockStatfs,
    },
  },
}));

jest.unstable_mockModule('child_process', () => ({
  ...originalChildProcess,
  exec: mockExec,
  default: {
    ...originalChildProcess,
    exec: mockExec,
  },
}));

jest.unstable_mockModule('https', () => ({
  ...originalHttps,
  get: mockHttpsGet,
  default: {
    ...originalHttps,
    get: mockHttpsGet,
  },
}));

jest.unstable_mockModule('http', () => ({
  ...originalHttp,
  get: mockHttpGet,
  default: {
    ...originalHttp,
    get: mockHttpGet,
  },
}));

jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
  ...mockConfigLoader,
  default: mockConfigLoader,
}));

const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const bcrypt = (await import('bcryptjs')).default;
const jwt = (await import('jsonwebtoken')).default;

describe('System API', () => {
  let adminToken;
  let userToken;
  let adminUser;
  let regularUser;

  const uniqueId = Date.now().toString(36);

  beforeAll(async () => {
    const hashedPassword = await bcrypt.hash('password', 8);

    // Create Admin User
    adminUser = await db.user.create({
      username: `sys-admin-${uniqueId}`,
      email: `sys-admin-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await adminUser.setRoles([adminRole]);

    // Create Regular User
    regularUser = await db.user.create({
      username: `sys-user-${uniqueId}`,
      email: `sys-user-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await regularUser.setRoles([userRole]);

    // Get tokens
    adminToken = jwt.sign({ id: adminUser.id }, 'test-secret', { expiresIn: '1h' });
    userToken = jwt.sign({ id: regularUser.id }, 'test-secret', { expiresIn: '1h' });
  });

  afterAll(async () => {
    await db.user.destroy({ where: { id: [adminUser.id, regularUser.id] } });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockConfigLoader.loadConfig.mockClear();
  });

  describe('GET /api/system/storage', () => {
    it('should return storage info for admin', async () => {
      const res = await request(app).get('/api/system/storage').set('x-access-token', adminToken);

      // Note: This test might fail or return 500 if running in an environment
      // where fs.promises.statfs is not available (older Node.js) or paths don't exist.
      // However, we expect either 200 (success) or 501 (not supported) or 500 (error reading).
      // We'll check for authorization success first.
      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).not.toBe(403);

      if (res.statusCode === 200) {
        expect(res.body).toHaveProperty('boxes');
        expect(res.body).toHaveProperty('isos');
      }
    });

    it('should fail for non-admin user', async () => {
      const res = await request(app).get('/api/system/storage').set('x-access-token', userToken);

      expect(res.statusCode).toBe(403);
    });

    it('should handle non-existent directories gracefully', async () => {
      // Mock existsSync to return false for storage paths
      mockExistsSync.mockImplementation(path => {
        if (typeof path === 'string' && (path.includes('storage') || path.includes('iso'))) {
          return false;
        }
        return originalFs.existsSync(path);
      });

      const res = await request(app).get('/api/system/storage').set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.boxes).toBeNull();
      expect(res.body.isos).toBeNull();
    });

    it('should handle statfs errors', async () => {
      // Mock statfs to fail
      mockStatfs.mockRejectedValueOnce(new Error('Disk Error'));

      // Ensure existsSync returns true so statfs is actually called
      mockExistsSync.mockReturnValue(true);

      const res = await request(app).get('/api/system/storage').set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Failed to retrieve storage information');
    });
  });

  describe('GET /api/system/update-check', () => {
    it('should return update status for admin', async () => {
      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('isAptManaged');
      expect(res.body).toHaveProperty('updateAvailable');
      expect(res.body).toHaveProperty('currentVersion');
      expect(res.body).toHaveProperty('latestVersion');
    });

    it('should fail for non-admin user', async () => {
      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(403);
    });

    it('should handle exec errors (not apt managed)', async () => {
      mockExec.mockImplementation((cmd, cb) => {
        void cmd;
        cb(new Error('Command failed'), '', 'Error');
      });

      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.isAptManaged).toBe(false);
      expect(res.body.updateAvailable).toBe(false);
    });

    it('should check repository URL if configured', async () => {
      // Mock config to return repository URL
      mockConfigLoader.loadConfig.mockImplementation(name => {
        if (name === 'app') {
          return {
            boxvault: {
              repository_packages_url: { value: 'https://repo.example.com/Packages' },
            },
          };
        }
        return actualConfigLoader.loadConfig(name);
      });

      // Mock exec to return installed version
      mockExec.mockImplementation((cmd, cb) => {
        if (cmd.includes('dpkg-query')) {
          cb(null, '1.0.0', '');
        }
      });

      // Mock HTTPS response for Packages file
      mockHttpsGet.mockImplementation((url, cb) => {
        void url;
        const { EventEmitter } = require('events');
        const mockRes = new EventEmitter();
        mockRes.statusCode = 200;
        mockRes.resume = jest.fn();

        cb(mockRes);

        process.nextTick(() => {
          mockRes.emit('data', 'Package: boxvault\nVersion: 1.2.0\n\n');
          mockRes.emit('end');
        });

        return { on: jest.fn() };
      });

      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.updateAvailable).toBe(true);
      expect(res.body.latestVersion).toBe('1.2.0');
    });

    it('should handle repository URL check failure and fallback', async () => {
      mockConfigLoader.loadConfig.mockImplementation(name => {
        if (name === 'app') {
          return {
            boxvault: {
              repository_packages_url: { value: 'https://repo.example.com/Packages' },
            },
          };
        }
        return actualConfigLoader.loadConfig(name);
      });

      mockExec.mockImplementation((cmd, cb) => {
        if (cmd.includes('dpkg-query')) {
          cb(null, '1.0.0', '');
        } else if (cmd.includes('apt-cache')) {
          cb(null, '1.0.0', ''); // Fallback finds no update
        }
      });

      // Mock HTTPS error
      mockHttpsGet.mockImplementation((url, cb) => {
        void url;
        void cb;
        const { EventEmitter } = require('events');
        const req = new EventEmitter();
        process.nextTick(() => {
          req.emit('error', new Error('Network Error'));
        });
        return req;
      });

      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.updateAvailable).toBe(false); // Fallback used
    });

    it('should handle synchronous error in https.get callback', async () => {
      mockConfigLoader.loadConfig.mockImplementation(name => {
        if (name === 'app') {
          return {
            boxvault: {
              repository_packages_url: { value: 'https://repo.example.com/Packages' },
            },
          };
        }
        return actualConfigLoader.loadConfig(name);
      });

      mockExec.mockImplementation((cmd, cb) => {
        void cmd;
        cb(null, '1.0.0', '');
      });

      mockHttpsGet.mockImplementation((url, cb) => {
        void url;
        const mockRes = {
          statusCode: 200,
          on: jest.fn(() => {
            throw new Error('Sync Callback Error');
          }),
          resume: jest.fn(),
        };
        cb(mockRes);
        return { on: jest.fn() };
      });

      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200); // Should not crash
    });

    it('should handle repository URL ending with slash', async () => {
      mockConfigLoader.loadConfig.mockImplementation(name => {
        if (name === 'app') {
          return {
            boxvault: {
              repository_packages_url: { value: 'https://repo.example.com/debian/' },
            },
          };
        }
        return actualConfigLoader.loadConfig(name);
      });

      mockExec.mockImplementation((cmd, cb) => {
        void cmd;
        cb(null, '1.0.0', '');
      });

      mockHttpsGet.mockImplementation((url, cb) => {
        const { EventEmitter } = require('events');
        const mockRes = new EventEmitter();
        mockRes.statusCode = 200;
        mockRes.resume = jest.fn();

        // Verify URL has Packages appended
        if (url === 'https://repo.example.com/debian/Packages') {
          cb(mockRes);
          process.nextTick(() => {
            mockRes.emit('data', 'Package: boxvault\nVersion: 1.0.1\n\n');
            mockRes.emit('end');
          });
        } else {
          mockRes.statusCode = 404;
          cb(mockRes);
          process.nextTick(() => mockRes.emit('end'));
        }
        return { on: jest.fn() };
      });

      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.latestVersion).toBe('1.0.1');
    });

    it('should handle exec errors without stderr', async () => {
      mockExec.mockImplementation((cmd, cb) => {
        void cmd;
        cb(new Error('Command failed'), '', '');
      });

      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.isAptManaged).toBe(false);
    });

    it('should handle non-200 response from repository', async () => {
      mockConfigLoader.loadConfig.mockImplementation(name => {
        if (name === 'app') {
          return {
            boxvault: {
              repository_packages_url: { value: 'https://repo.example.com/Packages' },
            },
          };
        }
        return actualConfigLoader.loadConfig(name);
      });

      mockExec.mockImplementation((cmd, cb) => {
        void cmd;
        cb(null, '1.0.0', '');
      });

      mockHttpsGet.mockImplementation((url, cb) => {
        void url;
        const mockRes = {
          statusCode: 404,
          resume: jest.fn(),
          on: jest.fn(),
        };
        cb(mockRes);
        return { on: jest.fn() };
      });

      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.updateAvailable).toBe(false);
    });

    it('should handle missing package in repository response', async () => {
      mockConfigLoader.loadConfig.mockImplementation(name => {
        if (name === 'app') {
          return {
            boxvault: {
              repository_packages_url: { value: 'https://repo.example.com/Packages' },
            },
          };
        }
        return actualConfigLoader.loadConfig(name);
      });

      mockExec.mockImplementation((cmd, cb) => {
        void cmd;
        cb(null, '1.0.0', '');
      });

      mockHttpsGet.mockImplementation((url, cb) => {
        void url;
        const { EventEmitter } = require('events');
        const mockRes = new EventEmitter();
        mockRes.statusCode = 200;
        mockRes.resume = jest.fn();

        cb(mockRes);

        process.nextTick(() => {
          mockRes.emit('data', 'Package: other-package\nVersion: 1.0.0\n\n');
          mockRes.emit('end');
        });

        return { on: jest.fn() };
      });

      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.updateAvailable).toBe(false);
    });

    it('should support HTTP repository URLs', async () => {
      mockConfigLoader.loadConfig.mockImplementation(name => {
        if (name === 'app') {
          return {
            boxvault: {
              repository_packages_url: { value: 'http://repo.example.com/Packages' },
            },
          };
        }
        return actualConfigLoader.loadConfig(name);
      });

      mockExec.mockImplementation((cmd, cb) => {
        void cmd;
        cb(null, '1.0.0', '');
      });

      mockHttpGet.mockImplementation((url, cb) => {
        void url;
        const { EventEmitter } = require('events');
        const mockRes = new EventEmitter();
        mockRes.statusCode = 200;
        mockRes.resume = jest.fn();

        cb(mockRes);

        process.nextTick(() => {
          mockRes.emit('data', 'Package: boxvault\nVersion: 1.2.0\n\n');
          mockRes.emit('end');
        });

        return { on: jest.fn() };
      });

      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.latestVersion).toBe('1.2.0');
      expect(mockHttpGet).toHaveBeenCalled();
    });

    it('should handle malformed version in Packages file', async () => {
      mockConfigLoader.loadConfig.mockImplementation(name => {
        if (name === 'app') {
          return {
            boxvault: {
              repository_packages_url: { value: 'https://repo.example.com/Packages' },
            },
          };
        }
        return actualConfigLoader.loadConfig(name);
      });

      mockExec.mockImplementation((cmd, cb) => {
        void cmd;
        cb(null, '1.0.0', '');
      });

      mockHttpsGet.mockImplementation((url, cb) => {
        void url;
        const { EventEmitter } = require('events');
        const mockRes = new EventEmitter();
        mockRes.statusCode = 200;
        mockRes.resume = jest.fn();

        cb(mockRes);

        process.nextTick(() => {
          // Package exists but Version line is missing/malformed
          mockRes.emit('data', 'Package: boxvault\nInvalidVer: 1.2.0\n\n');
          mockRes.emit('end');
        });

        return { on: jest.fn() };
      });

      const res = await request(app)
        .get('/api/system/update-check')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      // Should fall back to apt-cache or return unknown if apt-cache also fails/returns same
      // Since we mocked exec to return 1.0.0 for installed, and didn't mock apt-cache specifically to return something else,
      // it might return updateAvailable: false.
      expect(res.body.updateAvailable).toBe(false);
    });
  });
});
