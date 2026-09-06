import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import app from '../server.js';
import { getSetupTokenPath } from '../app/utils/config-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Setup API', () => {
  const setupToken = 'test-setup-token-123';
  const setupTokenPath = getSetupTokenPath();
  const tempConfigDir = path.join(__dirname, 'temp_setup_config');
  let authorizedToken;

  const reauthorize = async () => {
    if (!fs.existsSync(setupTokenPath)) {
      fs.writeFileSync(setupTokenPath, setupToken, 'utf8');
    }
    const res = await request(app).post('/api/setup/verify-token').send({ token: setupToken });
    authorizedToken = res.body.authorizedSetupToken;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);

    // Create a dummy setup token file to simulate a fresh install
    // Ensure directory exists
    const dir = path.dirname(setupTokenPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(setupTokenPath, setupToken, 'utf8');

    // Set up a temporary config directory for SSL upload test
    process.env.CONFIG_DIR = tempConfigDir;
    if (!fs.existsSync(tempConfigDir)) {
      fs.mkdirSync(tempConfigDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up setup token file if it still exists
    if (fs.existsSync(setupTokenPath)) {
      fs.unlinkSync(setupTokenPath);
    }
    if (fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
    delete process.env.CONFIG_DIR;
  });

  describe('GET /api/setup/status', () => {
    it('should return setup status', async () => {
      const res = await request(app).get('/api/setup/status');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('setupComplete');
    });
  });

  describe('POST /api/setup/verify-token', () => {
    it('should fail with invalid token', async () => {
      const res = await request(app).post('/api/setup/verify-token').send({ token: 'wrong-token' });

      expect(res.statusCode).toBe(403);
    });

    it('should succeed with valid token', async () => {
      const res = await request(app).post('/api/setup/verify-token').send({ token: setupToken });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('authorizedSetupToken');
      authorizedToken = res.body.authorizedSetupToken;
    });

    it('should fail if setup token file does not exist', async () => {
      // Temporarily rename the token file
      const tempPath = `${setupTokenPath}.bak`;
      fs.renameSync(setupTokenPath, tempPath);

      const res = await request(app).post('/api/setup/verify-token').send({ token: setupToken });

      fs.renameSync(tempPath, setupTokenPath); // Restore
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/setup', () => {
    it('should fail without authorization', async () => {
      const res = await request(app).get('/api/setup');
      expect(res.statusCode).toBe(403);
    });

    it('should return every config with its secrets masked', async () => {
      const res = await request(app)
        .get('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('configs');
      expect(Object.keys(res.body.configs)).toEqual(['app', 'auth', 'db', 'mail']);
      expect(res.body.configs.auth.auth.jwt.jwt_secret).toBe('********');
      expect(res.body.configs.db.sql.dialect).toBe('sqlite');
    });

    it('should handle read errors', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const res = await request(app)
          .get('/api/setup')
          .set('Authorization', `Bearer ${authorizedToken}`);
        expect(res.statusCode).toBe(500);
      } finally {
        process.env.NODE_ENV = originalEnv;
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe('GET /api/setup/schema', () => {
    it('should fail without authorization', async () => {
      const res = await request(app).get('/api/setup/schema');
      expect(res.statusCode).toBe(403);
    });

    it('should return the schema of every config', async () => {
      const res = await request(app)
        .get('/api/setup/schema')
        .set('Authorization', `Bearer ${authorizedToken}`);

      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.body.schemas)).toEqual(['app', 'auth', 'db', 'mail']);
      expect(res.body.schemas.db.properties.database_type.enum).toEqual(['mysql', 'sqlite']);
      expect(res.body.schemas.auth.properties.auth.properties.jwt.required).toEqual(['jwt_secret']);
    });
  });

  describe('POST /api/setup/upload-ssl', () => {
    it('should upload SSL certificate', async () => {
      // Explicitly set the config dir for this test to ensure it's picked up
      process.env.CONFIG_DIR = tempConfigDir;

      const res = await request(app)
        .post('/api/setup/upload-ssl')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .attach('file', Buffer.from('fake-cert-content'), 'server.crt');

      expect(res.statusCode).toBe(200);
      expect(res.body.path).toBe(path.join(tempConfigDir, 'ssl', 'server.crt'));
    });

    it('should upload SSL key', async () => {
      process.env.CONFIG_DIR = tempConfigDir;

      const res = await request(app)
        .post('/api/setup/upload-ssl')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .attach('file', Buffer.from('fake-key-content'), 'server.key');

      expect(res.statusCode).toBe(200);
      expect(res.body.path).toBe(path.join(tempConfigDir, 'ssl', 'server.key'));
    });
  });

  describe('POST /api/setup/upload-ssl (Negative)', () => {
    it('should fail when no file is uploaded', async () => {
      process.env.CONFIG_DIR = tempConfigDir;
      const res = await request(app)
        .post('/api/setup/upload-ssl')
        .set('Authorization', `Bearer ${authorizedToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('No file uploaded.');
    });

    it('should handle directory creation error', async () => {
      process.env.CONFIG_DIR = tempConfigDir;

      // Mock existsSync to return false (trigger mkdir) and mkdirSync to throw
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {
        throw new Error('Mkdir Error');
      });

      const res = await request(app)
        .post('/api/setup/upload-ssl')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .attach('file', Buffer.from('fake-cert-content'), 'server.crt');

      expect(res.statusCode).toBe(500);
    });
  });

  describe('PUT /api/setup', () => {
    it('should update configurations and complete setup', async () => {
      const newConfig = {
        app: {
          boxvault: {
            origin: 'http://localhost:4000',
          },
        },
      };

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: newConfig });

      expect(res.statusCode).toBe(200);

      // Verify that the setup token file was deleted (setup complete)
      expect(fs.existsSync(setupTokenPath)).toBe(false);
    });

    it('should refuse a failing value of any file with pointers and write nothing', async () => {
      fs.writeFileSync(setupTokenPath, setupToken, 'utf8');
      await reauthorize();
      const appConfigPath = path.join(__dirname, '../app/config/app.test.config.yaml');
      const dbConfigPath = path.join(__dirname, '../app/config/db.test.config.yaml');
      const appBefore = fs.readFileSync(appConfigPath, 'utf8');
      const dbBefore = fs.readFileSync(dbConfigPath, 'utf8');

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
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

    it('should handle database type updates', async () => {
      // Re-create setup token for this test since previous test deleted it
      fs.writeFileSync(setupTokenPath, setupToken, 'utf8');
      await reauthorize();

      const dbConfig = {
        db: {
          database_type: 'mysql',
          sql: { dialect: 'sqlite' },
        },
      };

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: dbConfig });

      expect(res.statusCode).toBe(200);
      const dbConfigPath = path.join(__dirname, '../app/config/db.test.config.yaml');
      const written = yaml.load(fs.readFileSync(dbConfigPath, 'utf8'));
      expect(written.sql.dialect).toBe('mysql');
    });

    it('should handle update errors', async () => {
      // Re-create setup token
      if (!fs.existsSync(setupTokenPath)) {
        fs.writeFileSync(setupTokenPath, setupToken, 'utf8');
      }
      await reauthorize();

      jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read Error');
      });

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: { app: {} } });

      expect(res.statusCode).toBe(500);
    });

    it('should succeed even if setup token is already deleted', async () => {
      await reauthorize();
      // Ensure the token file is deleted before the test
      if (fs.existsSync(setupTokenPath)) {
        fs.unlinkSync(setupTokenPath);
      }

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: {} });

      expect(res.statusCode).toBe(200);
    });

    it('should succeed even if setup token is already deleted', async () => {
      await reauthorize();
      // Ensure the token file is deleted before the test
      if (fs.existsSync(setupTokenPath)) {
        fs.unlinkSync(setupTokenPath);
      }

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: {} });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Setup Controller Coverage', () => {
    it('should ignore unknown config keys in update (update.js)', async () => {
      // Re-create setup token
      if (!fs.existsSync(setupTokenPath)) {
        fs.writeFileSync(setupTokenPath, setupToken, 'utf8');
      }
      await reauthorize();

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: { unknown_config: { some: 'test' } } });

      expect(res.statusCode).toBe(200);
    });

    it('should log warning if setup token deletion fails (coverage)', async () => {
      await reauthorize();
      // Ensure token exists so we attempt to delete it
      if (!fs.existsSync(setupTokenPath)) {
        fs.writeFileSync(setupTokenPath, 'token');
      }

      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw new Error('Unlink Error');
      });

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: {} });

      expect(res.statusCode).toBe(200);
      unlinkSpy.mockRestore();
    });
  });

  describe('Setup Controller Coverage', () => {
    it('should handle errors in isSetupComplete (check.js)', async () => {
      const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read Error');
      });

      const res = await request(app).get('/api/setup/status');
      expect(res.statusCode).toBe(500);

      readFileSpy.mockRestore();
    });

    it('should handle YAML parse errors in readConfigFile', async () => {
      await reauthorize();
      const readFileSpy = jest
        .spyOn(fs, 'readFileSync')
        .mockReturnValue('invalid: yaml: : content');

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: { app: {} } });

      expect(res.statusCode).toBe(500);

      readFileSpy.mockRestore();
    });

    it('should handle db update without sql dialect (update.js)', async () => {
      // Re-create setup token if it doesn't exist
      if (!fs.existsSync(setupTokenPath)) {
        fs.writeFileSync(setupTokenPath, setupToken, 'utf8');
      }
      await reauthorize();

      const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(pathArg => {
        if (pathArg.toString().includes('db.test.config')) {
          return 'other_setting: value';
        }
        return 'key: value';
      });

      // Mock write operations to prevent actual file system writes and ensure success
      const writeFileSpy = jest
        .spyOn(fs, 'writeFile')
        .mockImplementation((filePath, data, encoding, cb) => {
          void filePath;
          void data;
          void encoding;
          cb(null);
        });
      const renameSpy = jest.spyOn(fs, 'rename').mockImplementation((oldPath, newPath, cb) => {
        void oldPath;
        void newPath;
        cb(null);
      });

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({
          configs: {
            db: {
              database_type: 'mysql',
            },
          },
        });

      expect(res.statusCode).toBe(200);
      readFileSpy.mockRestore();
      writeFileSpy.mockRestore();
      renameSpy.mockRestore();
    });

    it('should return the saved path for any file name (upload.js)', async () => {
      await reauthorize();
      const res = await request(app)
        .post('/api/setup/upload-ssl')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .attach('file', Buffer.from('content'), 'fullchain.pem');

      expect(res.statusCode).toBe(200);
      expect(res.body.path).toBe(path.join(tempConfigDir, 'ssl', 'fullchain.pem'));
    });

    it('should use default config directory if env var is missing (upload.js)', async () => {
      const originalConfigDir = process.env.CONFIG_DIR;
      delete process.env.CONFIG_DIR;

      const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      await request(app)
        .post('/api/setup/upload-ssl')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .attach('file', Buffer.from('content'), 'test.crt');

      process.env.CONFIG_DIR = originalConfigDir;
      existsSpy.mockRestore();
    });
  });
});
