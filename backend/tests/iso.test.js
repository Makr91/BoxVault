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
import { getConfigPath, reloadConfig } from '../app/utils/config-loader.js';
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
      expect(res.body.is_public).toBe(false);
      expect(res.body.metadata).toEqual({ distro: 'debian' });
    });

    it('should reject an invalid ISO name', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send({ name: '../etc/passwd' });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/name', rule: 'pattern', params: { pattern: 'slug' } }),
      ]);
    });

    it('should reject a duplicate ISO name with 409', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send({ name: isoName });
      expect(res.statusCode).toBe(409);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/name', rule: 'unique', params: { scope: orgName } }),
      ]);
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
      expect(res.statusCode).toBe(422);
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
      expect(entry.download_count).toBe(0);
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
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
      expect(res.body.title).toBeDefined();
    });
  });

  describe('GET /api/organization/:organization/iso/:name', () => {
    it('should get ISO details with versions and downloadCount', async () => {
      const res = await request(app).get(isoBase).set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe(isoName);
      expect(Array.isArray(res.body.versions)).toBe(true);
      expect(res.body.download_count).toBe(0);
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
        .send({ name: 'renamed-iso', is_public: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('renamed-iso');
      expect(res.body.is_public).toBe(true);

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
        .send({ version_number: versionNumber, description: 'First', published: true });
      expect(res.statusCode).toBe(201);
      expect(res.body.version_number).toBe(versionNumber);
      expect(res.body.description).toBe('First');
      expect(res.body.deprecated).toBe(false);
      expect(res.body.published).toBe(true);
      expect(res.body.is_public).toBe(false);
      expect(res.body.guest_access).toBe(false);
    });

    it('should be born private and unpublished without the words and never wider than the ISO', async () => {
      const closed = await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', adminToken)
        .send({ version_number: '0.5.0' });
      expect(closed.statusCode).toBe(201);
      expect(closed.body.published).toBe(false);
      expect(closed.body.is_public).toBe(false);
      const hidden = await request(app)
        .get(`${isoBase}/version/0.5.0`)
        .set('x-access-token', authToken);
      expect(hidden.statusCode).toBe(404);
      const listed = await request(app).get(`${isoBase}/version`).set('x-access-token', authToken);
      expect(listed.body.some(entry => entry.version_number === '0.5.0')).toBe(false);
      const asAdmin = await request(app)
        .get(`${isoBase}/version/0.5.0`)
        .set('x-access-token', adminToken);
      expect(asAdmin.statusCode).toBe(200);

      const wider = await request(app)
        .put(`${isoBase}/version/0.5.0`)
        .set('x-access-token', adminToken)
        .send({ is_public: true, published: true });
      expect(wider.statusCode).toBe(422);
      expect(wider.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/is_public',
          rule: 'withinParent',
          params: { parent: 'private' },
        }),
      ]);
      const bornWide = await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', adminToken)
        .send({ version_number: '0.6.0', guest_access: true, published: true });
      expect(bornWide.statusCode).toBe(422);
      expect(bornWide.body.errors).toEqual([
        expect.objectContaining({ pointer: '/guest_access', rule: 'withinParent' }),
      ]);

      const published = await request(app)
        .post(`${isoBase}/version/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'publish', names: ['0.5.0'] });
      expect(published.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      const opened = await request(app)
        .post(`${isoBase}/version/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'make_public', names: ['0.5.0'] });
      expect(opened.body).toEqual({
        processed: 0,
        skipped: 1,
        errors: [{ name: '0.5.0', code: 'forbidden' }],
      });
      const shown = await request(app)
        .get(`${isoBase}/version/0.5.0`)
        .set('x-access-token', authToken);
      expect(shown.statusCode).toBe(200);
      await request(app).delete(`${isoBase}/version/0.5.0`).set('x-access-token', adminToken);
    });

    it('should reject a duplicate version with 409', async () => {
      const res = await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', adminToken)
        .send({ version_number: versionNumber });
      expect(res.statusCode).toBe(409);
      expect(res.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/version_number',
          rule: 'unique',
          params: { scope: isoName },
        }),
      ]);
    });

    it('should reject an invalid version number', async () => {
      const res = await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', adminToken)
        .send({ version_number: '../1' });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/version_number',
          rule: 'pattern',
          params: { pattern: 'identifier' },
        }),
      ]);
    });

    it('should reject a plain member', async () => {
      const res = await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', authToken)
        .send({ version_number: '2.0.0' });
      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for an unknown ISO', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/no-such-iso/version`)
        .set('x-access-token', adminToken)
        .send({ version_number: '2.0.0' });
      expect(res.statusCode).toBe(404);
    });

    it('should list versions with their files for a member', async () => {
      const res = await request(app).get(`${isoBase}/version`).set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.some(entry => entry.version_number === versionNumber)).toBe(true);
      expect(Array.isArray(res.body[0].files)).toBe(true);
    });

    it('should refuse the version list of a private ISO to an anonymous caller', async () => {
      const res = await request(app).get(`${isoBase}/version`);
      expect(res.statusCode).toBe(403);
    });

    it('should get one version', async () => {
      const res = await request(app).get(versionBase).set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.version_number).toBe(versionNumber);
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
      expect(missingReason.statusCode).toBe(422);
      expect(missingReason.body.errors).toEqual([
        expect.objectContaining({ pointer: '/deprecation_reason', rule: 'required' }),
      ]);

      const res = await request(app).put(versionBase).set('x-access-token', adminToken).send({
        description: 'Updated',
        release_notes: 'Notes',
        deprecated: true,
        deprecation_reason: 'Superseded',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.description).toBe('Updated');
      expect(res.body.release_notes).toBe('Notes');
      expect(res.body.deprecated).toBe(true);
      expect(res.body.deprecation_reason).toBe('Superseded');

      const restored = await request(app)
        .put(versionBase)
        .set('x-access-token', adminToken)
        .send({ deprecated: false, deprecation_reason: null });
      expect(restored.statusCode).toBe(200);
      expect(restored.body.deprecated).toBe(false);
    });

    it('should reject invalid version fields', async () => {
      const res = await request(app)
        .put(versionBase)
        .set('x-access-token', adminToken)
        .send({ release_notes: 42 });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/release_notes', rule: 'type' }),
      ]);
    });

    it('should delete a version and answer 404 afterwards', async () => {
      await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', adminToken)
        .send({ version_number: '0.9.0' })
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

  describe('Guest membership', () => {
    const guestContent = Buffer.from(`iso-guest-content-${uniqueId}`);
    const guestFileBase = `${versionBase}/architecture/guest64/file`;
    let guest;
    let guestToken;

    beforeAll(async () => {
      guest = await db.user.create({
        username: `IsoGuest_${uniqueId}`,
        email: `isoguest_${uniqueId}@example.com`,
        password: 'password',
        verified: true,
      });
      const userRole = await db.role.findOne({ where: { name: 'user' } });
      await guest.setRoles([userRole]);
      await db.UserOrg.create({ user_id: guest.id, organization_id: org.id, role: 'guest' });
      guestToken = signFor(guest);
      await db.iso.update(
        { guestAccess: true },
        { where: { name: isoName, organizationId: org.id } }
      );
      const iso = await db.iso.findOne({ where: { name: isoName, organizationId: org.id } });
      await db.isoVersions.update({ guestAccess: true }, { where: { isoId: iso.id } });
    });

    afterAll(async () => {
      await db.iso.update(
        { guestAccess: false },
        { where: { name: isoName, organizationId: org.id } }
      );
      await guest.destroy();
    });

    it('should list and read the private published ISO flagged for guests without counts', async () => {
      const list = await request(app)
        .get(`/api/organization/${orgName}/iso`)
        .set('x-access-token', guestToken);
      expect(list.statusCode).toBe(200);
      const listed = list.body.find(entry => entry.name === isoName);
      expect(listed).toBeDefined();
      expect(listed.guest_access).toBe(true);
      expect(listed.download_count).toBeNull();

      const one = await request(app).get(isoBase).set('x-access-token', guestToken);
      expect(one.statusCode).toBe(200);
      expect(one.body.name).toBe(isoName);
      expect(one.body.download_count).toBeNull();

      const versions = await request(app)
        .get(`${isoBase}/version`)
        .set('x-access-token', guestToken);
      expect(versions.statusCode).toBe(200);
      expect(versions.body.some(entry => entry.version_number === versionNumber)).toBe(true);

      const discovered = await request(app)
        .get('/api/isos/discover')
        .set('x-access-token', guestToken);
      expect(discovered.statusCode).toBe(200);
      expect(discovered.body.find(entry => entry.name === isoName).download_count).toBeNull();
    });

    it('should be hidden once the flag is withdrawn and shown again by allow_guests', async () => {
      await db.iso.update(
        { guestAccess: false },
        { where: { name: isoName, organizationId: org.id } }
      );

      const list = await request(app)
        .get(`/api/organization/${orgName}/iso`)
        .set('x-access-token', guestToken);
      expect(list.statusCode).toBe(200);
      expect(list.body.some(entry => entry.name === isoName)).toBe(false);
      const one = await request(app).get(isoBase).set('x-access-token', guestToken);
      expect(one.statusCode).toBe(403);
      const versions = await request(app)
        .get(`${isoBase}/version`)
        .set('x-access-token', guestToken);
      expect(versions.statusCode).toBe(403);
      const version = await request(app).get(versionBase).set('x-access-token', guestToken);
      expect(version.statusCode).toBe(403);
      const watched = await request(app).post(`${isoBase}/watch`).set('x-access-token', guestToken);
      expect(watched.statusCode).toBe(403);
      const asMember = await request(app).get(isoBase).set('x-access-token', authToken);
      expect(asMember.statusCode).toBe(200);
      expect(asMember.body.download_count).toBe(0);

      const allowed = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'allow_guests', names: [isoName] });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      const again = await request(app).get(isoBase).set('x-access-token', guestToken);
      expect(again.statusCode).toBe(200);
      expect(again.body.guest_access).toBe(true);

      const denied = await request(app)
        .put(isoBase)
        .set('x-access-token', adminToken)
        .send({ guest_access: false });
      expect(denied.statusCode).toBe(200);
      expect(denied.body.guest_access).toBe(false);
      const gone = await request(app).get(isoBase).set('x-access-token', guestToken);
      expect(gone.statusCode).toBe(403);

      const restored = await request(app)
        .put(isoBase)
        .set('x-access-token', adminToken)
        .send({ guest_access: true, recursive: true });
      expect(restored.body.guest_access).toBe(true);
    });

    it('should be refused every ISO write', async () => {
      const created = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', guestToken)
        .send({ name: 'guest-iso' });
      expect(created.statusCode).toBe(403);
      expect(created.body.type).toBe('https://auth.startcloud.com/probs/forbidden');

      const updated = await request(app)
        .put(isoBase)
        .set('x-access-token', guestToken)
        .send({ description: 'hijack' });
      expect(updated.statusCode).toBe(403);

      const deleted = await request(app).delete(isoBase).set('x-access-token', guestToken);
      expect(deleted.statusCode).toBe(403);

      const bulk = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', guestToken)
        .send({ action: 'delete', names: [isoName] });
      expect(bulk.statusCode).toBe(403);

      const version = await request(app)
        .post(`${isoBase}/version`)
        .set('x-access-token', guestToken)
        .send({ version_number: '3.0.0' });
      expect(version.statusCode).toBe(403);

      const versionUpdated = await request(app)
        .put(versionBase)
        .set('x-access-token', guestToken)
        .send({ description: 'hijack' });
      expect(versionUpdated.statusCode).toBe(403);

      const versionDeleted = await request(app)
        .delete(versionBase)
        .set('x-access-token', guestToken);
      expect(versionDeleted.statusCode).toBe(403);

      const upload = await request(app)
        .post(`${guestFileBase}/upload`)
        .set('x-access-token', guestToken)
        .set('x-file-name', 'guest.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(guestContent);
      expect(upload.statusCode).toBe(403);

      const removed = await request(app)
        .delete(`${guestFileBase}/delete`)
        .set('x-access-token', guestToken);
      expect(removed.statusCode).toBe(403);
      expect(await db.iso.count({ where: { name: isoName, organizationId: org.id } })).toBe(1);
    });

    it('should download a file and watch the ISO', async () => {
      await request(app)
        .post(`${guestFileBase}/upload?published=true&guest_access=true`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'debian-13-guest64.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(guestContent)
        .expect(201);

      const info = await request(app)
        .get(`${guestFileBase}/info`)
        .set('x-access-token', guestToken);
      expect(info.statusCode).toBe(200);
      expect(info.body.download_count).toBeNull();

      const versions = await request(app)
        .get(`${isoBase}/version`)
        .set('x-access-token', guestToken);
      versions.body.forEach(entry =>
        entry.files.forEach(file => expect(file.download_count).toBeNull())
      );

      const link = await request(app)
        .post(`${guestFileBase}/get-download-link`)
        .set('x-access-token', guestToken);
      expect(link.statusCode).toBe(200);
      expect(link.body).toHaveProperty('download_url');

      const [, token] = link.body.download_url.split('token=');
      const byToken = await request(app).get(`${guestFileBase}/download?token=${token}`);
      expect(byToken.statusCode).toBe(200);

      const download = await request(app)
        .get(`${guestFileBase}/download`)
        .set('x-access-token', guestToken);
      expect(download.statusCode).toBe(200);

      const memberInfo = await request(app)
        .get(`${guestFileBase}/info`)
        .set('x-access-token', authToken);
      expect(memberInfo.body.download_count).toBe(2);

      const watched = await request(app).post(`${isoBase}/watch`).set('x-access-token', guestToken);
      expect(watched.statusCode).toBe(201);
      const unwatched = await request(app)
        .delete(`${isoBase}/watch`)
        .set('x-access-token', guestToken);
      expect(unwatched.statusCode).toBe(200);

      await db.iso.update(
        { guestAccess: false },
        { where: { name: isoName, organizationId: org.id } }
      );
      const hiddenInfo = await request(app)
        .get(`${guestFileBase}/info`)
        .set('x-access-token', guestToken);
      expect(hiddenInfo.statusCode).toBe(403);
      const hiddenLink = await request(app)
        .post(`${guestFileBase}/get-download-link`)
        .set('x-access-token', guestToken);
      expect(hiddenLink.statusCode).toBe(403);
      const hiddenDownload = await request(app)
        .get(`${guestFileBase}/download`)
        .set('x-access-token', guestToken);
      expect(hiddenDownload.statusCode).toBe(403);
      await db.iso.update(
        { guestAccess: true },
        { where: { name: isoName, organizationId: org.id } }
      );

      await request(app)
        .delete(`${guestFileBase}/delete`)
        .set('x-access-token', adminToken)
        .expect(200);
    });
  });

  describe('ISO files', () => {
    const checksum = sha256(fileContent);
    const storagePath = () => `${org.id}/${checksum}.iso`;
    const storedPath = () => join(getIsoStorageRoot(), String(org.id), `${checksum}.iso`);

    it('should upload a file for an architecture', async () => {
      const res = await request(app)
        .post(`${fileBase}/upload?published=true`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'debian-13-amd64.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(res.statusCode).toBe(201);
      expect(res.body.architecture).toBe('amd64');
      expect(res.body.file_name).toBe('debian-13-amd64.iso');
      expect(res.body.checksum).toBe(checksum);
      expect(res.body.checksum_type).toBe('SHA256');
      expect(res.body.published).toBe(true);
      expect(res.body.is_public).toBe(false);
      expect(res.body.guest_access).toBe(false);
      expect(Number(res.body.file_size)).toBe(fileContent.length);
      expect(fs.existsSync(storedPath())).toBe(true);
    });

    it('should refuse a file born wider than its version and be born closed without the words', async () => {
      const wider = await request(app)
        .post(`${versionBase}/architecture/ppc64/file/upload?is_public=true`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'debian-13-ppc64.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(wider.statusCode).toBe(422);
      expect(wider.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/is_public',
          rule: 'withinParent',
          params: { parent: 'guests' },
        }),
      ]);
      const closed = await request(app)
        .post(`${versionBase}/architecture/ppc64/file/upload`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'debian-13-ppc64.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(closed.statusCode).toBe(201);
      expect(closed.body.published).toBe(false);
      const hidden = await request(app)
        .get(`${versionBase}/architecture/ppc64/file/info`)
        .set('x-access-token', authToken);
      expect(hidden.statusCode).toBe(404);
      const asAdmin = await request(app)
        .get(`${versionBase}/architecture/ppc64/file/info`)
        .set('x-access-token', adminToken);
      expect(asAdmin.statusCode).toBe(200);
      const published = await request(app)
        .put(`${versionBase}/architecture/ppc64/file`)
        .set('x-access-token', adminToken)
        .send({ published: true });
      expect(published.statusCode).toBe(200);
      expect(published.body.published).toBe(true);
      const shown = await request(app)
        .get(`${versionBase}/architecture/ppc64/file/info`)
        .set('x-access-token', authToken);
      expect(shown.statusCode).toBe(200);
      await request(app)
        .delete(`${versionBase}/architecture/ppc64/file/delete`)
        .set('x-access-token', adminToken)
        .expect(200);
    });

    it('should replace the file record when uploading the same architecture again', async () => {
      const res = await request(app)
        .post(`${fileBase}/upload`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'debian-13-amd64-again.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(res.statusCode).toBe(201);
      expect(res.body.file_name).toBe('debian-13-amd64-again.iso');
      expect(res.body.published).toBe(true);
      const count = await db.isoFiles.count({ where: { architecture: 'amd64' } });
      expect(count).toBe(1);
    });

    it('should deduplicate identical content across architectures', async () => {
      const res = await request(app)
        .post(`${versionBase}/architecture/arm64/file/upload?published=true`)
        .set('x-access-token', adminToken)
        .set('x-file-name', 'debian-13-arm64.iso')
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(res.statusCode).toBe(201);
      expect(res.body.checksum).toBe(checksum);
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
        file_name: 'debian-13-amd64-again.iso',
        file_size: expect.anything(),
        checksum,
        checksum_type: 'SHA256',
        download_count: 0,
        created_at: expect.any(String),
        updated_at: expect.any(String),
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
      expect(res.body).toHaveProperty('download_url');
      const [, token] = res.body.download_url.split('token=');
      const decoded = jwt.verify(token, 'test-secret');
      expect(decoded.type).toBe('download');
      expect(decoded.organization).toBe(orgName);
      expect(decoded.iso).toBe(isoName);
      expect(decoded.version_number).toBe(versionNumber);
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
        { id: user.id, is_service_account: true, service_account_id: sa.id },
        'test-secret',
        { expiresIn: '1h', ...TEST_JWT_CLAIMS }
      );

      const res = await request(app)
        .post(`${fileBase}/get-download-link`)
        .set('x-access-token', saToken);
      expect(res.statusCode).toBe(200);
      const [, token] = res.body.download_url.split('token=');
      expect(jwt.verify(token, 'test-secret').is_service_account).toBe(true);

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
      expect(info.body.download_count).toBe(1);

      const iso = await request(app).get(isoBase).set('x-access-token', authToken);
      expect(iso.body.download_count).toBe(1);
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
          user_id: user.id,
          organization: orgName,
          iso: isoName,
          version_number: versionNumber,
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
          user_id: user.id,
          organization: orgName,
          iso: isoName,
          version_number: versionNumber,
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
      const iso = await db.iso.findOne({ where: { name: isoName, organizationId: org.id } });
      const version = await db.isoVersions.findOne({ where: { versionNumber, isoId: iso.id } });
      const closed = await request(app).get(`${fileBase}/download`);
      expect(closed.statusCode).toBe(403);
      await db.isoVersions.update({ isPublic: true }, { where: { id: version.id } });
      const stillClosed = await request(app).get(`${fileBase}/download`);
      expect(stillClosed.statusCode).toBe(403);
      await db.isoFiles.update(
        { isPublic: true },
        { where: { isoVersionId: version.id, architecture: 'amd64' } }
      );
      const res = await request(app).get(`${fileBase}/download`);
      expect(res.statusCode).toBe(200);
      await db.isoFiles.update(
        { isPublic: false },
        { where: { isoVersionId: version.id, architecture: 'amd64' } }
      );
      await db.isoVersions.update({ isPublic: false }, { where: { id: version.id } });
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
      await ghost.update({ storagePath: storagePath() });
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
        .send({ version_number: '1.0.0' })
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
      const filePath = join(getIsoStorageRoot(), String(org.id), `${sha256(content)}.iso`);
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
    it('should no longer exist, the bulk route taking its place', async () => {
      const otherOrg = await db.organization.create({
        name: `IsoRemoveAllOrg_${Date.now()}`,
        access_mode: 'private',
      });
      await db.iso.create({ name: 'remove-a', organizationId: otherOrg.id });

      const res = await request(app)
        .delete(`/api/organization/${otherOrg.name}/iso`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
      expect(await db.iso.count({ where: { organizationId: otherOrg.id } })).toBe(1);

      await db.iso.destroy({ where: { organizationId: otherOrg.id } });
      await otherOrg.destroy();
    });
  });

  describe('ISO Helpers Unit Tests', () => {
    it('should use configured storage path', async () => {
      const configPath = getConfigPath('app');
      const originalConfig = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(originalConfig);
      config.boxvault.iso_storage_directory = '/tmp/custom-iso';
      fs.writeFileSync(configPath, yaml.dump(config));
      await reloadConfig();

      try {
        expect(getIsoStorageRoot()).toBe('/tmp/custom-iso');
      } finally {
        fs.writeFileSync(configPath, originalConfig);
        await reloadConfig();
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
