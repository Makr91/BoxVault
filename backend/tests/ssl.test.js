import { jest } from '@jest/globals';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const originalFs = require('fs');

const mockRealpathSync = jest.fn(p => originalFs.realpathSync(p));

const mockCreateWriteStream = jest.fn((filePath, options) =>
  originalFs.createWriteStream(filePath, options)
);

const mockFs = {
  ...originalFs,
  realpathSync: mockRealpathSync,
  createWriteStream: mockCreateWriteStream,
  default: {
    ...originalFs,
    realpathSync: mockRealpathSync,
    createWriteStream: mockCreateWriteStream,
  },
};

jest.unstable_mockModule('fs', () => mockFs);

const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const bcrypt = (await import('bcryptjs')).default;
const fs = (await import('fs')).default;
const { getConfigDir } = await import('../app/utils/config-loader.js');

describe('SSL API', () => {
  let adminToken;
  let adminUser;
  const uniqueId = Date.now().toString(36);
  const configDir = getConfigDir();
  const uploaded = ['server.crt', 'error.crt', 'conflict', 'subdir', 'req-error.crt'];

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);

    const hashedPassword = await bcrypt.hash('password', 8);
    adminUser = await db.user.create({
      username: `SSLAdmin_${uniqueId}`,
      email: `ssl_admin_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await adminUser.setRoles([adminRole]);

    const res = await request(app)
      .post('/api/auth/signin')
      .send({ username: adminUser.username, password: 'password' });
    adminToken = res.body.accessToken;
  });

  afterAll(async () => {
    await db.user.destroy({ where: { id: adminUser.id } });
    uploaded.forEach(name => {
      fs.rmSync(path.join(configDir, name), { recursive: true, force: true });
    });
  });

  describe('POST /api/config/ssl/upload', () => {
    it('should upload a file successfully', async () => {
      const targetPath = 'server.crt';
      const content = 'certificate content';

      const res = await request(app)
        .post(`/api/config/ssl/upload?targetPath=${targetPath}`)
        .set('x-access-token', adminToken)
        .set('Content-Type', 'application/octet-stream')
        .send(content);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('File uploaded successfully.');

      const filePath = path.join(configDir, targetPath);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('should fail if targetPath is missing', async () => {
      const res = await request(app)
        .post('/api/config/ssl/upload')
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(400);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/bad-request');
      expect(res.body.title).toBe('Target path is required.');
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/targetPath', rule: 'required' }),
      ]);
    });

    it('should fail if targetPath contains traversal characters', async () => {
      const res = await request(app)
        .post('/api/config/ssl/upload?targetPath=../outside.txt')
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(400);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/bad-request');
      expect(res.body.title).toBe('Invalid target path.');
    });

    it('should handle write errors (EISDIR)', async () => {
      const errorPath = 'error.crt';
      fs.mkdirSync(path.join(configDir, errorPath));

      const res = await request(app)
        .post(`/api/config/ssl/upload?targetPath=${errorPath}`)
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
      expect(res.body.title).toBe('Failed to write file.');
    });

    it('should handle server configuration error (unresolvable config dir)', async () => {
      mockRealpathSync.mockImplementationOnce(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const res = await request(app)
        .post('/api/config/ssl/upload?targetPath=test.crt')
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
      expect(res.body.title).toBe('Server configuration error.');
    });

    it('should handle directory creation error (file conflict)', async () => {
      fs.writeFileSync(path.join(configDir, 'conflict'), 'I am a file');

      const res = await request(app)
        .post(`/api/config/ssl/upload?targetPath=conflict/nested/test.crt`)
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
      expect(res.body.title).toBe('Failed to create directory for SSL file.');
    });

    it('should fail if targetPath is root directory (invalid target)', async () => {
      const res = await request(app)
        .post('/api/config/ssl/upload?targetPath=.')
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(403);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/forbidden');
      expect(res.body.title).toBe('Invalid target path.');
    });

    it('should handle config root ending with separator', async () => {
      mockRealpathSync.mockImplementationOnce(() => configDir + path.sep);

      const res = await request(app)
        .post('/api/config/ssl/upload?targetPath=subdir/sep-test.crt')
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(200);
    });

    it('should handle request stream error', async () => {
      const { Writable } = await import('stream');

      const mockWs = new Writable({
        write(chunk, encoding, callback) {
          void chunk;
          void encoding;
          void callback;
        },
      });

      mockWs.on('pipe', src => {
        process.nextTick(() => {
          src.emit('error', new Error('Simulated Request Error'));
        });
      });

      mockCreateWriteStream.mockReturnValueOnce(mockWs);

      const res = await request(app)
        .post('/api/config/ssl/upload?targetPath=req-error.crt')
        .set('x-access-token', adminToken)
        .send(Buffer.alloc(1024 * 1024));

      expect(res.statusCode).toBe(500);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
      expect(res.body.title).toBe('Upload stream error.');
    });
  });
});
