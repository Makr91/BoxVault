import { jest } from '@jest/globals';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const originalFs = require('fs');

// Mock realpathSync to throw for default path to cover error handling
const mockRealpathSync = jest.fn(p => {
  if (p && (p === '/etc/boxvault' || p.toString().endsWith('/etc/boxvault'))) {
    throw new Error('ENOENT: no such file or directory');
  }
  return originalFs.realpathSync(p);
});

// Mock createWriteStream to allow overriding in tests
const mockCreateWriteStream = jest.fn((filePath, options) =>
  originalFs.createWriteStream(filePath, options)
);

// Mock fs module
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

// Dynamic imports
const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const bcrypt = (await import('bcryptjs')).default;
const fs = (await import('fs')).default;

describe('SSL API', () => {
  let adminToken;
  let adminUser;
  const uniqueId = Date.now().toString(36);
  const tempConfigDir = path.join(__dirname, `temp_ssl_config_${uniqueId}`);

  beforeAll(async () => {
    // Create Admin User
    const hashedPassword = await bcrypt.hash('password', 8);
    adminUser = await db.user.create({
      username: `SSLAdmin_${uniqueId}`,
      email: `ssl_admin_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await adminUser.setRoles([adminRole]);

    // Get Token
    const res = await request(app)
      .post('/api/auth/signin')
      .send({ username: adminUser.username, password: 'password' });
    adminToken = res.body.accessToken;

    // Setup temp config dir
    if (!fs.existsSync(tempConfigDir)) {
      fs.mkdirSync(tempConfigDir, { recursive: true });
    }
    // Mock CONFIG_DIR for the controller via process.env
    process.env.CONFIG_DIR = tempConfigDir;
  });

  afterAll(async () => {
    await db.user.destroy({ where: { id: adminUser.id } });
    if (fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
    delete process.env.CONFIG_DIR;
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

      const filePath = path.join(tempConfigDir, targetPath);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('should fail if targetPath is missing', async () => {
      const res = await request(app)
        .post('/api/config/ssl/upload')
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Target path is required.');
    });

    it('should fail if targetPath contains traversal characters', async () => {
      const res = await request(app)
        .post('/api/config/ssl/upload?targetPath=../outside.txt')
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Invalid target path.');
    });

    it('should handle write errors (EISDIR)', async () => {
      // Create a directory with the same name as the target file
      // This will cause createWriteStream to fail with EISDIR
      const errorPath = 'error.crt';
      const dirPath = path.join(tempConfigDir, errorPath);
      fs.mkdirSync(dirPath);

      const res = await request(app)
        .post(`/api/config/ssl/upload?targetPath=${errorPath}`)
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Failed to write file.');
    });

    it('should handle server configuration error (missing config dir)', async () => {
      // Temporarily point CONFIG_DIR to a non-existent path
      const originalConfigDir = process.env.CONFIG_DIR;
      process.env.CONFIG_DIR = path.join(__dirname, 'non_existent_dir');

      const res = await request(app)
        .post('/api/config/ssl/upload?targetPath=test.crt')
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Server configuration error.');

      process.env.CONFIG_DIR = originalConfigDir;
    });

    it('should use default config directory if env var is missing', async () => {
      const originalConfigDir = process.env.CONFIG_DIR;
      delete process.env.CONFIG_DIR;

      // The mockRealpathSync will throw for /etc/boxvault, triggering the error we want
      const res = await request(app)
        .post('/api/config/ssl/upload?targetPath=test.crt')
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Server configuration error.');

      process.env.CONFIG_DIR = originalConfigDir;
    });

    it('should handle directory creation error (file conflict)', async () => {
      // Create a file named 'conflict'
      const conflictPath = path.join(tempConfigDir, 'conflict');
      fs.writeFileSync(conflictPath, 'I am a file');

      // Try to upload to 'conflict/nested/test.crt', which requires 'conflict/nested' to be a directory
      const res = await request(app)
        .post(`/api/config/ssl/upload?targetPath=conflict/nested/test.crt`)
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Failed to create directory for SSL file.');
    });

    it('should fail if targetPath is root directory (invalid target)', async () => {
      const res = await request(app)
        .post('/api/config/ssl/upload?targetPath=.')
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toBe('Invalid target path.');
    });
    it('should handle config root ending with separator', async () => {
      // Mock realpathSync to return a path ending with separator
      // This covers the branch where configRoot already has a trailing slash
      mockRealpathSync.mockImplementationOnce(() => tempConfigDir + path.sep);

      // Use a subdirectory to ensure directory check passes when root has trailing slash
      // (dirname strips trailing slash from root path, causing strict equality to fail)
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
          // Stalling the stream by not calling callback()
          void chunk;
          void encoding;
          void callback;
        },
      });

      // When the request pipes to our mock stream, emit an error on the request
      mockWs.on('pipe', src => {
        process.nextTick(() => {
          src.emit('error', new Error('Simulated Request Error'));
        });
      });

      mockCreateWriteStream.mockReturnValueOnce(mockWs);

      const res = await request(app)
        .post('/api/config/ssl/upload?targetPath=req-error.crt')
        .set('x-access-token', adminToken)
        .send(Buffer.alloc(1024 * 1024)); // Send 1MB to ensure stream is active

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Upload stream error.');
    });
  });
});
