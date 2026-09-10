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
import { createServer } from 'net';
import { fileURLToPath } from 'url';
import {
  isProduction,
  getConfigDir,
  getConfigPath,
  getSetupTokenPath,
  reloadConfig,
  loadConfig,
  getRateLimitConfig,
  getI18nConfig,
} from '../app/utils/config-loader.js';
import { t } from '../app/config/i18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appConfigPath = getConfigPath('app');

const readApp = () => yaml.load(fs.readFileSync(appConfigPath, 'utf8'));

const closedPort = async () => {
  const listener = createServer();
  await new Promise(resolve => {
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address();
  await new Promise(resolve => {
    listener.close(resolve);
  });
  return port;
};

describe('Config API', () => {
  let adminToken;
  let nonAdminToken;
  let adminUser;
  let nonAdminUser;
  let originalApp;

  const uniqueId = Date.now().toString(36);

  const putApp = body =>
    request(app).put('/api/config/app').set('x-access-token', adminToken).send(body);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    originalApp = fs.readFileSync(appConfigPath, 'utf8');

    const hashedPassword = await bcrypt.hash('password', 8);

    adminUser = await db.user.create({
      username: `config-admin-${uniqueId}`,
      email: `config-admin-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await adminUser.setRoles([adminRole]);

    nonAdminUser = await db.user.create({
      username: `config-user-${uniqueId}`,
      email: `config-user-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await nonAdminUser.setRoles([userRole]);

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
    fs.writeFileSync(appConfigPath, originalApp);
    await reloadConfig();
    fs.rmSync(path.join(getConfigDir(), 'ssl'), { recursive: true, force: true });
    await db.user.destroy({ where: { id: [adminUser.id, nonAdminUser.id] } });
  });

  describe('names outside status.config', () => {
    it('should answer 404 not-found before any guard', async () => {
      const res = await request(app).get('/api/config/gravatar');
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/not-found');

      const put = await request(app)
        .put('/api/config/invalidConfigName')
        .set('x-access-token', adminToken)
        .send({ some: 'value' });
      expect(put.statusCode).toBe(404);
    });
  });

  describe('GET /api/config/ticket', () => {
    it('should answer the filled ticket section without auth', async () => {
      const res = await request(app).get('/api/config/ticket');
      expect(res.statusCode).toBe(200);
      expect(res.body.ticket_system.enabled).toBe(true);
      expect(res.body.ticket_system.req_type).toBe('sso');
    });
  });

  describe('GET /api/config/:name', () => {
    it('should answer the raw file to an admin, nothing filled and nothing masked', async () => {
      const res = await request(app).get('/api/config/app').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(readApp());
      expect(res.body.ticket_system.req_type).toBeUndefined();
      expect(res.body.gravatar).toBeUndefined();

      const auth = await request(app).get('/api/config/auth').set('x-access-token', adminToken);
      expect(auth.body.auth.jwt.jwt_secret).toBe('test-secret');
    });

    it('should refuse a non-admin', async () => {
      const res = await request(app).get('/api/config/app').set('x-access-token', nonAdminToken);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/config/:name/schema', () => {
    it('should answer the schema document verbatim for an admin', async () => {
      const res = await request(app)
        .get('/api/config/app/schema')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(res.body.schemaVersion).toBe(1);
      expect(res.body.properties.boxvault.properties.origin.restartReason).toEqual(
        expect.any(String)
      );
      expect(res.body.properties.ssl.properties.cert_path.action).toEqual({
        kind: 'upload',
        route: '/api/config/app/upload',
        method: 'POST',
        body: 'file',
        step_up: false,
      });

      const mail = await request(app)
        .get('/api/config/mail/schema')
        .set('x-access-token', adminToken);
      expect(mail.body.sections.mail.action.kind).toBe('test');
    });

    it('should refuse the schema for a non-admin', async () => {
      const res = await request(app)
        .get('/api/config/app/schema')
        .set('x-access-token', nonAdminToken);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /api/config/:name', () => {
    it('should merge a sent key, keep an omitted one and write nothing else', async () => {
      const res = await putApp({ internationalization: { default_language: 'es' } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'Configuration saved.', requires_restart: [] });
      const written = readApp();
      expect(written.internationalization).toEqual({ default_language: 'es' });
      expect(written.boxvault.origin).toBe('http://localhost:3000');
      expect(written.ticket_system.req_type).toBeUndefined();
      expect(loadConfig('app').internationalization.default_language).toBe('es');
    });

    it('should remove a key on null and write a blank blank', async () => {
      const cleared = await putApp({ internationalization: null, gravatar: { api_key: '' } });
      expect(cleared.statusCode).toBe(200);
      const written = readApp();
      expect(Object.hasOwn(written, 'internationalization')).toBe(false);
      expect(written.gravatar.api_key).toBe('');
      expect(loadConfig('app').internationalization.default_language).toBe('en');

      const numeric = await putApp({ boxvault: { upload_timeout_hours: null } });
      expect(numeric.statusCode).toBe(200);
      expect(Object.hasOwn(readApp().boxvault, 'upload_timeout_hours')).toBe(false);
    });

    it('should replace an array whole', async () => {
      await putApp({ boxvault: { allowed_origins: ['https://a.example', 'https://b.example'] } });
      const res = await putApp({ boxvault: { allowed_origins: ['https://c.example'] } });
      expect(res.statusCode).toBe(200);
      expect(readApp().boxvault.allowed_origins).toEqual(['https://c.example']);
      expect(res.body.requires_restart).toEqual([
        {
          pointer: '/boxvault/allowed_origins',
          title: 'Allowed origins',
          reason: 'the CORS origin list is built at boot',
        },
      ]);
    });

    it('should refuse a readOnly key', async () => {
      const res = await putApp({ schemaVersion: 2 });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/schemaVersion', rule: 'readOnly', params: {} }),
      ]);
    });

    it('should refuse a value that breaks the schema with pointers and write nothing', async () => {
      const before = fs.readFileSync(appConfigPath, 'utf8');
      const res = await putApp({
        boxvault: { origin: { nested: 'object' }, api_listen_port_encrypted: 70000 },
      });
      expect(res.statusCode).toBe(422);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/validation');
      expect(res.body.title).toBe('The configuration did not pass validation.');
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/boxvault/origin', rule: 'type' }),
        expect.objectContaining({
          pointer: '/boxvault/api_listen_port_encrypted',
          rule: 'maximum',
          params: { maximum: 65535 },
        }),
      ]);
      expect(fs.readFileSync(appConfigPath, 'utf8')).toBe(before);
    });

    it('should refuse an unwritable storage directory with the service user', async () => {
      const res = await putApp({ boxvault: { box_storage_directory: '/proc/boxvault-storage' } });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/boxvault/box_storage_directory',
          rule: 'writable',
          params: { user: 'boxvault' },
        }),
      ]);
    });

    it('should answer 400 for a body that is not an object', async () => {
      const res = await request(app)
        .put('/api/config/app')
        .set('x-access-token', adminToken)
        .set('Content-Type', 'application/json')
        .send('[]');
      expect(res.statusCode).toBe(400);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/bad-request');
    });

    it('should keep a backup beside the file', () => {
      expect(fs.existsSync(`${appConfigPath}.bak`)).toBe(true);
      expect(fs.existsSync(`${appConfigPath}.tmp`)).toBe(false);
    });
  });

  describe('the reachable hook', () => {
    const mailConfigPath = getConfigPath('mail');

    it('should refuse a mail host whose port does not answer on save, with host and port', async () => {
      const port = await closedPort();
      const before = fs.readFileSync(mailConfigPath, 'utf8');
      const res = await request(app)
        .put('/api/config/mail')
        .set('x-access-token', adminToken)
        .send({ smtp_connect: { host: '127.0.0.1', port } });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/smtp_connect/host',
          rule: 'reachable',
          params: { host: '127.0.0.1', port },
        }),
      ]);
      expect(fs.readFileSync(mailConfigPath, 'utf8')).toBe(before);
    });

    it('should never probe the mail host at load', async () => {
      const port = await closedPort();
      const original = fs.readFileSync(mailConfigPath, 'utf8');
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
      const config = yaml.load(original);
      config.smtp_connect = { host: '127.0.0.1', port };
      fs.writeFileSync(mailConfigPath, yaml.dump(config));
      try {
        await reloadConfig();
        expect(exitSpy).not.toHaveBeenCalled();
        expect(loadConfig('mail').smtp_connect.port).toBe(port);
      } finally {
        fs.writeFileSync(mailConfigPath, original);
        exitSpy.mockRestore();
        await reloadConfig();
      }
    });
  });

  describe('the restart list', () => {
    it('should list the changed flagged leaves and hold the union until the restart', async () => {
      const changed = await putApp({ boxvault: { api_listen_port_encrypted: 5003 } });
      expect(changed.statusCode).toBe(200);
      expect(changed.body.requires_restart).toEqual([
        {
          pointer: '/boxvault/api_listen_port_encrypted',
          title: 'HTTPS port',
          reason: 'the HTTPS listener is bound at boot',
        },
      ]);

      const unchanged = await putApp({ boxvault: { api_listen_port_encrypted: 5003 } });
      expect(unchanged.body.requires_restart).toEqual([]);

      const status = await request(app)
        .get('/api/config/restart-status')
        .set('x-access-token', adminToken);
      expect(status.statusCode).toBe(200);
      expect(status.body.restart_required).toBe(true);
      expect(status.body.requires_restart.map(entry => entry.pointer)).toEqual(
        expect.arrayContaining(['/boxvault/api_listen_port_encrypted', '/boxvault/allowed_origins'])
      );
      expect(status.body.last_modified_by).toBe(adminUser.email);
      expect(status.body.last_modified_time).toMatch(/Z$/);

      await putApp({ boxvault: { api_listen_port_encrypted: 5002 } });
    });

    it('should refuse the status to a non-admin', async () => {
      const res = await request(app)
        .get('/api/config/restart-status')
        .set('x-access-token', nonAdminToken);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/config/restart', () => {
    it('should answer 202, clear the list and call the exit function after the answer', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
      try {
        const res = await request(app)
          .post('/api/config/restart')
          .set('x-access-token', adminToken);
        expect(res.statusCode).toBe(202);
        expect(res.body).toEqual({ message: 'Restarting.' });
        await new Promise(resolve => {
          setImmediate(resolve);
        });
        expect(exitSpy).toHaveBeenCalledWith(1);

        const status = await request(app)
          .get('/api/config/restart-status')
          .set('x-access-token', adminToken);
        expect(status.body).toMatchObject({ restart_required: false, requires_restart: [] });
      } finally {
        exitSpy.mockRestore();
      }
    });
  });

  describe('POST /api/config/:name/upload', () => {
    const sslDir = path.join(getConfigDir(), 'ssl');

    beforeAll(async () => {
      const res = await putApp({
        ssl: { cert_path: 'ssl/public.crt', key_path: 'ssl/private.key' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('should write the upload at the path the property holds, under the config directory', async () => {
      const res = await request(app)
        .post('/api/config/app/upload')
        .set('x-access-token', adminToken)
        .field('pointer', '/ssl/cert_path')
        .attach('file', Buffer.from('certificate content'), 'server.crt');
      expect(res.statusCode).toBe(200);
      expect(res.body.path).toBe(path.join(fs.realpathSync(getConfigDir()), 'ssl', 'public.crt'));
      expect(fs.readFileSync(path.join(sslDir, 'public.crt'), 'utf8')).toBe('certificate content');
      expect(readApp().ssl.cert_path).toBe('ssl/public.crt');
    });

    it('should refuse a pointer that names no upload property', async () => {
      const res = await request(app)
        .post('/api/config/app/upload')
        .set('x-access-token', adminToken)
        .field('pointer', '/boxvault/origin')
        .attach('file', Buffer.from('x'), 'x.crt');
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/pointer', rule: 'pointer', params: {} }),
      ]);
    });

    it('should refuse a missing file part', async () => {
      const res = await request(app)
        .post('/api/config/app/upload')
        .set('x-access-token', adminToken)
        .field('pointer', '/ssl/key_path');
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/file', rule: 'required' }),
      ]);
    });

    it('should refuse a path outside the config directory as writable', async () => {
      await putApp({ ssl: { key_path: '/etc/boxvault-elsewhere/private.key' } });
      const res = await request(app)
        .post('/api/config/app/upload')
        .set('x-access-token', adminToken)
        .field('pointer', '/ssl/key_path')
        .attach('file', Buffer.from('key'), 'k.key');
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/ssl/key_path', rule: 'writable' }),
      ]);
      await putApp({ ssl: { key_path: 'ssl/private.key' } });
    });

    it('should answer 413 above the upload limit', async () => {
      const res = await request(app)
        .post('/api/config/app/upload')
        .set('x-access-token', adminToken)
        .field('pointer', '/ssl/cert_path')
        .attach('file', Buffer.alloc(2 * 1024 * 1024), 'big.crt');
      expect(res.statusCode).toBe(413);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/payload-too-large');
    });

    it('should refuse a caller without the admin session or the setup token', async () => {
      const res = await request(app)
        .post('/api/config/app/upload')
        .set('Authorization', 'Bearer not-the-token')
        .field('pointer', '/ssl/cert_path')
        .attach('file', Buffer.from('x'), 'x.crt');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('boot refusal', () => {
    it('should log every failing pointer and stop the process', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const config = readApp();
      config.boxvault.api_listen_port_unencrypted = 'eighty';
      config.stray = true;
      fs.writeFileSync(appConfigPath, yaml.dump(config));
      try {
        await reloadConfig();
        expect(exitSpy).toHaveBeenCalledWith(1);
        const lines = stderrSpy.mock.calls.map(([line]) => JSON.parse(line));
        expect(lines).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              level: 'error',
              config: 'app',
              pointer: '/boxvault/api_listen_port_unencrypted',
              rule: 'type',
            }),
            expect.objectContaining({ level: 'warn', config: 'app', pointer: '/stray' }),
          ])
        );
      } finally {
        fs.writeFileSync(appConfigPath, originalApp);
        exitSpy.mockRestore();
        stderrSpy.mockRestore();
        await reloadConfig();
      }
    });
  });

  describe('the loader', () => {
    it('should place every file and the token in CONFIG_DIR', () => {
      expect(getConfigPath('app')).toBe(path.join(process.env.CONFIG_DIR, 'app.config.yaml'));
      expect(getSetupTokenPath()).toBe(path.join(process.env.CONFIG_DIR, 'setup.token'));
      expect(isProduction).toBe(true);
      expect(() => getConfigPath('invalid')).toThrow('Invalid config name: invalid');
      expect(() => loadConfig('invalid')).toThrow('Invalid config name: invalid');
    });

    it('should answer the filled document as a copy', () => {
      const first = loadConfig('app');
      first.boxvault.origin = 'changed';
      expect(loadConfig('app').boxvault.origin).toBe('http://localhost:3000');
      expect(loadConfig('app').boxvault.api_listen_port_unencrypted).toBe(
        Number(process.env.TEST_PORT) || 5001
      );
    });

    it('should answer the rate limiting and i18n sections with their defaults filled', () => {
      expect(getRateLimitConfig()).toMatchObject({ window_minutes: 15, max_requests: 1000000 });
      expect(getI18nConfig()).toMatchObject({
        default_language: 'en',
        auto_detect: true,
        force_language: null,
      });
    });
  });

  describe('i18n Configuration & Middleware', () => {
    afterEach(async () => {
      fs.writeFileSync(appConfigPath, originalApp);
      await reloadConfig();
    });

    it('should use t() helper', () => {
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
      const config = yaml.load(originalApp);
      config.internationalization = {
        force_language: 'es',
        default_language: 'en',
      };
      fs.writeFileSync(appConfigPath, yaml.dump(config));
      await reloadConfig();

      await request(app).get('/api/health').set('Accept-Language', 'en');

      const authRes = await request(app)
        .post('/api/auth/signin')
        .set('Accept-Language', 'en')
        .send({ username: adminUser.username, password: 'wrong' });

      expect(authRes.statusCode).toBe(401);
    });

    it('should respect lang query parameter', async () => {
      const res = await request(app).get('/api/health?lang=es').set('Accept-Language', 'en');
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

  describe('i18n Internal Callbacks', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should execute log callbacks', async () => {
      const mockConfigure = jest.fn();

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

      await import('../app/config/i18n.js');

      expect(mockConfigure).toHaveBeenCalled();
      const [[config]] = mockConfigure.mock.calls;

      config.logDebugFn('debug msg');
      expect(mockLog.app.debug).toHaveBeenCalledWith('i18n debug', { message: 'debug msg' });

      config.logWarnFn('warn msg');
      expect(mockLog.app.warn).toHaveBeenCalledWith('i18n warning', { message: 'warn msg' });

      config.logErrorFn('error msg');
      expect(mockLog.app.error).toHaveBeenCalledWith('i18n error', { message: 'error msg' });
    });

    it('should handle error scanning locales directory', async () => {
      const originalReaddirSync = fs.readdirSync;
      const readdirSpy = jest.spyOn(fs, 'readdirSync').mockImplementation((pathArg, options) => {
        if (pathArg.toString().includes('locales')) {
          throw new Error('Scan Error');
        }
        return originalReaddirSync(pathArg, options);
      });

      const mockLog = {
        app: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      };
      jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));

      await import('../app/config/i18n.js');

      expect(mockLog.app.error).toHaveBeenCalledWith(
        'Error scanning locales directory',
        expect.any(Object)
      );

      readdirSpy.mockRestore();
    });

    it('should handle non-string locale in middleware', async () => {
      const req = {
        query: { lang: { some: 'object' } },
        get: jest.fn(),
        setLocale: jest.fn(),
      };
      const res = {};
      const next = jest.fn();

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

    it('should handle findBestMatchingLocale fallback', async () => {
      const req = {
        query: { lang: 'xx-XX' },
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

      const { configAwareI18nMiddleware } = await import('../app/config/i18n.js');

      configAwareI18nMiddleware(req, res, next);
      expect(req.setLocale).toHaveBeenCalledWith('en');
    });

    it('should handle findBestMatchingLocale with null requested locale', async () => {
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
          default_language: null,
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

    it('should fallback to first available locale if en is missing', async () => {
      const originalReaddirSync = fs.readdirSync;
      const readdirSpy = jest.spyOn(fs, 'readdirSync').mockImplementation((pathArg, options) => {
        if (pathArg.toString().includes('locales')) {
          return ['es.json', 'fr.json'];
        }
        return originalReaddirSync(pathArg, options);
      });

      const mockLog = {
        app: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
      };
      jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));

      jest.resetModules();
      const { getDefaultLocale } = await import('../app/config/i18n.js');

      expect(getDefaultLocale()).toBe('es');

      readdirSpy.mockRestore();
    });
  });
});
