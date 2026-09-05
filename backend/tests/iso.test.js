import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
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

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const sha256 = content => createHash('sha256').update(content).digest('hex');

describe('ISO API', () => {
  let authToken;
  let adminToken;
  let user;
  let admin;
  let org;
  const uniqueId = Date.now();
  const orgName = `IsoOrg_${uniqueId}`;
  const isoName = 'test-iso';
  const isoBase = `/api/organization/${orgName}/iso/${isoName}`;
  const versionNumber = '1.0.0';
  const versionBase = `${isoBase}/version/${versionNumber}`;
  const fileBase = `${versionBase}/architecture/amd64/file`;
  const fileContent = Buffer.from(`iso-file-content-${uniqueId}`);

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const createOutsider = async label => {
    const outsider = await db.user.create({
      username: `outsider-${label}-${Date.now()}`,
      email: `outsider-${label}-${Date.now()}@test.com`,
      password: 'password',
      verified: true,
    });
    return { outsider, token: signFor(outsider) };
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);

    org = await db.organization.create({
      name: orgName,
      access_mode: 'private',
    });

    user = await db.user.create({
      username: `IsoUser_${uniqueId}`,
      email: `isouser_${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await user.setRoles([userRole]);
    await db.UserOrg.create({ user_id: user.id, organization_id: org.id, role: 'member' });
    authToken = signFor(user);

    admin = await db.user.create({
      username: `IsoAdmin_${uniqueId}`,
      email: `isoadmin_${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await admin.setRoles([adminRole]);
    await db.UserOrg.create({ user_id: admin.id, organization_id: org.id, role: 'owner' });
    adminToken = signFor(admin);

    const isoRoot = getIsoStorageRoot();
    if (!fs.existsSync(isoRoot)) {
      fs.mkdirSync(isoRoot, { recursive: true });
    }
  });

  afterAll(async () => {
    await db.iso.destroy({ where: { organizationId: org.id } });
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

  describe('POST /api/organization/:organization/iso', () => {
    it('should create an ISO from a JSON body with whitelisted metadata', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send({
          name: isoName,
          description: 'Test ISO',
          metadata: { distro: 'debian', bogus: 'dropped' },
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe(isoName);
      expect(res.body.published).toBe(true);
      expect(res.body.isPublic).toBe(false);
      expect(res.body.metadata).toEqual({ distro: 'debian' });
    });

    it('should reject an invalid ISO name', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send({ name: '../etc/passwd' });
      expect(res.statusCode).toBe(400);
    });

    it('should reject a duplicate ISO name with 409', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send({ name: isoName });
      expect(res.statusCode).toBe(409);
    });

    it('should reject a plain member', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', authToken)
        .send({ name: 'member-iso' });
      expect(res.statusCode).toBe(403);
    });

    it('should reject metadata that is not an object', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send({ name: 'bad-metadata', metadata: 'nope' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/organization/:organization/iso', () => {
    it('should list every ISO with its versions for an organization member', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const entry = res.body.find(candidate => candidate.name === isoName);
      expect(entry).toBeDefined();
      expect(Array.isArray(entry.versions)).toBe(true);
      expect(entry.downloadCount).toBe(0);
      expect(entry.organization.name).toBe(orgName);
    });

    it('should hide private ISOs from anonymous callers', async () => {
      const res = await request(app).get(`/api/organization/${orgName}/iso`);
      expect(res.statusCode).toBe(200);
      expect(res.body.some(entry => entry.name === isoName)).toBe(false);
    });

    it('should hide unpublished ISOs from non-members', async () => {
      await db.iso.update(
        { isPublic: true, published: false },
        { where: { name: isoName, organizationId: org.id } }
      );
      const res = await request(app).get(`/api/organization/${orgName}/iso`);
      expect(res.statusCode).toBe(200);
      expect(res.body.some(entry => entry.name === isoName)).toBe(false);
      await db.iso.update(
        { isPublic: false, published: true },
        { where: { name: isoName, organizationId: org.id } }
      );
    });

    it('should show an unpublished ISO only to the member who created it', async () => {
      await db.iso.update(
        { published: false },
        { where: { name: isoName, organizationId: org.id } }
      );
      const creator = await request(app)
        .get(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken);
      expect(creator.statusCode).toBe(200);
      expect(creator.body.some(entry => entry.name === isoName)).toBe(true);

      const member = await request(app)
        .get(`/api/organization/${orgName}/iso`)
        .set('x-access-token', authToken);
      expect(member.statusCode).toBe(200);
      expect(member.body.some(entry => entry.name === isoName)).toBe(false);

      const detail = await request(app).get(isoBase).set('x-access-token', authToken);
      expect(detail.statusCode).toBe(403);

      await db.iso.update(
        { published: true },
        { where: { name: isoName, organizationId: org.id } }
      );
    });

    it('should list public published ISOs for anonymous callers', async () => {
      await db.iso.update({ isPublic: true }, { where: { name: isoName, organizationId: org.id } });
      const res = await request(app).get(`/api/organization/${orgName}/iso`);
      expect(res.statusCode).toBe(200);
      expect(res.body.some(entry => entry.name === isoName)).toBe(true);
      await db.iso.update(
        { isPublic: false },
        { where: { name: isoName, organizationId: org.id } }
      );
    });

    it('should return 404 if organization not found', async () => {
      const res = await request(app)
        .get(`/api/organization/NonExistentOrg/iso`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should handle DB error in findAll', async () => {
      jest.spyOn(db.iso, 'findAll').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/isos/discover', () => {
    it('should list public ISOs with their versions', async () => {
      const res = await request(app).get('/api/isos/discover');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      res.body.forEach(entry => expect(Array.isArray(entry.versions)).toBe(true));
    });

    it('should handle DB error in discover', async () => {
      jest.spyOn(db.iso, 'findAll').mockRejectedValue(new Error('DB Error'));
      const res = await request(app).get('/api/isos/discover');
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });
  });

  describe('GET /api/organization/:organization/iso/:name', () => {
    it('should get ISO details with versions and downloadCount', async () => {
      const res = await request(app).get(isoBase).set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe(isoName);
      expect(Array.isArray(res.body.versions)).toBe(true);
      expect(res.body.downloadCount).toBe(0);
    });

    it('should refuse a private ISO to an anonymous caller', async () => {
      const res = await request(app).get(isoBase);
      expect(res.statusCode).toBe(403);
    });

    it('should return 404 if ISO not found', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/iso/no-such-iso`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if organization not found', async () => {
      const res = await request(app).get(`/api/organization/NonExistentOrg/iso/${isoName}`);
      expect(res.statusCode).toBe(404);
    });

    it('should handle DB error in findOne', async () => {
      jest.spyOn(db.iso, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app).get(isoBase).set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
    });
  });

  describe('PUT /api/organization/:organization/iso/:name', () => {
    it('should rename an ISO and change its visibility', async () => {
      await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send({ name: 'rename-me' })
        .expect(201);

      const res = await request(app)
        .put(`/api/organization/${orgName}/iso/rename-me`)
        .set('x-access-token', adminToken)
        .send({ name: 'renamed-iso', isPublic: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('renamed-iso');
      expect(res.body.isPublic).toBe(true);

      const conflict = await request(app)
        .put(`/api/organization/${orgName}/iso/renamed-iso`)
        .set('x-access-token', adminToken)
        .send({ name: isoName });
      expect(conflict.statusCode).toBe(409);

      await db.iso.destroy({ where: { name: 'renamed-iso', organizationId: org.id } });
    });

    it('should update description and metadata, and clear metadata with null', async () => {
      const res = await request(app)
        .put(isoBase)
        .set('x-access-token', adminToken)
        .send({ description: 'New Description', metadata: { os_name: 'Debian 13', bogus: 1 } });
      expect(res.statusCode).toBe(200);
      expect(res.body.description).toBe('New Description');
      expect(res.body.metadata).toEqual({ os_name: 'Debian 13' });

      const cleared = await request(app)
        .put(isoBase)
        .set('x-access-token', adminToken)
        .send({ metadata: null });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.body.metadata).toBeNull();
    });

    it('should unpublish and publish an ISO', async () => {
      const hidden = await request(app)
        .put(isoBase)
        .set('x-access-token', adminToken)
        .send({ published: false });
      expect(hidden.statusCode).toBe(200);
      expect(hidden.body.published).toBe(false);

      const shown = await request(app)
        .put(isoBase)
        .set('x-access-token', adminToken)
        .send({ published: true });
      expect(shown.statusCode).toBe(200);
      expect(shown.body.published).toBe(true);
    });

    it('should update ISO with empty body', async () => {
      const res = await request(app).put(isoBase).set('x-access-token', adminToken).send();
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe(isoName);
    });

    it('should return 404 if ISO not found', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/iso/no-such-iso`)
        .set('x-access-token', adminToken)
        .send({ description: 'x' });
      expect(res.statusCode).toBe(404);
    });

    it('should handle update error (500)', async () => {
      jest.spyOn(db.iso, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .put(isoBase)
        .set('x-access-token', adminToken)
        .send({ description: 'x' });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('ISO watches', () => {
    it('should watch, list and unwatch an ISO', async () => {
      const watched = await request(app).post(`${isoBase}/watch`).set('x-access-token', authToken);
      expect(watched.statusCode).toBe(201);
      expect(watched.body).toEqual({ watched: true });

      const again = await request(app).post(`${isoBase}/watch`).set('x-access-token', authToken);
      expect(again.statusCode).toBe(200);

      const listed = await request(app)
        .get('/api/user/iso-watches')
        .set('x-access-token', authToken);
      expect(listed.statusCode).toBe(200);
      expect(listed.body.some(entry => entry.name === isoName)).toBe(true);

      const unwatched = await request(app)
        .delete(`${isoBase}/watch`)
        .set('x-access-token', authToken);
      expect(unwatched.statusCode).toBe(200);
      expect(unwatched.body).toEqual({ watched: false });

      const emptied = await request(app)
        .get('/api/user/iso-watches')
        .set('x-access-token', authToken);
      expect(emptied.body.some(entry => entry.name === isoName)).toBe(false);
    });

    it('should refuse to watch a private ISO of another organization', async () => {
      const { outsider, token } = await createOutsider('watch');
      const res = await request(app).post(`${isoBase}/watch`).set('x-access-token', token);
      expect(res.statusCode).toBe(403);
      await outsider.destroy();
    });

    it('should return 404 when watching an unknown ISO', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/no-such-iso/watch`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should notify watchers when an ISO is published', async () => {
      await request(app).post(`${isoBase}/watch`).set('x-access-token', authToken);
      await db.iso.update(
        { published: false },
        { where: { name: isoName, organizationId: org.id } }
      );

      const res = await request(app)
        .put(isoBase)
        .set('x-access-token', adminToken)
        .send({ published: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.published).toBe(true);

      await request(app).delete(`${isoBase}/watch`).set('x-access-token', authToken);
    });
  });

  describe('ISO versions', () => {
    it('should create a version', async () => {
      const res = await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', adminToken)
        .send({ versionNumber, description: 'First' });
      expect(res.statusCode).toBe(201);
      expect(res.body.versionNumber).toBe(versionNumber);
      expect(res.body.description).toBe('First');
      expect(res.body.deprecated).toBe(false);
    });

    it('should reject a duplicate version with 409', async () => {
      const res = await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', adminToken)
        .send({ versionNumber });
      expect(res.statusCode).toBe(409);
    });

    it('should reject an invalid version number', async () => {
      const res = await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', adminToken)
        .send({ versionNumber: '../1' });
      expect(res.statusCode).toBe(400);
    });

    it('should reject a plain member', async () => {
      const res = await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', authToken)
        .send({ versionNumber: '2.0.0' });
      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for an unknown ISO', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/no-such-iso/version`)
        .set('x-access-token', adminToken)
        .send({ versionNumber: '2.0.0' });
      expect(res.statusCode).toBe(404);
    });

    it('should list versions with their files for a member', async () => {
      const res = await request(app).get(`${isoBase}/version`).set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.some(entry => entry.versionNumber === versionNumber)).toBe(true);
      expect(Array.isArray(res.body[0].files)).toBe(true);
    });

    it('should refuse the version list of a private ISO to an anonymous caller', async () => {
      const res = await request(app).get(`${isoBase}/version`);
      expect(res.statusCode).toBe(403);
    });

    it('should get one version', async () => {
      const res = await request(app).get(versionBase).set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.versionNumber).toBe(versionNumber);
    });

    it('should return 404 for an unknown version', async () => {
      const res = await request(app)
        .get(`${isoBase}/version/9.9.9`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should update release notes and deprecation', async () => {
      const missingReason = await request(app)
        .put(versionBase)
        .set('x-access-token', adminToken)
        .send({ deprecated: true });
      expect(missingReason.statusCode).toBe(400);

      const res = await request(app).put(versionBase).set('x-access-token', adminToken).send({
        description: 'Updated',
        releaseNotes: 'Notes',
        deprecated: true,
        deprecationReason: 'Superseded',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.description).toBe('Updated');
      expect(res.body.releaseNotes).toBe('Notes');
      expect(res.body.deprecated).toBe(true);
      expect(res.body.deprecationReason).toBe('Superseded');

      const restored = await request(app)
        .put(versionBase)
        .set('x-access-token', adminToken)
        .send({ deprecated: false, deprecationReason: null });
      expect(restored.statusCode).toBe(200);
      expect(restored.body.deprecated).toBe(false);
    });

    it('should reject invalid version fields', async () => {
      const res = await request(app)
        .put(versionBase)
        .set('x-access-token', adminToken)
        .send({ releaseNotes: 42 });
      expect(res.statusCode).toBe(400);
    });

    it('should delete a version and answer 404 afterwards', async () => {
      await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', adminToken)
        .send({ versionNumber: '0.9.0' })
        .expect(201);

      const res = await request(app)
        .delete(`${isoBase}/version/0.9.0`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);

      const gone = await request(app)
        .delete(`${isoBase}/version/0.9.0`)
        .set('x-access-token', adminToken);
      expect(gone.statusCode).toBe(404);
    });
  });

  describe('ISO files', () => {
    const checksum = sha256(fileContent);
    const storedPath = () => join(getIsoStorageRoot(), `${checksum}.iso`);

    it('should upload a file for an architecture', async () => {
      const res = await request(app)
        .post(`${fileBase}/upload`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'debian-13-amd64.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(res.statusCode).toBe(201);
      expect(res.body.architecture).toBe('amd64');
      expect(res.body.fileName).toBe('debian-13-amd64.iso');
      expect(res.body.checksum).toBe(checksum);
      expect(res.body.checksumType).toBe('SHA256');
      expect(Number(res.body.fileSize)).toBe(fileContent.length);
      expect(fs.existsSync(storedPath())).toBe(true);
    });

    it('should replace the file record when uploading the same architecture again', async () => {
      const res = await request(app)
        .post(`${fileBase}/upload`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'debian-13-amd64-again.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(res.statusCode).toBe(201);
      expect(res.body.fileName).toBe('debian-13-amd64-again.iso');
      const count = await db.isoFiles.count({ where: { architecture: 'amd64' } });
      expect(count).toBe(1);
    });

    it('should deduplicate identical content across architectures', async () => {
      const res = await request(app)
        .post(`${versionBase}/architecture/arm64/file/upload`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'debian-13-arm64.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(res.statusCode).toBe(201);
      expect(res.body.checksum).toBe(checksum);
      expect(res.body.storagePath).toBe(`${checksum}.iso`);
    });

    it('should reject a path traversal filename', async () => {
      const res = await request(app)
        .post(`${fileBase}/upload`)
        .set('x-access-token', adminToken)
        .set('x-file-name', '../../etc/passwd')
        .set('Content-Type', 'application/octet-stream')
        .send('malicious content');
      expect(res.statusCode).toBe(400);
    });

    it('should reject an invalid architecture segment', async () => {
      const res = await request(app)
        .post(`${versionBase}/architecture/..bad/file/upload`)
        .set('x-access-token', adminToken)
        .set('Content-Type', 'application/octet-stream')
        .send('content');
      expect(res.statusCode).toBe(400);
    });

    it('should return 404 when uploading to an unknown version', async () => {
      const res = await request(app)
        .post(`${isoBase}/version/9.9.9/architecture/amd64/file/upload`)
        .set('x-access-token', adminToken)
        .set('Content-Type', 'application/octet-stream')
        .send('content');
      expect(res.statusCode).toBe(404);
    });

    it('should reject a plain member upload', async () => {
      const res = await request(app)
        .post(`${fileBase}/upload`)
        .set('x-access-token', authToken)
        .set('Content-Type', 'application/octet-stream')
        .send('content');
      expect(res.statusCode).toBe(403);
    });

    it('should return 413 if file is too large (config modification)', async () => {
      const configPath = getConfigPath('app');
      const originalConfig = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(originalConfig);
      config.boxvault.box_max_file_size.value = 0.000001;
      fs.writeFileSync(configPath, yaml.dump(config));

      try {
        const res = await request(app)
          .post(`${versionBase}/architecture/i386/file/upload`)
          .set('x-access-token', adminToken)
          .set('x-file-name', 'large.iso')
          .set('Content-Type', 'application/octet-stream')
          .send(Buffer.alloc(2048));
        expect(res.statusCode).toBe(413);
        expect(res.body.error).toBe('FILE_TOO_LARGE');
      } finally {
        fs.writeFileSync(configPath, originalConfig);
      }
    });

    it('should clean up the temp file when the rename fails', async () => {
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('Rename Error');
      });
      const originalExists = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        const p = String(pathArg);
        if (p.includes('temp-')) {
          return true;
        }
        if (p.endsWith('.iso')) {
          return false;
        }
        return originalExists(pathArg);
      });
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const res = await request(app)
        .post(`${versionBase}/architecture/i386/file/upload`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'rename-fail.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(`unique-${Date.now()}`);

      expect(res.statusCode).toBe(500);
      expect(unlinkSpy).toHaveBeenCalled();

      renameSpy.mockRestore();
      existsSpy.mockRestore();
      unlinkSpy.mockRestore();
    });

    it('should return file info', async () => {
      const res = await request(app).get(`${fileBase}/info`).set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        fileName: 'debian-13-amd64-again.iso',
        fileSize: expect.anything(),
        checksum,
        checksumType: 'SHA256',
        downloadCount: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should refuse file info of a private ISO to an anonymous caller', async () => {
      const res = await request(app).get(`${fileBase}/info`);
      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for info of an architecture without a file', async () => {
      const res = await request(app)
        .get(`${versionBase}/architecture/riscv64/file/info`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should generate a download link scoped to the file', async () => {
      const res = await request(app)
        .post(`${fileBase}/get-download-link`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('downloadUrl');
      const [, token] = res.body.downloadUrl.split('token=');
      const decoded = jwt.verify(token, 'test-secret');
      expect(decoded.type).toBe('download');
      expect(decoded.organization).toBe(orgName);
      expect(decoded.iso).toBe(isoName);
      expect(decoded.versionNumber).toBe(versionNumber);
      expect(decoded.architecture).toBe('amd64');
    });

    it('should deny a download link for a private ISO to a non-member', async () => {
      const { outsider, token } = await createOutsider('link');
      const res = await request(app)
        .post(`${fileBase}/get-download-link`)
        .set('x-access-token', token);
      expect(res.statusCode).toBe(403);
      await outsider.destroy();
    });

    it('should deny a download link for a private ISO without a token', async () => {
      const res = await request(app).post(`${fileBase}/get-download-link`);
      expect(res.statusCode).toBe(403);
    });

    it('should generate a download link for a service account', async () => {
      const sa = await db.service_account.create({
        username: `sa-link-${Date.now()}`,
        token: `sa-token-${Date.now()}`,
        organization_id: org.id,
        userId: user.id,
      });
      const saToken = jwt.sign(
        { id: user.id, isServiceAccount: true, serviceAccountOrgId: org.id },
        'test-secret',
        { expiresIn: '1h', ...TEST_JWT_CLAIMS }
      );

      const res = await request(app)
        .post(`${fileBase}/get-download-link`)
        .set('x-access-token', saToken);
      expect(res.statusCode).toBe(200);
      const [, token] = res.body.downloadUrl.split('token=');
      expect(jwt.verify(token, 'test-secret').isServiceAccount).toBe(true);

      await sa.destroy();
    });

    it('should download the file and count the download', async () => {
      const res = await request(app)
        .get(`${fileBase}/download`)
        .set('x-access-token', authToken)
        .buffer(true)
        .parse((response, callback) => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-length']).toBe(String(fileContent.length));
      expect(res.headers['content-disposition']).toContain('debian-13-amd64-again.iso');
      expect(Buffer.compare(res.body, fileContent)).toBe(0);

      const info = await request(app).get(`${fileBase}/info`).set('x-access-token', authToken);
      expect(info.body.downloadCount).toBe(1);

      const iso = await request(app).get(isoBase).set('x-access-token', authToken);
      expect(iso.body.downloadCount).toBe(1);
    });

    it('should handle range requests', async () => {
      const res = await request(app)
        .get(`${fileBase}/download`)
        .set('x-access-token', authToken)
        .set('Range', 'bytes=0-4');
      expect(res.statusCode).toBe(206);
      expect(res.headers['content-length']).toBe('5');
    });

    it('should download using a valid download token', async () => {
      const token = jwt.sign(
        {
          userId: user.id,
          organization: orgName,
          iso: isoName,
          versionNumber,
          architecture: 'amd64',
          type: 'download',
        },
        'test-secret',
        { expiresIn: '1h', ...TEST_JWT_CLAIMS }
      );
      const res = await request(app).get(`${fileBase}/download?token=${token}`);
      expect(res.statusCode).toBe(200);
    });

    it('should refuse a download token issued for another file', async () => {
      const token = jwt.sign(
        {
          userId: user.id,
          organization: orgName,
          iso: isoName,
          versionNumber,
          architecture: 'arm64',
          type: 'download',
        },
        'test-secret',
        { expiresIn: '1h', ...TEST_JWT_CLAIMS }
      );
      const res = await request(app).get(`${fileBase}/download?token=${token}`);
      expect(res.statusCode).toBe(403);
    });

    it('should refuse an anonymous download of a private ISO', async () => {
      const res = await request(app).get(`${fileBase}/download`);
      expect(res.statusCode).toBe(403);
    });

    it('should refuse a non-member download of a private ISO', async () => {
      const { outsider, token } = await createOutsider('download');
      const res = await request(app).get(`${fileBase}/download`).set('x-access-token', token);
      expect(res.statusCode).toBe(403);
      await outsider.destroy();
    });

    it('should allow an anonymous download of a public published ISO', async () => {
      await db.iso.update({ isPublic: true }, { where: { name: isoName, organizationId: org.id } });
      const res = await request(app).get(`${fileBase}/download`);
      expect(res.statusCode).toBe(200);
      await db.iso.update(
        { isPublic: false },
        { where: { name: isoName, organizationId: org.id } }
      );
    });

    it('should return 404 for a download of an architecture without a file', async () => {
      const res = await request(app)
        .get(`${versionBase}/architecture/riscv64/file/download`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if the physical file is missing', async () => {
      const ghost = await db.isoFiles.findOne({ where: { architecture: 'arm64' } });
      await ghost.update({ storagePath: 'non-existent-file.iso' });
      const res = await request(app)
        .get(`${versionBase}/architecture/arm64/file/download`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
      await ghost.update({ storagePath: `${checksum}.iso` });
    });

    it('should handle a download error (500)', async () => {
      const statSpy = jest.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('Stat Error');
      });
      const res = await request(app).get(`${fileBase}/download`).set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
      statSpy.mockRestore();
    });

    it('should keep the physical file while another record shares its checksum', async () => {
      const res = await request(app)
        .delete(`${versionBase}/architecture/arm64/file/delete`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(storedPath())).toBe(true);

      const gone = await request(app)
        .delete(`${versionBase}/architecture/arm64/file/delete`)
        .set('x-access-token', adminToken);
      expect(gone.statusCode).toBe(404);
    });

    it('should remove the physical file with the last record', async () => {
      const res = await request(app).delete(`${fileBase}/delete`).set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(storedPath())).toBe(false);
    });

    it('should reject a plain member file delete', async () => {
      const res = await request(app).delete(`${fileBase}/delete`).set('x-access-token', authToken);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/organization/:organization/iso/:name', () => {
    it('should delete the ISO with its versions and files', async () => {
      const content = Buffer.from(`delete-me-${uniqueId}`);
      await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send({ name: 'delete-me' })
        .expect(201);
      await request(app)
        .post(`/api/organization/${orgName}/iso/delete-me/version`)
        .set('x-access-token', adminToken)
        .send({ versionNumber: '1.0.0' })
        .expect(201);
      await request(app)
        .post(
          `/api/organization/${orgName}/iso/delete-me/version/1.0.0/architecture/amd64/file/upload`
        )
        .set('x-access-token', adminToken)
        .set('x-file-name', 'delete-me.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(content)
        .expect(201);
      const filePath = join(getIsoStorageRoot(), `${sha256(content)}.iso`);
      expect(fs.existsSync(filePath)).toBe(true);

      const res = await request(app)
        .delete(`/api/organization/${orgName}/iso/delete-me`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(filePath)).toBe(false);
      expect(await db.iso.count({ where: { name: 'delete-me', organizationId: org.id } })).toBe(0);
    });

    it('should return 404 when deleting a non-existent ISO', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/iso/no-such-iso`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('should handle a DB error during delete', async () => {
      jest.spyOn(db.iso, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app).delete(isoBase).set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
    });
  });

  describe('DELETE /api/organization/:organization/iso', () => {
    it('should remove every ISO of the organization and answer 404 once empty', async () => {
      const otherOrg = await db.organization.create({
        name: `IsoRemoveAllOrg_${Date.now()}`,
        access_mode: 'private',
      });
      await db.iso.create({ name: 'remove-a', organizationId: otherOrg.id });
      await db.iso.create({ name: 'remove-b', organizationId: otherOrg.id });

      const removed = await request(app)
        .delete(`/api/organization/${otherOrg.name}/iso`)
        .set('x-access-token', adminToken);
      expect(removed.statusCode).toBe(200);
      expect(await db.iso.count({ where: { organizationId: otherOrg.id } })).toBe(0);

      const empty = await request(app)
        .delete(`/api/organization/${otherOrg.name}/iso`)
        .set('x-access-token', adminToken);
      expect(empty.statusCode).toBe(404);

      await otherOrg.destroy();
    });
  });

  describe('ISO Helpers Unit Tests', () => {
    it('should use configured storage path', () => {
      const configPath = getConfigPath('app');
      const originalConfig = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(originalConfig);
      config.boxvault.iso_storage_directory = { value: '/tmp/custom-iso' };
      fs.writeFileSync(configPath, yaml.dump(config));

      try {
        expect(getIsoStorageRoot()).toBe('/tmp/custom-iso');
      } finally {
        fs.writeFileSync(configPath, originalConfig);
      }
    });

    it('should throw error for path traversal in helper', () => {
      expect(() => getSecureIsoPath('../../etc/passwd')).toThrow('Path traversal attempt detected');
    });

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
