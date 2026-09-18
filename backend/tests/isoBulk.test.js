import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getIsoStorageRoot } from '../app/controllers/iso/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const sha256 = content => createHash('sha256').update(content).digest('hex');

describe('ISO bulk API', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `BulkIsoOrg_${uniqueId}`;
  const isoName = 'bulk-iso';
  const isoBase = `/api/organization/${orgName}/iso/${isoName}`;
  const fileContent = Buffer.from(`iso-bulk-content-${uniqueId}`);
  let org;
  let admin;
  let member;
  let adminToken;
  let memberToken;

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const storedPath = content => join(getIsoStorageRoot(), String(org.id), `${sha256(content)}.iso`);

  const upload = (version, architecture, fileName, content) =>
    request(app)
      .post(`${isoBase}/version/${version}/architecture/${architecture}/file/upload`)
      .set('x-access-token', adminToken)
      .set('x-file-name', fileName)
      .set('Content-Type', 'application/octet-stream')
      .send(content);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });

    member = await db.user.create({
      username: `bulk-iso-member-${uniqueId}`,
      email: `bulk-iso-member-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await member.setRoles([userRole]);
    await db.UserOrg.create({ user_id: member.id, organization_id: org.id, role: 'member' });
    memberToken = signFor(member);

    admin = await db.user.create({
      username: `bulk-iso-admin-${uniqueId}`,
      email: `bulk-iso-admin-${uniqueId}@example.com`,
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

    await request(app)
      .post(`/api/organization/${orgName}/iso`)
      .set('x-access-token', adminToken)
      .send({ name: isoName })
      .expect(201);
    await request(app)
      .post(`${isoBase}/version`)
      .set('x-access-token', adminToken)
      .send({ version_number: '1.0.0' })
      .expect(201);
    await request(app)
      .post(`${isoBase}/version`)
      .set('x-access-token', adminToken)
      .send({ version_number: '1.1.0' })
      .expect(201);
  });

  afterAll(async () => {
    await db.iso.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({ where: { id: [admin.id, member.id] } });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST .../iso/:name/version/:versionNumber/architecture/bulk', () => {
    it('should delete the named architectures and keep a shared file until its last record', async () => {
      await upload('1.0.0', 'amd64', 'bulk-amd64.iso', fileContent).expect(201);
      await upload('1.0.0', 'arm64', 'bulk-arm64.iso', fileContent).expect(201);
      expect(fs.existsSync(storedPath(fileContent))).toBe(true);

      const asMember = await request(app)
        .post(`${isoBase}/version/1.0.0/architecture/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'delete', names: ['arm64'] });
      expect(asMember.statusCode).toBe(403);

      const first = await request(app)
        .post(`${isoBase}/version/1.0.0/architecture/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'delete', names: ['arm64', 'riscv64'] });
      expect(first.statusCode).toBe(200);
      expect(first.body).toEqual({
        processed: 1,
        skipped: 1,
        errors: [{ name: 'riscv64', code: 'not_found' }],
      });
      expect(fs.existsSync(storedPath(fileContent))).toBe(true);

      const second = await request(app)
        .post(`${isoBase}/version/1.0.0/architecture/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'delete', names: ['amd64'] });
      expect(second.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect(fs.existsSync(storedPath(fileContent))).toBe(false);

      const noVersion = await request(app)
        .post(`${isoBase}/version/9.9.9/architecture/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'delete', names: ['amd64'] });
      expect(noVersion.statusCode).toBe(404);
    });
  });

  describe('POST .../iso/:name/version/bulk', () => {
    it('should deprecate with a reason and delete the named versions', async () => {
      const noReason = await request(app)
        .post(`${isoBase}/version/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'deprecate', names: ['1.0.0'] });
      expect(noReason.statusCode).toBe(422);
      expect(noReason.body.errors).toEqual([
        expect.objectContaining({ pointer: '/deprecation_reason', rule: 'required' }),
      ]);

      const deprecated = await request(app)
        .post(`${isoBase}/version/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'deprecate', names: ['1.0.0', '9.9.9'], deprecation_reason: 'Old' });
      expect(deprecated.body).toEqual({
        processed: 1,
        skipped: 1,
        errors: [{ name: '9.9.9', code: 'not_found' }],
      });
      const iso = await db.iso.findOne({ where: { name: isoName, organizationId: org.id } });
      const row = await db.isoVersions.findOne({
        where: { versionNumber: '1.0.0', isoId: iso.id },
      });
      expect(row.deprecated).toBe(true);
      expect(row.deprecationReason).toBe('Old');

      const asMember = await request(app)
        .post(`${isoBase}/version/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'delete', names: ['1.1.0'] });
      expect(asMember.statusCode).toBe(403);

      await upload('1.1.0', 'amd64', 'bulk-11-amd64.iso', Buffer.from(`v11-${uniqueId}`)).expect(
        201
      );
      const deleted = await request(app)
        .post(`${isoBase}/version/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'delete', names: ['1.1.0'] });
      expect(deleted.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect(await db.isoVersions.count({ where: { isoId: iso.id } })).toBe(1);
      expect(fs.existsSync(storedPath(Buffer.from(`v11-${uniqueId}`)))).toBe(false);
    });
  });

  describe('POST /api/organization/:organization/iso/bulk', () => {
    it('should flip and delete the named ISOs for an organization admin', async () => {
      const asMember = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'make_public', names: [isoName] });
      expect(asMember.statusCode).toBe(403);

      await db.iso.update(
        { published: false },
        { where: { name: isoName, organizationId: org.id } }
      );
      const flipped = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'publish', names: [isoName, 'no-such-iso'] });
      expect(flipped.statusCode).toBe(200);
      expect(flipped.body).toEqual({
        processed: 1,
        skipped: 1,
        errors: [{ name: 'no-such-iso', code: 'not_found' }],
      });
      const iso = await db.iso.findOne({ where: { name: isoName, organizationId: org.id } });
      expect(iso.published).toBe(true);
      expect(iso.guestAccess).toBe(false);

      const guestsRefused = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'allow_guests', names: [isoName] });
      expect(guestsRefused.statusCode).toBe(403);

      const allowed = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'allow_guests', names: [isoName, 'no-such-iso'] });
      expect(allowed.body).toEqual({
        processed: 1,
        skipped: 1,
        errors: [{ name: 'no-such-iso', code: 'not_found' }],
      });
      await iso.reload();
      expect(iso.guestAccess).toBe(true);

      const denied = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'deny_guests', names: [isoName] });
      expect(denied.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      await iso.reload();
      expect(iso.guestAccess).toBe(false);

      const content = Buffer.from(`delete-iso-${uniqueId}`);
      await upload('1.0.0', 'amd64', 'delete-iso.iso', content).expect(201);
      expect(fs.existsSync(storedPath(content))).toBe(true);

      const deleted = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'delete', names: [isoName] });
      expect(deleted.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect(await db.iso.count({ where: { name: isoName, organizationId: org.id } })).toBe(0);
      expect(fs.existsSync(storedPath(content))).toBe(false);
    });

    it('should answer a thrown row as internal', async () => {
      jest.spyOn(db.iso, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'delete', names: ['any'] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        processed: 0,
        skipped: 1,
        errors: [{ name: 'any', code: 'internal' }],
      });
    });
  });
});
