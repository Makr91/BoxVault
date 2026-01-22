import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeAll(() => {
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

    it('should return configs with valid authorization', async () => {
      const res = await request(app)
        .get('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('configs');
      expect(res.body.configs).toHaveProperty('app');
      expect(res.body.configs).toHaveProperty('db');
    });

    it('should handle read errors', async () => {
      // Mock fs.readFile to fail
      jest.spyOn(fs, 'readFile').mockImplementation((filePath, encoding, cb) => {
        void filePath;
        void encoding;
        cb(new Error('Read Error'));
      });

      const res = await request(app)
        .get('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`);
      expect(res.statusCode).toBe(500);
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
      expect(res.body).toHaveProperty('certPath');
    });

    it('should upload SSL key', async () => {
      process.env.CONFIG_DIR = tempConfigDir;

      const res = await request(app)
        .post('/api/setup/upload-ssl')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .attach('file', Buffer.from('fake-key-content'), 'server.key');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('keyPath');
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
            origin: { value: 'http://localhost:4000' },
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

    it('should handle database type updates', async () => {
      // Re-create setup token for this test since previous test deleted it
      fs.writeFileSync(setupTokenPath, setupToken, 'utf8');

      const dbConfig = {
        db: {
          database_type: { value: 'mysql' },
          sql: { dialect: { value: 'sqlite' } }, // Should be overwritten by database_type
        },
      };

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: dbConfig });

      expect(res.statusCode).toBe(200);
    });

    it('should handle update errors', async () => {
      // Re-create setup token
      if (!fs.existsSync(setupTokenPath)) {
        fs.writeFileSync(setupTokenPath, setupToken, 'utf8');
      }

      // Mock fs.readFile to fail during config read
      jest.spyOn(fs, 'readFile').mockImplementation((filePath, encoding, cb) => {
        void filePath;
        void encoding;
        cb(new Error('Read Error'));
      });

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: { app: {} } });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('Setup Controller Coverage', () => {
    it('should ignore unknown config keys in update (update.js)', async () => {
      // Re-create setup token
      if (!fs.existsSync(setupTokenPath)) {
        fs.writeFileSync(setupTokenPath, setupToken, 'utf8');
      }

      const res = await request(app)
        .put('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .send({ configs: { unknown_config: { value: 'test' } } });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Setup Controller Coverage', () => {
    it('should handle errors in isSetupComplete (check.js)', async () => {
      const readFileSpy = jest
        .spyOn(fs, 'readFile')
        .mockImplementation((filePath, encoding, cb) => {
          void filePath;
          void encoding;
          cb(new Error('Read Error'));
        });

      const res = await request(app).get('/api/setup/status');
      expect(res.statusCode).toBe(500);

      readFileSpy.mockRestore();
    });

    it('should handle YAML parse errors in readConfig (helpers.js)', async () => {
      const readFileSpy = jest
        .spyOn(fs, 'readFile')
        .mockImplementation((filePath, encoding, cb) => {
          void filePath;
          void encoding;
          cb(null, 'invalid: yaml: : content');
        });

      const res = await request(app)
        .get('/api/setup')
        .set('Authorization', `Bearer ${authorizedToken}`);

      expect(res.statusCode).toBe(500);

      readFileSpy.mockRestore();
    });

    it('should handle db update without sql dialect (update.js)', async () => {
      // Re-create setup token if it doesn't exist
      if (!fs.existsSync(setupTokenPath)) {
        fs.writeFileSync(setupTokenPath, setupToken, 'utf8');
      }

      // Mock readFile to return config without sql block for db config
      const readFileSpy = jest.spyOn(fs, 'readFile').mockImplementation((pathArg, encoding, cb) => {
        void encoding;
        if (pathArg.toString().includes('db')) {
          cb(null, 'other_setting: value');
        } else {
          cb(null, 'key: value');
        }
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
              database_type: { value: 'postgres' },
            },
          },
        });

      expect(res.statusCode).toBe(200);
      readFileSpy.mockRestore();
      writeFileSpy.mockRestore();
      renameSpy.mockRestore();
    });

    it('should handle upload of non-cert/key files (upload.js)', async () => {
      const res = await request(app)
        .post('/api/setup/upload-ssl')
        .set('Authorization', `Bearer ${authorizedToken}`)
        .attach('file', Buffer.from('content'), 'test.txt');

      expect(res.statusCode).toBe(200);
      expect(res.body.certPath).toBeUndefined();
      expect(res.body.keyPath).toBeUndefined();
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
