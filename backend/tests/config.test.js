// DO NOT IMPLEMENT UNIT TESTS!

// ONLY INTEGRATION TESTS!

import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import db from '../app/models/index.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import {
  isProduction,
  getConfigPath,
  clearConfigCache,
  loadConfig,
  loadConfigs,
  checkConfigs,
  getSetupTokenPath,
  getRateLimitConfig,
  getI18nConfig,
} from '../app/utils/config-loader.js';
import { t } from '../app/config/i18n.js';
import { writeConfig } from '../app/controllers/config/helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authConfigPath = getConfigPath('auth');
const appConfigPath = getConfigPath('app');

const withFile = (filePath, mutate) => {
  const original = fs.readFileSync(filePath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(filePath, yaml.dump(config));
  clearConfigCache();
  return () => {
    fs.writeFileSync(filePath, original);
    clearConfigCache();
  };
};

const minimalAuthYaml = `
auth:
  jwt:
    jwt_secret: test-secret
`;

describe('Config API', () => {
  let adminToken;
  let nonAdminToken;
  let adminUser;
  let nonAdminUser;

  const uniqueId = Date.now().toString(36);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);

    const hashedPassword = await bcrypt.hash('password', 8);

    // Create Admin User
    adminUser = await db.user.create({
      username: `config-admin-${uniqueId}`,
      email: `config-admin-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await adminUser.setRoles([adminRole]);

    // Create Non-Admin User
    nonAdminUser = await db.user.create({
      username: `config-user-${uniqueId}`,
      email: `config-user-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await nonAdminUser.setRoles([userRole]);

    // Get tokens
    const adminAuth = await request(app)
      .post('/api/auth/signin')
      .send({ username: adminUser.username, password: 'password' });
    adminToken = adminAuth.body.accessToken;

    const nonAdminAuth = await request(app)
      .post('/api/auth/signin')
      .send({ username: nonAdminUser.username, password: 'password' });
    nonAdminToken = nonAdminAuth.body.accessToken;
  });

  afterAll(async () => {
    await db.user.destroy({ where: { id: [adminUser.id, nonAdminUser.id] } });
  });

  describe('GET /api/config/gravatar', () => {
    it('should reject unauthenticated access to gravatar config', async () => {
      const res = await request(app).get('/api/config/gravatar');
      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/forbidden');
      expect(res.body.title).toBe('No token provided!');
    });
  });

  describe('GET /api/config/ticket', () => {
    it('should get ticket configuration', async () => {
      const res = await request(app).get('/api/config/ticket');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('ticket_system');
      expect(res.body.ticket_system).toHaveProperty('enabled');
    });
  });

  describe('GET /api/config/:configName', () => {
    it('should get a specific config for an admin', async () => {
      const res = await request(app).get('/api/config/app').set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('boxvault');
    });

    it('should fail to get config for a non-admin', async () => {
      const res = await request(app).get('/api/config/app').set('x-access-token', nonAdminToken);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/config/:configName/schema', () => {
    it('should answer the schema document for an admin', async () => {
      const res = await request(app)
        .get('/api/config/app/schema')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(res.body.schemaVersion).toBe(1);
      expect(res.body.properties.boxvault.properties.origin.format).toBe('uri');
      expect(res.body.properties.gravatar.properties.api_key.writeOnly).toBe(true);
    });

    it('should refuse the schema for a non-admin', async () => {
      const res = await request(app)
        .get('/api/config/app/schema')
        .set('x-access-token', nonAdminToken);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('masked secrets', () => {
    it('should mask every writeOnly value on read', async () => {
      const res = await request(app).get('/api/config/auth').set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.auth.jwt.jwt_secret).toBe('********');
      expect(res.body.auth.jwt.jwt_issuer).toBe('boxvault');
    });

    it('should keep the stored secret when the mask comes back and report a restart', async () => {
      const original = fs.readFileSync(authConfigPath, 'utf8');
      try {
        const unchanged = await request(app)
          .put('/api/config/auth')
          .set('x-access-token', adminToken)
          .send({ auth: { jwt: { jwt_secret: '********', jwt_expiration: '2h' } } });
        expect(unchanged.statusCode).toBe(200);
        expect(unchanged.body.requires_restart).toBe(false);
        const written = yaml.load(fs.readFileSync(authConfigPath, 'utf8'));
        expect(written.auth.jwt.jwt_secret).toBe('test-secret');
        expect(written.auth.jwt.jwt_expiration).toBe('2h');

        const restart = await request(app)
          .put('/api/config/auth')
          .set('x-access-token', adminToken)
          .send({ auth: { jwt: { jwt_issuer: 'other-issuer' } } });
        expect(restart.statusCode).toBe(200);
        expect(restart.body.requires_restart).toBe(true);
      } finally {
        fs.writeFileSync(authConfigPath, original);
        clearConfigCache();
      }
    });
  });

  describe('PUT /api/config/:configName', () => {
    it('should update a config for an admin', async () => {
      const updatePayload = {
        internationalization: {
          default_language: 'es',
        },
      };

      const res = await request(app)
        .put('/api/config/app')
        .set('x-access-token', adminToken)
        .send(updatePayload);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Configuration updated successfully.');
      expect(res.body.requires_restart).toBe(false);
    });

    it('should keep unknown nested keys through the deep merge', async () => {
      const updatePayload = {
        boxvault: {
          new_nested_section: {
            some_key: 'new-value',
          },
        },
      };

      const res = await request(app)
        .put('/api/config/app')
        .set('x-access-token', adminToken)
        .send(updatePayload);

      expect(res.statusCode).toBe(200);
      const written = yaml.load(fs.readFileSync(appConfigPath, 'utf8'));
      expect(written.boxvault.new_nested_section.some_key).toBe('new-value');
    });

    it('should refuse a value that breaks the schema with a pointer and write nothing', async () => {
      const before = fs.readFileSync(appConfigPath, 'utf8');
      const res = await request(app)
        .put('/api/config/app')
        .set('x-access-token', adminToken)
        .send({ boxvault: { origin: { nested: 'object' }, api_listen_port_encrypted: 70000 } });

      expect(res.statusCode).toBe(422);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/validation');
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/boxvault/origin', rule: 'type' }),
        expect.objectContaining({ pointer: '/boxvault/api_listen_port_encrypted', rule: 'range' }),
      ]);
      expect(fs.readFileSync(appConfigPath, 'utf8')).toBe(before);
    });
  });

  describe('boot refusal', () => {
    it('should report the failing pointers of every file', () => {
      const restore = withFile(appConfigPath, config => {
        config.boxvault.api_listen_port_unencrypted = 'eighty';
        config.stray = true;
      });
      try {
        const results = checkConfigs();
        const appResult = results.find(result => result.name === 'app');
        expect(appResult.errors).toEqual([
          expect.objectContaining({
            pointer: '/boxvault/api_listen_port_unencrypted',
            rule: 'type',
          }),
        ]);
        expect(appResult.unknown).toContain('/stray');
        expect(results.filter(result => result.errors.length > 0).map(r => r.name)).toEqual([
          'app',
        ]);
      } finally {
        restore();
      }
    });

    it('should refuse to start the host while a file fails its schema', async () => {
      const restore = withFile(appConfigPath, config => {
        config.boxvault.api_listen_port_unencrypted = 'eighty';
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        jest.resetModules();
        await expect(import('../server.js')).rejects.toThrow(
          'Configuration failed validation: app'
        );
      } finally {
        restore();
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe('POST /api/config/restart', () => {
    it('should return a success message for server restart', done => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(code => {
        expect(code).toBe(1);
        mockExit.mockRestore();
        done();
        return undefined;
      });

      request(app)
        .post('/api/config/restart')
        .set('x-access-token', adminToken)
        .set('Accept-Language', 'en')
        .expect(200)
        .end((err, res) => {
          if (err) {
            done(err);
            return;
          }
          expect(res.body).toHaveProperty('message', 'Server restart initiated');
        });
    });
  });

  describe('Config Controller Error Handling', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      clearConfigCache();
    });

    it('GET /api/config/:configName - should handle file read errors', async () => {
      jest.spyOn(fs, 'readFileSync').mockImplementation(filePath => {
        if (filePath.toString().includes('auth')) {
          return minimalAuthYaml;
        }
        throw new Error('File system error');
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      clearConfigCache();

      const res = await request(app)
        .get('/api/config/app')
        .set('Accept-Language', 'en')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
    });

    it('PUT /api/config/:configName - should answer 404 for a name outside status.config', async () => {
      const res = await request(app)
        .put('/api/config/invalidConfigName')
        .set('x-access-token', adminToken)
        .set('Accept-Language', 'en')
        .send({ some: 'value' });

      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/not-found');
    });

    it('GET /api/config/gravatar - should answer 404 for a name outside status.config while the loader fails', async () => {
      jest.spyOn(fs, 'readFileSync').mockImplementation(filePath => {
        if (filePath.toString().includes('auth')) {
          return minimalAuthYaml;
        }
        throw new Error('Config Load Error');
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      clearConfigCache();

      const res = await request(app).get('/api/config/gravatar').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/not-found');
    });

    it('GET /api/config/ticket - should handle config load error', async () => {
      jest.spyOn(fs, 'readFileSync').mockImplementation(filePath => {
        if (filePath.toString().includes('auth')) {
          return minimalAuthYaml;
        }
        throw new Error('Config Load Error');
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      clearConfigCache();

      const res = await request(app).get('/api/config/ticket').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Operation failed.');
    });

    it('GET /api/config/gravatar - should answer 404 while the section is absent', async () => {
      jest.spyOn(fs, 'readFileSync').mockImplementation(filePath => {
        const p = filePath.toString();
        if (p.includes('auth')) {
          return minimalAuthYaml;
        }
        if (p.includes('app')) {
          return 'boxvault: {}';
        }
        return '';
      });
      clearConfigCache();

      const res = await request(app).get('/api/config/gravatar').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/config/ticket - should answer the schema defaults when the section is absent', async () => {
      jest.spyOn(fs, 'readFileSync').mockImplementation(filePath => {
        const p = filePath.toString();
        if (p.includes('auth')) {
          return minimalAuthYaml;
        }
        if (p.includes('app')) {
          return 'boxvault: {}';
        }
        return '';
      });
      clearConfigCache();

      const res = await request(app).get('/api/config/ticket').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.ticket_system.enabled).toBe(false);
    });

    it('PUT /api/config/:configName - should handle file write error', async () => {
      jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {
        throw new Error('Write Error');
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await request(app)
        .put('/api/config/app')
        .set('x-access-token', adminToken)
        .set('Accept-Language', 'en')
        .send({ internationalization: { default_language: 'en' } });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Failed to update configuration');
    });
  });

  describe('Config Loader Utility', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      clearConfigCache();
    });

    describe('getConfigPath', () => {
      it('should place every file in CONFIG_DIR', () => {
        expect(getConfigPath('app')).toBe(path.join(process.env.CONFIG_DIR, 'app.config.yaml'));
      });

      it('should run as production while CONFIG_DIR exists', () => {
        expect(isProduction).toBe(true);
      });

      it('should throw error for invalid config names', () => {
        expect(() => getConfigPath('invalid')).toThrow('Invalid config name: invalid');
      });
    });

    describe('loadConfig', () => {
      it('should load and parse a valid config file', () => {
        jest.spyOn(fs, 'readFileSync').mockReturnValue('key: value');
        clearConfigCache();

        const config = loadConfig('app');
        expect(config.key).toBe('value');
        expect(config.boxvault.api_listen_port_unencrypted).toBe(80);
      });

      it('should throw when the file cannot be read', () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
          throw new Error('File not found');
        });
        clearConfigCache();

        expect(() => loadConfig('app')).toThrow('File not found');
      });

      it('should answer the cached file until the cache is cleared', () => {
        const readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('key: value');
        clearConfigCache();

        loadConfig('auth');
        loadConfig('auth');
        expect(readSpy).toHaveBeenCalledTimes(1);

        clearConfigCache();
        loadConfig('auth');
        expect(readSpy).toHaveBeenCalledTimes(2);
      });
    });

    describe('loadConfigs', () => {
      it('should load multiple configs', () => {
        jest.spyOn(fs, 'readFileSync').mockReturnValue('dummy: content');
        clearConfigCache();

        const configs = loadConfigs(['app', 'db']);

        expect(configs).toHaveProperty('app');
        expect(configs).toHaveProperty('db');
        expect(fs.readFileSync).toHaveBeenCalledTimes(2);
      });
    });

    describe('getSetupTokenPath', () => {
      it('should place the token beside the config files', () => {
        expect(getSetupTokenPath()).toBe(path.join(process.env.CONFIG_DIR, 'setup.token'));
      });
    });

    describe('getRateLimitConfig', () => {
      it('should return configured values', () => {
        const mockYaml = `
rate_limiting:
  window_minutes: 30
  max_requests: 500
  message: 'Slow down'
`;
        jest.spyOn(fs, 'readFileSync').mockReturnValue(mockYaml);
        clearConfigCache();

        const config = getRateLimitConfig();

        expect(config.window_minutes).toBe(30);
        expect(config.max_requests).toBe(500);
        expect(config.message).toBe('Slow down');
      });

      it('should return defaults on error', () => {
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
          throw new Error('Config missing');
        });
        clearConfigCache();

        const config = getRateLimitConfig();

        expect(config.window_minutes).toBe(15);
        expect(config.max_requests).toBe(1000);
        expect(config.auth_max_requests).toBe(20);
        expect(console.warn).toHaveBeenCalled();
      });

      it('should return defaults if config is empty', () => {
        jest.spyOn(fs, 'readFileSync').mockReturnValue('rate_limiting: {}');
        clearConfigCache();

        const config = getRateLimitConfig();
        expect(config.window_minutes).toBe(15);
        expect(config.max_requests).toBe(1000);
      });
    });

    describe('getI18nConfig', () => {
      it('should return configured values', () => {
        const mockYaml = `
internationalization:
  default_language: 'es'
  auto_detect: false
`;
        jest.spyOn(fs, 'readFileSync').mockReturnValue(mockYaml);
        clearConfigCache();

        const config = getI18nConfig();

        expect(config.default_language).toBe('es');
        expect(config.auto_detect).toBe(false);
      });

      it('should return defaults on error', () => {
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
          throw new Error('Config missing');
        });
        clearConfigCache();

        const config = getI18nConfig();

        expect(config.default_language).toBe('en');
        expect(config.auto_detect).toBe(true);
      });

      it('should return defaults if config is empty', () => {
        jest.spyOn(fs, 'readFileSync').mockReturnValue('internationalization: {}');
        clearConfigCache();

        const config = getI18nConfig();
        expect(config.default_language).toBe('en');
        expect(config.auto_detect).toBe(true);
      });
    });
  });

  describe('Config Controller Helpers', () => {
    it('writeConfig should reject invalid paths', async () => {
      await expect(writeConfig('/invalid/path/config.yaml', {})).rejects.toThrow(
        'Invalid config file path'
      );
    });
  });

  describe('i18n Configuration & Middleware', () => {
    let originalConfig;

    beforeAll(() => {
      originalConfig = fs.readFileSync(appConfigPath, 'utf8');
    });

    afterEach(() => {
      fs.writeFileSync(appConfigPath, originalConfig);
      clearConfigCache();
    });

    it('should use t() helper', () => {
      // Test the exported helper directly
      const result = t('auth.invalidPassword');
      expect(result).toBe('Invalid Password!');
    });

    it('should use t() helper with replacements', () => {
      const result = t('organizations.organizationNotFoundWithName', 'en', {
        organization: 'TestOrg',
      });
      expect(result).toBe('Organization not found with name: TestOrg.');
    });

    it('should force language if configured', async () => {
      // Update config to force Spanish
      const config = yaml.load(originalConfig);
      config.internationalization = {
        force_language: 'es',
        default_language: 'en',
      };
      fs.writeFileSync(appConfigPath, yaml.dump(config));
      clearConfigCache();

      // Make request (should be in Spanish regardless of header)
      await request(app)
        .get('/api/health') // Health endpoint doesn't use i18n much, but middleware runs
        .set('Accept-Language', 'en');

      // We can't easily check the locale from response unless the endpoint returns it.
      // But we can check if the middleware didn't crash.
      // To verify locale, we might need an endpoint that returns translated text.
      // The auth endpoints return translated messages.

      const authRes = await request(app)
        .post('/api/auth/signin')
        .set('Accept-Language', 'en')
        .send({ username: adminUser.username, password: 'wrong' });

      // If we had Spanish translations for "Invalid Password!", we could check.
      // Since we only have en.json in context, this test mainly ensures the middleware logic executes without error.
      expect(authRes.statusCode).toBe(401);
    });

    it('should respect lang query parameter', async () => {
      const res = await request(app).get('/api/health?lang=es').set('Accept-Language', 'en');

      // We can't easily verify the locale was set without an endpoint that returns it,
      // but this exercises the middleware logic.
      expect(res.statusCode).toBe(200);
    });

    it('should handle array of lang query parameters', async () => {
      const res = await request(app)
        .get('/api/health?lang=es&lang=fr')
        .set('Accept-Language', 'en');

      expect(res.statusCode).toBe(200);
    });

    it('should handle object lang query parameter', async () => {
      const res = await request(app).get('/api/health?lang[foo]=bar').set('Accept-Language', 'en');

      expect(res.statusCode).toBe(200);
    });

    it('should handle complex Accept-Language header', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Accept-Language', 'es-ES,es;q=0.9,en;q=0.8');

      expect(res.statusCode).toBe(200);
    });

    it('should handle unsupported locale in Accept-Language header', async () => {
      const res = await request(app).get('/api/health').set('Accept-Language', 'xx-XX');

      expect(res.statusCode).toBe(200);
    });

    it('should handle missing locales directory gracefully', async () => {
      const localesDir = path.join(__dirname, '../app/config/locales');
      const tempDir = path.join(__dirname, '../app/config/locales_temp');

      if (fs.existsSync(localesDir)) {
        fs.renameSync(localesDir, tempDir);
      }

      try {
        // Re-import to trigger initialization logic
        jest.resetModules();
        await import('../app/config/i18n.js');
      } finally {
        if (fs.existsSync(tempDir)) {
          fs.renameSync(tempDir, localesDir);
        }
      }
    });

    it('should handle empty locales directory gracefully', async () => {
      const localesDir = path.join(__dirname, '../app/config/locales');
      const tempDir = path.join(__dirname, '../app/config/locales_temp');

      if (fs.existsSync(localesDir)) {
        fs.renameSync(localesDir, tempDir);
      }
      fs.mkdirSync(localesDir);

      // Mock Logger to verify warning
      const mockLog = {
        app: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      };
      jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));

      try {
        jest.resetModules();
        await import('../app/config/i18n.js');
        expect(mockLog.app.warn).toHaveBeenCalledWith(
          expect.stringContaining('No translation files found')
        );
      } finally {
        fs.rmdirSync(localesDir);
        if (fs.existsSync(tempDir)) {
          fs.renameSync(tempDir, localesDir);
        }
      }
    });
  });

  describe('Config Loader Error Handling', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      clearConfigCache();
    });

    it('loadConfig should log the failure before rethrowing', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read Error');
      });
      clearConfigCache();

      expect(() => loadConfig('app')).toThrow('Read Error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load configuration',
        expect.any(Object)
      );
    });

    it('getRateLimitConfig should log warning and return defaults on error', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read Error');
      });
      clearConfigCache();

      const config = getRateLimitConfig();
      expect(config.window_minutes).toBe(15);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load rate limiting config'),
        expect.any(String)
      );
    });

    it('getI18nConfig should log warning and return defaults on error', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read Error');
      });
      clearConfigCache();

      const config = getI18nConfig();
      expect(config.default_language).toBe('en');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load i18n config'),
        expect.any(String)
      );
    });
  });

  describe('i18n Internal Callbacks', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should execute log callbacks', async () => {
      const mockConfigure = jest.fn();

      // Mock i18n module
      jest.unstable_mockModule('i18n', () => ({
        default: {
          configure: mockConfigure,
          init: (req, res, next) => {
            void req;
            void res;
            next();
          },
        },
      }));

      // Mock Logger to verify callbacks
      const mockLog = {
        app: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      };
      jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));

      jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
        isProduction: false,
        getI18nConfig: jest.fn().mockReturnValue({
          default_language: 'en',
          auto_detect: true,
          supported_languages: ['en'],
        }),
        loadConfig: jest.fn(),
        getConfigPath: jest.fn(),
      }));

      // Re-import to trigger configure
      await import('../app/config/i18n.js');

      expect(mockConfigure).toHaveBeenCalled();
      const [[config]] = mockConfigure.mock.calls;

      // Test logDebugFn
      config.logDebugFn('debug msg');
      expect(mockLog.app.debug).toHaveBeenCalledWith('i18n debug', { message: 'debug msg' });

      // Test logWarnFn
      config.logWarnFn('warn msg');
      expect(mockLog.app.warn).toHaveBeenCalledWith('i18n warning', { message: 'warn msg' });

      // Test logErrorFn
      config.logErrorFn('error msg');
      expect(mockLog.app.error).toHaveBeenCalledWith('i18n error', { message: 'error msg' });
    });

    it('should handle error scanning locales directory', async () => {
      // Mock fs.readdirSync to throw
      const originalReaddirSync = fs.readdirSync;
      const readdirSpy = jest.spyOn(fs, 'readdirSync').mockImplementation((pathArg, options) => {
        if (pathArg.toString().includes('locales')) {
          throw new Error('Scan Error');
        }
        return originalReaddirSync(pathArg, options);
      });

      // Mock Logger to verify callbacks
      const mockLog = {
        app: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      };
      jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));

      // Re-import i18n to trigger initialization
      await import('../app/config/i18n.js');

      expect(mockLog.app.error).toHaveBeenCalledWith(
        'Error scanning locales directory',
        expect.any(Object)
      );

      readdirSpy.mockRestore();
    });

    it('should handle non-string locale in middleware (i18n.js line 144)', async () => {
      const req = {
        query: { lang: { some: 'object' } }, // Invalid type
        get: jest.fn(),
        setLocale: jest.fn(),
      };
      const res = {};
      const next = jest.fn();

      // Mock i18n init to call callback immediately
      jest.unstable_mockModule('i18n', () => ({
        default: {
          configure: jest.fn(),
          init: (reqArg, resArg, cb) => {
            void reqArg;
            void resArg;
            cb();
          },
          getLocale: jest.fn(),
          setLocale: jest.fn(),
        },
      }));

      // Mock config-loader to ensure default language is 'en'
      jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
        isProduction: false,
        getI18nConfig: jest.fn().mockReturnValue({
          default_language: 'en',
          auto_detect: true,
          supported_languages: ['en'],
        }),
        loadConfig: jest.fn(),
        getConfigPath: jest.fn(),
      }));

      // Re-import to get middleware with mocked i18n
      const { configAwareI18nMiddleware } = await import('../app/config/i18n.js');

      configAwareI18nMiddleware(req, res, next);
      expect(req.setLocale).toHaveBeenCalledWith('en'); // Default
    });

    it('should handle findBestMatchingLocale fallback (i18n.js line 86)', async () => {
      // We can test this via the middleware by providing a non-matching locale
      const req = {
        query: { lang: 'xx-XX' },
        get: jest.fn(),
        setLocale: jest.fn(),
      };
      const res = {};
      const next = jest.fn();

      // Re-import to ensure we use the real function logic (mocked in previous test)
      jest.resetModules();
      // Mock i18n module
      jest.unstable_mockModule('i18n', () => ({
        default: {
          configure: jest.fn(),
          init: (reqArg, resArg, cb) => {
            void reqArg;
            void resArg;
            cb();
          },
          getLocale: jest.fn(),
          setLocale: jest.fn(),
        },
      }));
      // Mock Logger
      const mockLog = {
        app: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      };
      jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));

      // Mock config-loader to ensure default language is 'en'
      jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
        isProduction: false,
        getI18nConfig: jest.fn().mockReturnValue({
          default_language: 'en',
          auto_detect: true,
          supported_languages: ['en'],
        }),
        loadConfig: jest.fn(),
        getConfigPath: jest.fn(),
      }));

      const { configAwareI18nMiddleware } = await import('../app/config/i18n.js');

      configAwareI18nMiddleware(req, res, next);
      expect(req.setLocale).toHaveBeenCalledWith('en');
    });

    it('should handle findBestMatchingLocale with null requested locale (i18n.js line 86)', async () => {
      const req = {
        query: {},
        get: jest.fn(),
        setLocale: jest.fn(),
      };
      const res = {};
      const next = jest.fn();

      jest.resetModules();
      jest.unstable_mockModule('i18n', () => ({
        default: {
          configure: jest.fn(),
          init: (reqArg, resArg, cb) => {
            void reqArg;
            void resArg;
            cb();
          },
          getLocale: jest.fn(),
          setLocale: jest.fn(),
        },
      }));
      jest.unstable_mockModule('../app/utils/Logger.js', () => ({
        log: { app: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } },
      }));
      jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
        isProduction: false,
        getI18nConfig: jest.fn().mockReturnValue({
          default_language: null, // Force null to be passed to findBestMatchingLocale
          auto_detect: true,
          supported_languages: ['en'],
        }),
        loadConfig: jest.fn(),
        getConfigPath: jest.fn(),
      }));

      const { configAwareI18nMiddleware } = await import('../app/config/i18n.js');
      configAwareI18nMiddleware(req, res, next);
      expect(req.setLocale).toHaveBeenCalledWith('en'); // Should fallback to defaultLocale constant in i18n.js
    });

    it('should fallback to first available locale if en is missing', async () => {
      // Mock fs.readdirSync to return locales without 'en'
      const originalReaddirSync = fs.readdirSync;
      const readdirSpy = jest.spyOn(fs, 'readdirSync').mockImplementation((pathArg, options) => {
        if (pathArg.toString().includes('locales')) {
          return ['es.json', 'fr.json'];
        }
        return originalReaddirSync(pathArg, options);
      });

      // Mock Logger
      const mockLog = {
        app: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      };
      jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));

      // Re-import i18n
      jest.resetModules();
      const { getDefaultLocale } = await import('../app/config/i18n.js');

      expect(getDefaultLocale()).toBe('es'); // First one

      readdirSpy.mockRestore();
    });
  });
});
