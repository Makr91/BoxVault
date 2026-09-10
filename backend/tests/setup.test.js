import request from 'supertest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import app from '../server.js';
import {
  getConfigDir,
  getConfigPath,
  getSetupTokenPath,
  saveConfig,
} from '../app/utils/config-loader.js';

describe('Setup API', () => {
  const setupToken = 'test-setup-token-123';
  const setupTokenPath = getSetupTokenPath();
  const sslDir = path.join(getConfigDir(), 'ssl');
  const bearer = { Authorization: `Bearer ${setupToken}` };

  const writeToken = () => {
    fs.writeFileSync(setupTokenPath, setupToken, 'utf8');
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    writeToken();
  });

  afterAll(async () => {
    if (fs.existsSync(setupTokenPath)) {
      fs.unlinkSync(setupTokenPath);
    }
    fs.rmSync(sslDir, { recursive: true, force: true });
    await saveConfig('app', { ssl: { cert_path: null, key_path: null } }, 'test');
    await saveConfig('db', { mysql_pool: null }, 'test');
  });

  describe('GET /api/setup/status', () => {
    it('should answer setup_complete false while the token file exists', async () => {
      const res = await request(app).get('/api/setup/status');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ setup_complete: false });
    });
  });

  describe('POST /api/setup/verify-token', () => {
    it('should answer 403 on a mismatch', async () => {
      const res = await request(app).post('/api/setup/verify-token').send({ token: 'wrong-token' });
      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/forbidden');
    });

    it('should answer 204 on a match and hand nothing back', async () => {
      const res = await request(app).post('/api/setup/verify-token').send({ token: setupToken });
      expect(res.statusCode).toBe(204);
      expect(res.text).toBe('');
    });

    it('should answer 404 once the token file is gone', async () => {
      fs.unlinkSync(setupTokenPath);
      try {
        const res = await request(app).post('/api/setup/verify-token').send({ token: setupToken });
        expect(res.statusCode).toBe(404);
        expect(res.body.type).toBe('https://auth.startcloud.com/probs/not-found');
      } finally {
        writeToken();
      }
    });
  });

  describe('GET /api/setup', () => {
    it('should answer 403 without the token', async () => {
      const res = await request(app).get('/api/setup');
      expect(res.statusCode).toBe(403);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/forbidden');
    });

    it('should answer every raw file under the token, nothing masked', async () => {
      const res = await request(app).get('/api/setup').set(bearer);
      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.body.configs)).toEqual(['app', 'auth', 'db', 'mail']);
      expect(res.body.configs.auth.auth.jwt.jwt_secret).toBe('test-secret');
      expect(res.body.configs.db.database_type).toBe('sqlite');
      expect(res.body.configs.db.sql.dialect).toBeUndefined();
      expect(res.body.configs.app.ticket_system.req_type).toBeUndefined();
    });
  });

  describe('GET /api/setup/schema', () => {
    it('should answer 403 without the token', async () => {
      const res = await request(app).get('/api/setup/schema');
      expect(res.statusCode).toBe(403);
    });

    it('should answer the schema of every file', async () => {
      const res = await request(app).get('/api/setup/schema').set(bearer);
      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.body.schemas)).toEqual(['app', 'auth', 'db', 'mail']);
      expect(res.body.schemas.db.properties.database_type.enum).toEqual(['mysql', 'sqlite']);
      expect(res.body.schemas.db.properties.sql.properties.dialect).toBeUndefined();
    });
  });

  describe('POST /api/config/:name/upload under the setup token', () => {
    it('should write the upload at the path the property holds', async () => {
      await saveConfig('app', { ssl: { cert_path: 'ssl/setup.crt' } }, 'test');
      const res = await request(app)
        .post('/api/config/app/upload')
        .set(bearer)
        .field('pointer', '/ssl/cert_path')
        .attach('file', Buffer.from('fake-cert-content'), 'server.crt');
      expect(res.statusCode).toBe(200);
      expect(res.body.path).toBe(path.join(fs.realpathSync(getConfigDir()), 'ssl', 'setup.crt'));
      expect(fs.readFileSync(path.join(sslDir, 'setup.crt'), 'utf8')).toBe('fake-cert-content');
    });
  });

  describe('PUT /api/setup', () => {
    it('should refuse a failing value of any file with pointers and write nothing', async () => {
      const appConfigPath = getConfigPath('app');
      const dbConfigPath = getConfigPath('db');
      const appBefore = fs.readFileSync(appConfigPath, 'utf8');
      const dbBefore = fs.readFileSync(dbConfigPath, 'utf8');

      const res = await request(app)
        .put('/api/setup')
        .set(bearer)
        .send({
          configs: {
            app: { boxvault: { api_listen_port_unencrypted: 70000 } },
            db: { sql: { logging: 'yes' } },
          },
        });

      expect(res.statusCode).toBe(422);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.errors.map(error => error.pointer)).toEqual([
        '/configs/app/boxvault/api_listen_port_unencrypted',
        '/configs/db/sql/logging',
      ]);
      expect(fs.readFileSync(appConfigPath, 'utf8')).toBe(appBefore);
      expect(fs.readFileSync(dbConfigPath, 'utf8')).toBe(dbBefore);
      expect(fs.existsSync(setupTokenPath)).toBe(true);
    });

    it('should answer 400 for a body without configs', async () => {
      const res = await request(app).put('/api/setup').set(bearer).send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/bad-request');
    });

    it('should ignore a name outside status.config', async () => {
      const res = await request(app)
        .put('/api/setup')
        .set(bearer)
        .send({ configs: { unknown_config: { some: 'test' } } });
      expect(res.statusCode).toBe(200);
      writeToken();
    });

    it('should write every file through the merge patch, delete the token and answer the message', async () => {
      const res = await request(app)
        .put('/api/setup')
        .set(bearer)
        .send({
          configs: {
            app: { boxvault: { origin: 'http://localhost:4000' } },
            db: { mysql_pool: { max: 7 } },
          },
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'Setup complete.' });
      expect(fs.existsSync(setupTokenPath)).toBe(false);
      expect(yaml.load(fs.readFileSync(getConfigPath('app'), 'utf8')).boxvault.origin).toBe(
        'http://localhost:4000'
      );
      expect(yaml.load(fs.readFileSync(getConfigPath('db'), 'utf8')).mysql_pool).toEqual({
        max: 7,
      });
      await saveConfig('app', { boxvault: { origin: 'http://localhost:3000' } }, 'test');
    });

    it('should answer 404 on every setup route but status once setup is complete', async () => {
      expect((await request(app).get('/api/setup/status')).body).toEqual({
        setup_complete: true,
      });
      expect((await request(app).get('/api/setup').set(bearer)).statusCode).toBe(404);
      expect((await request(app).get('/api/setup/schema').set(bearer)).statusCode).toBe(404);
      expect(
        (await request(app).put('/api/setup').set(bearer).send({ configs: {} })).statusCode
      ).toBe(404);
      expect(
        (await request(app).post('/api/setup/verify-token').send({ token: setupToken })).statusCode
      ).toBe(404);
    });
  });
});
