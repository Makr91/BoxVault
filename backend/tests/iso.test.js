import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import { join } from 'path';
import app from '../server.js';
import db from '../app/models/index.js';
import jwt from 'jsonwebtoken';
import yaml from 'js-yaml';
import {
  getIsoStorageRoot,
  getSecureIsoPath,
  cleanupTempFile,
} from '../app/controllers/iso/helpers.js';
import { getConfigPath } from '../app/utils/config-loader.js';
import { log } from '../app/utils/Logger.js';

describe('ISO API', () => {
  let authToken;
  let adminToken;
  let user;
  let admin;
  let org;
  let iso;
  const uniqueId = Date.now();
  const orgName = `IsoOrg_${uniqueId}`;

  beforeAll(async () => {
    // Create Organization
    org = await db.organization.create({
      name: orgName,
      access_mode: 'private',
    });

    // Create User
    user = await db.user.create({
      username: `IsoUser_${uniqueId}`,
      email: `isouser_${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await user.setRoles([userRole]);
    await db.UserOrg.create({ user_id: user.id, organization_id: org.id, role: 'user' });
    authToken = jwt.sign({ id: user.id }, 'test-secret', { expiresIn: '1h' });

    // Create Admin
    admin = await db.user.create({
      username: `IsoAdmin_${uniqueId}`,
      email: `isoadmin_${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await admin.setRoles([adminRole]);
    await db.UserOrg.create({ user_id: admin.id, organization_id: org.id, role: 'admin' });
    adminToken = jwt.sign({ id: admin.id }, 'test-secret', { expiresIn: '1h' });

    // Create ISO
    iso = await db.iso.create({
      name: 'Test ISO',
      filename: 'test.iso',
      checksum: 'fakechecksum',
      size: 1024,
      organizationId: org.id,
      isPublic: false,
      storagePath: 'test.iso',
    });

    // Create physical file for download tests
    const isoRoot = getIsoStorageRoot();
    if (!fs.existsSync(isoRoot)) {
      fs.mkdirSync(isoRoot, { recursive: true });
    }
    fs.writeFileSync(join(isoRoot, 'test.iso'), Buffer.alloc(1024));
  });

  afterAll(async () => {
    if (iso) {
      await iso.destroy();
    }
    if (org) {
      await org.destroy();
    }
    if (user) {
      await user.destroy();
    }
    if (admin) {
      await admin.destroy();
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/organization/:organization/iso', () => {
    it('should list ISOs for organization member', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should return 404 if organization not found', async () => {
      const res = await request(app)
        .get(`/api/organization/NonExistentOrg/iso`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/organization/:organization/iso/:isoId', () => {
    it('should get ISO details', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/${iso.id}`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Test ISO');
    });

    it('should return 404 if ISO not found', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/99999`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/organization/:organization/iso/:isoId', () => {
    it('should update ISO details (admin)', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/iso/${iso.id}`)
        .set('x-access-token', adminToken)
        .send({ name: 'Updated ISO Name', isPublic: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated ISO Name');
      expect(res.body.isPublic).toBe(true);
    });

    it('should return 404 if ISO not found', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/iso/99999`)
        .set('x-access-token', adminToken)
        .send({ name: 'New Name' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/organization/:organization/iso/:isoId/download-link', () => {
    it('should generate download link', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/${iso.id}/download-link`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('downloadUrl');
    });

    it('should return 404 if ISO not found', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/99999/download-link`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/isos/discover', () => {
    it('should list public ISOs', async () => {
      const res = await request(app).get('/api/isos/discover');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/organization/:organization/public-isos', () => {
    it('should list public ISOs for organization', async () => {
      const res = await request(app).get(`/api/organization/${orgName}/public-isos`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return 404 if organization not found', async () => {
      const res = await request(app).get('/api/organization/NonExistentOrg/public-isos');
      expect(res.statusCode).toBe(404);
    });
  });

  describe('ISO Edge Cases (Integration)', () => {
    it('should handle path traversal attempt in filename', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', '../../etc/passwd')
        .set('Content-Type', 'application/octet-stream')
        .send('malicious content');

      // The controller ignores the filename provided in header for storage (uses checksum)
      // So this succeeds (201) but stores safely.
      expect(res.statusCode).toBe(201);
    });

    // Helper coverage via API trigger (upload)
    it('should use configured storage path', () => {
      // Save original config
      const configPath = getConfigPath('app');
      const originalConfig = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(originalConfig);

      // Modify
      config.boxvault.iso_storage_directory = { value: '/tmp/custom-iso' };
      fs.writeFileSync(configPath, yaml.dump(config));

      try {
        const root = getIsoStorageRoot();
        expect(root).toBe('/tmp/custom-iso');
      } finally {
        // Restore
        fs.writeFileSync(configPath, originalConfig);
      }
    });
  });

  describe('ISO Edge Cases (Integration)', () => {
    it('should delete physical file when no other references exist', async () => {
      // Create a unique ISO to delete
      const isoToDelete = await db.iso.create({
        name: 'Delete Me',
        filename: 'delete.iso',
        checksum: 'uniquechecksum123',
        size: 1024,
        organizationId: org.id,
        isPublic: false,
        storagePath: 'delete.iso',
      });

      // Mock fs.existsSync to return true for the file
      const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      // Mock fs.unlinkSync
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const res = await request(app)
        .delete(`/api/organization/${orgName}/iso/${isoToDelete.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(unlinkSpy).toHaveBeenCalled();

      existsSpy.mockRestore();
      unlinkSpy.mockRestore();
    });

    it('should handle error during physical file deletion', async () => {
      // Mock findByPk to return an ISO that throws on destroy (or mock destroy directly)
      // But to test the controller catch block, we can mock findByPk to throw
      const findSpy = jest.spyOn(db.iso, 'findByPk').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .delete(`/api/organization/${orgName}/iso/${iso.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      findSpy.mockRestore();
    });

    it('should handle download error (500)', async () => {
      // Mock fs.statSync to throw error
      // We need to ensure access check passes first
      jest.spyOn(fs.promises, 'access').mockResolvedValue();
      const statSpy = jest.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('Stat Error');
      });

      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/${iso.id}/download`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      statSpy.mockRestore();
    });

    it('should handle downloadByName error (500)', async () => {
      // Mock organization find to throw
      const findSpy = jest
        .spyOn(db.organization, 'findOne')
        .mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/name/${iso.name}/download`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      findSpy.mockRestore();
    });

    it('should deny download link generation for private ISO if not member', async () => {
      // Create private ISO
      const privIso = await db.iso.create({
        name: 'Private ISO',
        filename: 'priv.iso',
        checksum: 'privsum',
        size: 1024,
        organizationId: org.id,
        isPublic: false,
        storagePath: 'priv.iso',
      });

      // Create non-member user
      const outsider = await db.user.create({
        username: `outsider-iso-${Date.now()}`,
        email: `outsider-iso-${Date.now()}@test.com`,
        password: 'password',
        verified: true,
      });
      const token = jwt.sign({ id: outsider.id }, 'test-secret', { expiresIn: '1h' });

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/${privIso.id}/download-link`)
        .set('x-access-token', token);

      expect(res.statusCode).toBe(403);

      await privIso.destroy();
      await outsider.destroy();
    });

    it('should handle update error (500)', async () => {
      // Mock findByPk to return object with throwing save
      const findSpy = jest.spyOn(db.iso, 'findByPk').mockResolvedValue({
        ...iso.toJSON(),
        save: jest.fn().mockRejectedValue(new Error('Save Error')),
      });

      const res = await request(app)
        .put(`/api/organization/${orgName}/iso/${iso.id}`)
        .set('x-access-token', adminToken)
        .send({ name: 'New Name' });

      expect(res.statusCode).toBe(500);
      findSpy.mockRestore();
    });

    it('should handle upload cleanup on error', async () => {
      // Mock fs.renameSync to throw (simulating error during processing)
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('Rename Error');
      });

      // Mock fs.existsSync to return true for the temp file so cleanup triggers
      const originalExists = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        if (typeof pathArg === 'string' && pathArg.includes('temp-')) {
          return true;
        }
        return originalExists(pathArg);
      });

      // Mock unlinkSync to verify cleanup
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'cleanup-test.iso')
        .set('Content-Length', '7') // Matches 'content' length
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(unlinkSpy).toHaveBeenCalled();

      renameSpy.mockRestore();
      existsSpy.mockRestore();
      unlinkSpy.mockRestore();
    });

    it('should handle DB error during download (wrapper)', async () => {
      jest.spyOn(db.iso, 'findByPk').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/${iso.id}/download`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('should handle error during upload cleanup', async () => {
      // 1. Mock fs.renameSync to throw (trigger cleanup)
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('Processing Error');
      });

      // 2. Mock fs.existsSync to return true (enter cleanup block)
      const originalExists = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(path => {
        if (path.toString().includes('temp-')) {
          return true;
        }
        return originalExists(path);
      });

      // 3. Mock fs.unlinkSync to throw (trigger nested catch)
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw new Error('Cleanup Error');
      });

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'cleanup-fail.iso')
        .set('Content-Type', 'application/octet-stream')
        .send('content');

      expect(res.statusCode).toBe(500);

      renameSpy.mockRestore();
      existsSpy.mockRestore();
      unlinkSpy.mockRestore();
    });

    it('should handle write stream error during upload', async () => {
      const mockStream = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'error') {
            handler(new Error('Write Error'));
          }
          return mockStream;
        }),
        once: jest.fn(),
        emit: jest.fn(),
      };
      const createWriteStreamSpy = jest.spyOn(fs, 'createWriteStream').mockReturnValue(mockStream);

      // Mock unlinkSync to verify cleanup
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(500);

      createWriteStreamSpy.mockRestore();
      unlinkSpy.mockRestore();
    });

    it('should create ISO storage directory if missing during upload', async () => {
      const originalExists = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        const p = String(pathArg);
        // Return false for the iso root to trigger mkdir
        if (p.endsWith('iso')) {
          return false;
        }
        return originalExists(pathArg);
      });
      const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'mkdir-test.iso')
        .send('content');

      expect(mkdirSpy).toHaveBeenCalled();

      existsSpy.mockRestore();
      mkdirSpy.mockRestore();
    });

    it('should generate download link for service account', async () => {
      // Create service account
      const sa = await db.service_account.create({
        username: `sa-link-${Date.now()}`,
        token: `sa-token-${Date.now()}`,
        organization_id: org.id,
        userId: user.id,
      });

      // Generate SA token
      const saToken = jwt.sign(
        {
          id: user.id,
          isServiceAccount: true,
          serviceAccountOrgId: org.id,
        },
        'test-secret',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/${iso.id}/download-link`)
        .set('x-access-token', saToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('downloadUrl');

      await sa.destroy();
    });

    it('should generate download link with correct service account claim', async () => {
      // Create service account
      const sa = await db.service_account.create({
        username: `sa-link-check-${Date.now()}`,
        token: `sa-token-check-${Date.now()}`,
        organization_id: org.id,
        userId: user.id,
      });

      const saToken = jwt.sign(
        {
          id: user.id,
          isServiceAccount: true,
          serviceAccountOrgId: org.id,
        },
        'test-secret',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/${iso.id}/download-link`)
        .set('x-access-token', saToken);

      expect(res.statusCode).toBe(200);

      // Verify the generated token in the URL
      const { downloadUrl } = res.body;
      const [, token] = downloadUrl.split('token=');
      const decoded = jwt.verify(token, 'test-secret');
      expect(decoded.isServiceAccount).toBe(true);

      await sa.destroy();
    });

    it('should handle nested error during upload cleanup', async () => {
      // Force an error in the main try block
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('Primary Error');
      });

      // Ensure we enter the cleanup block
      const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      // Force an error in the cleanup block
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw new Error('Secondary Error');
      });

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'nested-error.iso')
        .send('data');

      expect(res.statusCode).toBe(500);

      renameSpy.mockRestore();
      existsSpy.mockRestore();
      unlinkSpy.mockRestore();
    });

    it('should return 404 when deleting non-existent ISO', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/iso/999999`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('should return 413 if file is too large (config modification)', async () => {
      // Modify config file to set a very small limit (1KB)
      const configPath = getConfigPath('app');
      const originalConfig = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(originalConfig);

      // Set max size to ~1KB (0.000001 GB)
      config.boxvault.box_max_file_size.value = 0.000001;

      fs.writeFileSync(configPath, yaml.dump(config));

      try {
        const content = Buffer.alloc(2048); // 2KB > 1KB limit
        const res = await request(app)
          .post(`/api/organization/${orgName}/iso`)
          .set('x-access-token', adminToken)
          .set('x-file-name', 'large-config.iso')
          .set('Content-Type', 'application/octet-stream')
          .send(content);

        expect(res.statusCode).toBe(413);
        expect(res.body.error).toBe('FILE_TOO_LARGE');
      } finally {
        // Restore config
        fs.writeFileSync(configPath, originalConfig);
      }
    });

    it('should handle error after headers sent in download', async () => {
      const statSpy = jest.spyOn(fs, 'statSync').mockReturnValue({ size: 0 });
      const createReadStreamSpy = jest.spyOn(fs, 'createReadStream').mockImplementation(() => {
        throw new Error('Stream Error');
      });

      await request(app)
        .get(`/api/organization/${orgName}/iso/${iso.id}/download`)
        .set('x-access-token', authToken)
        .expect(200);

      statSpy.mockRestore();
      createReadStreamSpy.mockRestore();
    });

    it('should skip cleanup if temp file does not exist during upload error', async () => {
      // Mock fs.createWriteStream to throw immediately (simulating error before file creation)
      const createStreamSpy = jest.spyOn(fs, 'createWriteStream').mockImplementation(() => {
        throw new Error('Stream Init Error');
      });

      // Mock fs.existsSync to return false (file not created)
      const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync');

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(unlinkSpy).not.toHaveBeenCalled();

      createStreamSpy.mockRestore();
      existsSpy.mockRestore();
      unlinkSpy.mockRestore();
    });

    it('should handle unlink error during cleanup in upload', async () => {
      // Mock ISO.create to fail
      const createSpy = jest.spyOn(db.iso, 'create').mockRejectedValue(new Error('DB Error'));

      // Mock existsSync to return true ONLY for temp file
      const originalExists = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        const p = String(pathArg);
        if (p.includes('temp-')) {
          return true;
        }
        return originalExists(pathArg);
      });

      // Mock unlinkSync to throw (simulate cleanup failure)
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw new Error('Unlink Error');
      });

      // Mock renameSync to succeed
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
      // Mock mkdirSync to succeed (for isoRoot check)
      const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'unlink-fail.iso')
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(unlinkSpy).toHaveBeenCalled();

      createSpy.mockRestore();
      existsSpy.mockRestore();
      unlinkSpy.mockRestore();
      renameSpy.mockRestore();
      mkdirSpy.mockRestore();
    });

    it('should clean up temp file if database creation fails during upload', async () => {
      const createSpy = jest
        .spyOn(db.iso, 'create')
        .mockRejectedValue(new Error('DB Create Error'));

      const mockStream = {
        write: jest.fn(),
        on: jest.fn((event, cb) => {
          if (event === 'finish') {
            mockStream._finishCb = cb;
          }
          return mockStream;
        }),
        once: jest.fn(),
        emit: jest.fn(),
      };
      mockStream.end = jest.fn(() => {
        if (mockStream._finishCb) {
          setImmediate(mockStream._finishCb);
        }
      });

      const writeStreamSpy = jest.spyOn(fs, 'createWriteStream').mockReturnValue(mockStream);

      const originalExists = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        if (typeof pathArg === 'string' && pathArg.includes('temp-')) {
          return true;
        }
        return originalExists(pathArg);
      });

      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'db-fail.iso')
        .set('Content-Type', 'application/octet-stream')
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(unlinkSpy).toHaveBeenCalled();

      createSpy.mockRestore();
      writeStreamSpy.mockRestore();
      existsSpy.mockRestore();
      renameSpy.mockRestore();
      unlinkSpy.mockRestore();
    });

    it('should return 403 for private ISO if user is not member', async () => {
      // Create private ISO
      const privIso = await db.iso.create({
        name: 'Private ISO Link Test',
        filename: 'priv-link.iso',
        checksum: 'privlinksum',
        size: 1024,
        organizationId: org.id,
        isPublic: false,
        storagePath: 'priv-link.iso',
      });

      // Create non-member user
      const outsider = await db.user.create({
        username: `outsider-link-${Date.now()}`,
        email: `outsider-link-${Date.now()}@test.com`,
        password: 'password',
        verified: true,
      });
      const token = jwt.sign({ id: outsider.id }, 'test-secret', { expiresIn: '1h' });

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/${privIso.id}/download-link`)
        .set('x-access-token', token);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('auth.forbidden');

      await privIso.destroy();
      await outsider.destroy();
    });

    it('should return 403 for private ISO download link without token', async () => {
      // Ensure ISO is private
      await db.iso.update({ isPublic: false }, { where: { id: iso.id } });

      const res = await request(app).post(
        `/api/organization/${orgName}/iso/${iso.id}/download-link`
      );

      expect(res.statusCode).toBe(403);
      const msg = res.body.message;
      const validMessages = ['auth.forbidden', 'Forbidden'];
      expect(validMessages.some(m => msg.includes(m))).toBe(true);
    });

    it('should generate download link for public ISO (skip permission check)', async () => {
      // Make ISO public
      await db.iso.update({ isPublic: true }, { where: { id: iso.id } });

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/${iso.id}/download-link`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('downloadUrl');

      // Revert
      await db.iso.update({ isPublic: false }, { where: { id: iso.id } });
    });

    it('should return 403 for private ISO if user is not member (explicit check)', async () => {
      const privIso = await db.iso.create({
        name: 'Private ISO Explicit',
        filename: 'priv-exp.iso',
        checksum: 'privexpsum',
        size: 1024,
        organizationId: org.id,
        isPublic: false,
        storagePath: 'priv-exp.iso',
      });

      const outsider = await db.user.create({
        username: `outsider-exp-${Date.now()}`,
        email: `outsider-exp-${Date.now()}@test.com`,
        password: 'password',
        verified: true,
      });
      const token = jwt.sign({ id: outsider.id }, 'test-secret', { expiresIn: '1h' });

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/${privIso.id}/download-link`)
        .set('x-access-token', token);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('auth.forbidden');

      await privIso.destroy();
      await outsider.destroy();
    });

    it('should cleanup temp file if rename fails (upload.js line 122)', async () => {
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('Rename Failed');
      });

      const originalExists = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        const p = String(pathArg);
        if (p.includes('temp-')) {
          return true;
        }
        if (p.endsWith('.iso')) {
          return false;
        } // Force rename path
        return originalExists(pathArg);
      });

      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'rename-fail-122.iso')
        .set('Content-Type', 'application/octet-stream')
        .send('content');

      expect(res.statusCode).toBe(500);
      expect(unlinkSpy).toHaveBeenCalled();

      renameSpy.mockRestore();
      existsSpy.mockRestore();
      unlinkSpy.mockRestore();
    });

    it('should update ISO with empty body', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/iso/${iso.id}`)
        .set('x-access-token', adminToken)
        .send(); // No body

      expect(res.statusCode).toBe(200);
    });

    it('should handle duplicate upload (deduplication)', async () => {
      const content = Buffer.from('deduplication-test-content');

      // First upload
      const res1 = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'dedup-1.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(content);

      expect(res1.statusCode).toBe(201);

      // Second upload (same content)
      const res2 = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'dedup-2.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(content);

      expect(res2.statusCode).toBe(201);
      expect(res2.body.checksum).toBe(res1.body.checksum);
    });

    it('should throw error for path traversal in helper', () => {
      expect(() => getSecureIsoPath('../../etc/passwd')).toThrow('Path traversal attempt detected');
    });

    it('should handle DB error in downloadByName', async () => {
      const findSpy = jest
        .spyOn(db.organization, 'findOne')
        .mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/name/${iso.name}/download`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
      findSpy.mockRestore();
    });
  });

  describe('Additional Coverage Tests', () => {
    it('should return 404 when updating non-existent ISO', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/iso/999999`)
        .set('x-access-token', adminToken)
        .send({ name: 'New Name' });
      expect(res.statusCode).toBe(404);
    });

    it('should download file successfully (no range)', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/${iso.id}/download`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-length']).toBe('1024');
    });

    it('should download using valid download token', async () => {
      // Ensure ISO is private to verify token logic
      await db.iso.update({ isPublic: false }, { where: { id: iso.id } });

      const token = jwt.sign(
        {
          userId: user.id,
          isoId: iso.id,
          organization: orgName,
        },
        'test-secret',
        { expiresIn: '1h' }
      );

      const res = await request(app).get(
        `/api/organization/${orgName}/iso/${iso.id}/download?token=${token}`
      );
      expect(res.statusCode).toBe(200);
    });

    it('should fail download using token with invalid scope', async () => {
      // Ensure ISO is private
      await db.iso.update({ isPublic: false }, { where: { id: iso.id } });

      const token = jwt.sign(
        {
          userId: user.id,
          isoId: iso.id + 999, // Wrong ISO ID
          organization: orgName,
        },
        'test-secret',
        { expiresIn: '1h' }
      );

      const res = await request(app).get(
        `/api/organization/${orgName}/iso/${iso.id}/download?token=${token}`
      );
      expect(res.statusCode).toBe(403);
    });

    it('should handle range requests for download', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/${iso.id}/download`)
        .set('x-access-token', authToken)
        .set('Range', 'bytes=0-4');
      expect(res.statusCode).toBe(206);
      expect(res.headers['content-length']).toBe('5');
    });

    it('should return 404 if physical file is missing during download', async () => {
      const ghostIso = await db.iso.create({
        name: 'Ghost ISO',
        filename: 'ghost.iso',
        checksum: 'ghostsum',
        size: 123,
        organizationId: org.id,
        storagePath: 'non-existent-file.iso',
      });

      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/${ghostIso.id}/download`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);

      await ghostIso.destroy();
    });

    it('should return 404 if org not found in downloadByName', async () => {
      const res = await request(app)
        .get(`/api/organization/NonExistentOrg/iso/name/test.iso/download`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should handle DB error in findAll', async () => {
      jest.spyOn(db.iso, 'findAll').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('should handle DB error in findOne', async () => {
      jest.spyOn(db.iso, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/${iso.id}`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('should handle DB error in discover', async () => {
      jest.spyOn(db.iso, 'findAll').mockRejectedValue(new Error('DB Error'));
      const res = await request(app).get('/api/isos/discover');
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('should handle DB error in getPublic', async () => {
      jest.spyOn(db.iso, 'findAll').mockRejectedValue(new Error('DB Error'));
      const res = await request(app).get(`/api/organization/${orgName}/public-isos`);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('should handle DB error in getDownloadLink', async () => {
      jest.spyOn(db.iso, 'findByPk').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/${iso.id}/download-link`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('should handle delete when physical file is already missing', async () => {
      // Create an ISO
      const isoToDelete = await db.iso.create({
        name: 'Missing File ISO',
        filename: 'missing.iso',
        checksum: 'missingchecksum',
        size: 1024,
        organizationId: org.id,
        isPublic: false,
        storagePath: 'missing.iso',
      });

      // Ensure file does NOT exist
      const fullPath = join(getIsoStorageRoot(), 'missing.iso');
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }

      const res = await request(app)
        .delete(`/api/organization/${orgName}/iso/${isoToDelete.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
    });

    it('should return 401 for private ISO download without auth', async () => {
      // Ensure ISO is private
      await db.iso.update({ isPublic: false }, { where: { id: iso.id } });

      const res = await request(app).get(`/api/organization/${orgName}/iso/${iso.id}/download`);

      expect(res.statusCode).toBe(401);
    });

    it('should download file successfully by name', async () => {
      await iso.reload();
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/name/${iso.name}/download`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
    });

    it('should handle discover error with fallback message', async () => {
      jest.spyOn(db.iso, 'findAll').mockRejectedValue(new Error(''));
      const res = await request(app).get('/api/isos/discover');
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
      jest.restoreAllMocks();
    });

    it('should handle getPublic error with fallback message', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      const res = await request(app).get(`/api/organization/${orgName}/public-isos`);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
      jest.restoreAllMocks();
    });

    it('should not delete physical file if referenced by another ISO (deduplication)', async () => {
      // Create ISO A
      const isoA = await db.iso.create({
        name: 'ISO A',
        filename: 'shared.iso',
        checksum: 'shared_checksum',
        size: 1024,
        organizationId: org.id,
        storagePath: 'shared.iso',
      });

      // Create ISO B (same storagePath/checksum)
      const isoB = await db.iso.create({
        name: 'ISO B',
        filename: 'shared.iso',
        checksum: 'shared_checksum',
        size: 1024,
        organizationId: org.id,
        storagePath: 'shared.iso',
      });

      // Create physical file
      const filePath = join(getIsoStorageRoot(), 'shared.iso');
      fs.writeFileSync(filePath, 'dummy content');

      // Delete ISO A
      const resA = await request(app)
        .delete(`/api/organization/${orgName}/iso/${isoA.id}`)
        .set('x-access-token', adminToken);
      expect(resA.statusCode).toBe(200);

      // File should still exist because ISO B references it
      expect(fs.existsSync(filePath)).toBe(true);

      // Delete ISO B
      const resB = await request(app)
        .delete(`/api/organization/${orgName}/iso/${isoB.id}`)
        .set('x-access-token', adminToken);
      expect(resB.statusCode).toBe(200);

      // File should be gone now
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should deny download of private ISO for non-member', async () => {
      // Create private ISO
      const privIso = await db.iso.create({
        name: 'Private Download Test',
        filename: 'priv.iso',
        checksum: 'priv_sum',
        size: 1024,
        organizationId: org.id,
        isPublic: false,
        storagePath: 'priv.iso',
      });

      // Create non-member user
      const outsider = await db.user.create({
        username: `outsider-${Date.now()}`,
        email: `outsider-${Date.now()}@test.com`,
        password: 'password',
        verified: true,
      });
      const outsiderToken = jwt.sign({ id: outsider.id }, 'test-secret', { expiresIn: '1h' });

      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/${privIso.id}/download`)
        .set('x-access-token', outsiderToken);

      expect(res.statusCode).toBe(403);

      await privIso.destroy();
      await outsider.destroy();
    });

    it('should return 404 if ISO ID not found during download', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/999999/download`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if ISO name not found during downloadByName', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/name/NonExistentIso/download`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should update ISO description', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/iso/${iso.id}`)
        .set('x-access-token', adminToken)
        .send({ description: 'New Description' });

      expect(res.statusCode).toBe(200);
      expect(res.body.description).toBe('New Description');
    });

    it('should cleanup file if rename fails during upload', async () => {
      // Mock fs.renameSync to fail
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('Rename Error');
      });

      // Mock fs.existsSync to ensure we enter the cleanup block
      const originalExists = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        const p = String(pathArg);
        if (p.includes('temp-')) {
          return true;
        } // Temp file exists
        if (p.endsWith('.iso')) {
          return false;
        } // Force rename path
        return originalExists(pathArg); // Fallback for directories
      });

      // Spy on unlinkSync to verify cleanup
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'rename-fail.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(`unique-content-for-cleanup-test-${Date.now()}`);

      expect(res.statusCode).toBe(500);
      expect(unlinkSpy).toHaveBeenCalled();

      renameSpy.mockRestore();
      existsSpy.mockRestore();
      unlinkSpy.mockRestore();
    });

    it('should deny downloadByName for private ISO if user is not member', async () => {
      // Ensure ISO is private
      await db.iso.update({ isPublic: false }, { where: { id: iso.id } });

      // Create outsider
      const outsider = await db.user.create({
        username: `outsider-dl-name-${Date.now()}`,
        email: `outsider-dl-name-${Date.now()}@test.com`,
        password: 'password',
        verified: true,
      });
      const token = jwt.sign({ id: outsider.id }, 'test-secret', { expiresIn: '1h' });

      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/name/${iso.name}/download`)
        .set('x-access-token', token);

      expect(res.statusCode).toBe(403);

      await outsider.destroy();
    });

    it('should allow downloadByName for public ISO without auth', async () => {
      // Make ISO public
      await db.iso.update({ isPublic: true }, { where: { id: iso.id } });

      const res = await request(app).get(
        `/api/organization/${orgName}/iso/name/${iso.name}/download`
      );

      expect(res.statusCode).toBe(200);

      // Revert
      await db.iso.update({ isPublic: false }, { where: { id: iso.id } });
    });
  });

  describe('ISO Controller Coverage - Isolated State', () => {
    let tempIsoId;

    afterEach(async () => {
      if (tempIsoId) {
        await db.iso.destroy({ where: { id: tempIsoId } });
        tempIsoId = null;
      }
      jest.restoreAllMocks();
    });

    it('should hit all branches in getDownloadLink (link.js)', async () => {
      // 1. Create a strictly PRIVATE ISO
      const privateIso = await db.iso.create({
        name: 'Strictly Private ISO',
        filename: 'private.iso',
        checksum: 'privatesum',
        size: 1024,
        organizationId: org.id,
        isPublic: false, // Ensure this is false
        storagePath: 'private.iso',
      });
      tempIsoId = privateIso.id;

      // Test 1: ISO Not Found (Line 52)
      await request(app)
        .post(`/api/organization/${orgName}/iso/9999999/download-link`)
        .set('x-access-token', authToken)
        .expect(404);

      // Test 2: Private ISO, No Token (Lines 58-60)
      await request(app)
        .post(`/api/organization/${orgName}/iso/${privateIso.id}/download-link`)
        .expect(403);

      // Test 3: Private ISO, Non-Member (Lines 62-68)
      const outsider = await db.user.create({
        username: `outsider-link-${Date.now()}`,
        email: `outsider-link-${Date.now()}@test.com`,
        password: 'password',
        verified: true,
      });
      const outsiderToken = jwt.sign({ id: outsider.id }, 'test-secret', { expiresIn: '1h' });

      await request(app)
        .post(`/api/organization/${orgName}/iso/${privateIso.id}/download-link`)
        .set('x-access-token', outsiderToken)
        .expect(403);

      await outsider.destroy();
    });

    it('should hit cleanup in upload (upload.js line 122)', async () => {
      const logSpy = jest.spyOn(log.app, 'warn');
      // Force renameSync to fail
      jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('Rename Failed');
      });
      // Force existsSync to return true for temp files to trigger cleanup
      const originalExists = fs.existsSync;
      jest.spyOn(fs, 'existsSync').mockImplementation(p => {
        const pathStr = p.toString();
        if (pathStr.includes('temp-') && pathStr.endsWith('.iso')) {
          return true;
        }
        if (pathStr.endsWith('.iso')) {
          return false;
        }
        return originalExists(p);
      });
      // Spy on unlinkSync and THROW to trigger the catch block (line 122)
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw new Error('Unlink Failed to trigger catch block');
      });

      await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'cleanup-test.iso')
        .send('content')
        .expect(500);

      expect(unlinkSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup temp file'),
        expect.any(String)
      );
      logSpy.mockRestore();
    });

    it('should generate download link with mismatched organization in URL', async () => {
      // This ensures the controller uses req.params.organization for the token payload
      const otherOrg = await db.organization.create({ name: `OtherLinkOrg-${Date.now()}` });

      const res = await request(app)
        .post(`/api/organization/${otherOrg.name}/iso/${iso.id}/download-link`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      const [, token] = res.body.downloadUrl.split('token=');
      const decoded = jwt.verify(token, 'test-secret');
      expect(decoded.organization).toBe(otherOrg.name);

      await otherOrg.destroy();
    });

    it('should handle range request with start only (bytes=0)', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/${iso.id}/download`)
        .set('x-access-token', authToken)
        .set('Range', 'bytes=0');

      expect(res.statusCode).toBe(206);
      expect(res.headers['content-length']).toBe('1024');
    });

    it('should handle range request with zero length (bytes=0-0)', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/${iso.id}/download`)
        .set('x-access-token', authToken)
        .set('Range', 'bytes=0-0');

      expect(res.statusCode).toBe(206);
      expect(res.headers['content-length']).toBe('1');
    });

    it('should hit cleanup log when deduplication fails', async () => {
      const logSpy = jest.spyOn(log.app, 'warn');

      // Mock existsSync to always return true (simulating existing final file)
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      // Mock unlinkSync to throw (simulating failure to remove temp file)
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw new Error('Unlink Failed');
      });

      await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'dedup-fail.iso')
        .send('content')
        .expect(500);

      expect(unlinkSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup temp file'),
        expect.any(String)
      );

      logSpy.mockRestore();
    });

    it('should log warning when temp file cleanup fails', async () => {
      const logSpy = jest.spyOn(log.app, 'warn');

      // Mock existsSync to ALWAYS return true
      // 1. Forces deduplication path (simulates final file exists)
      // 2. Ensures cleanup check passes (simulates temp file exists)
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      // Mock renameSync (should not be called in dedup path, but good practice)
      jest.spyOn(fs, 'renameSync').mockImplementation(() => {});

      // Mock unlinkSync to throw error, forcing execution into the inner catch block
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw new Error('Cleanup Error');
      });

      await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'cleanup-warn.iso')
        .send('content')
        .expect(500);

      expect(unlinkSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup temp file'),
        expect.stringContaining('Cleanup Error')
      );

      logSpy.mockRestore();
    });
  });

  describe('ISO Helpers Unit Tests', () => {
    it('cleanupTempFile should delete file if it exists', () => {
      const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      cleanupTempFile('/tmp/test-file');

      expect(existsSpy).toHaveBeenCalledWith('/tmp/test-file');
      expect(unlinkSpy).toHaveBeenCalledWith('/tmp/test-file');
    });

    it('cleanupTempFile should do nothing if file does not exist', () => {
      const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      cleanupTempFile('/tmp/non-existent');

      expect(existsSpy).toHaveBeenCalledWith('/tmp/non-existent');
      expect(unlinkSpy).not.toHaveBeenCalled();
    });

    it('cleanupTempFile should log warning if unlink fails', () => {
      const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw new Error('Unlink failed');
      });
      const logSpy = jest.spyOn(log.app, 'warn');

      cleanupTempFile('/tmp/locked-file');

      expect(existsSpy).toHaveBeenCalled();
      expect(unlinkSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup temp file'),
        expect.any(String)
      );
    });
  });
});
