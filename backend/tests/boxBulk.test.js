import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureBoxPath } from '../app/utils/paths.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('Box bulk API', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `BulkBoxOrg_${uniqueId}`;
  let org;
  let owner;
  let member;
  let guest;
  let outsider;
  let ownerToken;
  let memberToken;
  let guestToken;
  let outsiderToken;

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const createUser = async (label, orgRole) => {
    const account = await db.user.create({
      username: `${label}-${uniqueId}`,
      email: `${label}-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    await account.setRoles([role]);
    if (orgRole) {
      await db.UserOrg.create({ user_id: account.id, organization_id: org.id, role: orgRole });
    }
    return account;
  };

  const createBox = (name, userId, extra = {}) =>
    db.box.create({ name, organizationId: org.id, userId, ...extra });

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await createUser('bulk-owner', 'owner');
    member = await createUser('bulk-member', 'member');
    guest = await createUser('bulk-guest', 'guest');
    outsider = await createUser('bulk-outsider', null);
    ownerToken = signFor(owner);
    memberToken = signFor(member);
    guestToken = signFor(guest);
    outsiderToken = signFor(outsider);
  });

  afterAll(async () => {
    await db.box.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({ where: { id: [owner.id, member.id, guest.id, outsider.id] } });
    fs.rmSync(getSecureBoxPath(orgName), { recursive: true, force: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/organization/:organization/box/bulk', () => {
    it('should check every row against the single delete permission', async () => {
      await createBox('owner-box', owner.id);
      await createBox('member-box', member.id);
      fs.mkdirSync(getSecureBoxPath(orgName, 'member-box'), { recursive: true });

      const res = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'delete', names: ['owner-box', 'member-box', 'missing-box'] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        processed: 1,
        skipped: 2,
        errors: [
          { name: 'owner-box', code: 'forbidden' },
          { name: 'missing-box', code: 'not_found' },
        ],
      });
      const memberLeft = await db.box.count({
        where: { name: 'member-box', organizationId: org.id },
      });
      expect(memberLeft).toBe(0);
      expect(fs.existsSync(getSecureBoxPath(orgName, 'member-box'))).toBe(false);
      const ownerLeft = await db.box.count({
        where: { name: 'owner-box', organizationId: org.id },
      });
      expect(ownerLeft).toBe(1);

      const asOwner = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: ['owner-box'] });
      expect(asOwner.body).toEqual({ processed: 1, skipped: 0, errors: [] });
    });

    it('should flip visibility and publication on every named box', async () => {
      await createBox('flip-a', owner.id, { isPublic: false, published: false });
      await createBox('flip-b', member.id, { isPublic: false, published: false });

      const madePublic = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'make_public', names: ['flip-a', 'flip-b'] });
      expect(madePublic.body).toEqual({ processed: 2, skipped: 0, errors: [] });
      const published = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'publish', names: ['flip-a', 'flip-b'] });
      expect(published.body.processed).toBe(2);
      const rows = await db.box.findAll({ where: { name: ['flip-a', 'flip-b'] } });
      rows.forEach(row => {
        expect(row.isPublic).toBe(true);
        expect(row.published).toBe(true);
      });

      await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'make_private', names: ['flip-a'] });
      await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'unpublish', names: ['flip-b'] });
      const flipA = await db.box.findOne({ where: { name: 'flip-a', organizationId: org.id } });
      const flipB = await db.box.findOne({ where: { name: 'flip-b', organizationId: org.id } });
      expect(flipA.isPublic).toBe(false);
      expect(flipB.published).toBe(false);
    });

    it('should open and close the named boxes to guests', async () => {
      const allowed = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'allow_guests', names: ['flip-a', 'flip-b', 'missing-box'] });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.body).toEqual({
        processed: 2,
        skipped: 1,
        errors: [{ name: 'missing-box', code: 'not_found' }],
      });
      const opened = await db.box.findAll({ where: { name: ['flip-a', 'flip-b'] } });
      opened.forEach(row => expect(row.guestAccess).toBe(true));

      const asMember = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'deny_guests', names: ['flip-a', 'flip-b'] });
      expect(asMember.body).toEqual({
        processed: 1,
        skipped: 1,
        errors: [{ name: 'flip-a', code: 'forbidden' }],
      });
      const flipA = await db.box.findOne({ where: { name: 'flip-a', organizationId: org.id } });
      const flipB = await db.box.findOne({ where: { name: 'flip-b', organizationId: org.id } });
      expect(flipA.guestAccess).toBe(true);
      expect(flipB.guestAccess).toBe(false);

      const denied = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'deny_guests', names: ['flip-a'] });
      expect(denied.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      await flipA.reload();
      expect(flipA.guestAccess).toBe(false);
    });

    it('should refuse a body outside the bulkItem form', async () => {
      const badAction = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'deprecate', names: ['flip-a'] });
      expect(badAction.statusCode).toBe(422);
      expect(badAction.body.errors).toEqual([
        expect.objectContaining({ pointer: '/action', rule: 'enum' }),
      ]);

      const noNames = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: [] });
      expect(noNames.statusCode).toBe(422);
      expect(noNames.body.errors).toEqual([
        expect.objectContaining({ pointer: '/names', rule: 'minItems' }),
      ]);

      const noAction = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ names: ['flip-a'] });
      expect(noAction.statusCode).toBe(422);
      expect(noAction.body.errors).toEqual([
        expect.objectContaining({ pointer: '/action', rule: 'required' }),
      ]);
    });

    it('should refuse a guest before any row', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', guestToken)
        .send({ action: 'delete', names: ['flip-a'] });
      expect(res.statusCode).toBe(403);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/forbidden');
      expect(await db.box.count({ where: { name: 'flip-a', organizationId: org.id } })).toBe(1);
    });

    it('should refuse a non-member and an unknown organization', async () => {
      const asOutsider = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', outsiderToken)
        .send({ action: 'delete', names: ['flip-a'] });
      expect(asOutsider.statusCode).toBe(403);
      const noOrg = await request(app)
        .post(`/api/organization/NoOrg-${uniqueId}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: ['flip-a'] });
      expect(noOrg.statusCode).toBe(404);
    });

    it('should answer a thrown row as internal', async () => {
      jest.spyOn(db.box, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: ['flip-a'] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        processed: 0,
        skipped: 1,
        errors: [{ name: 'flip-a', code: 'internal' }],
      });
    });
  });

  describe('POST .../box/:boxId/version/bulk', () => {
    const boxName = 'version-bulk-box';
    let box;

    beforeAll(async () => {
      box = await createBox(boxName, owner.id);
      await db.versions.create({ versionNumber: '1.0.0', boxId: box.id });
      await db.versions.create({ versionNumber: '1.1.0', boxId: box.id });
      await db.versions.create({ versionNumber: '2.0.0', boxId: box.id });
    });

    it('should refuse a plain member before any row', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/box/${boxName}/version/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'delete', names: ['1.0.0'] });
      expect(res.statusCode).toBe(403);
      expect(await db.versions.count({ where: { boxId: box.id } })).toBe(3);
    });

    it('should refuse a guest before any row', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/box/${boxName}/version/bulk`)
        .set('x-access-token', guestToken)
        .send({ action: 'delete', names: ['1.0.0'] });
      expect(res.statusCode).toBe(403);
      expect(await db.versions.count({ where: { boxId: box.id } })).toBe(3);
    });

    it('should require a deprecation reason and deprecate the named versions', async () => {
      const noReason = await request(app)
        .post(`/api/organization/${orgName}/box/${boxName}/version/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'deprecate', names: ['1.0.0'] });
      expect(noReason.statusCode).toBe(422);
      expect(noReason.body.errors).toEqual([
        expect.objectContaining({ pointer: '/deprecation_reason', rule: 'required' }),
      ]);

      const res = await request(app)
        .post(`/api/organization/${orgName}/box/${boxName}/version/bulk`)
        .set('x-access-token', ownerToken)
        .send({
          action: 'deprecate',
          names: ['1.0.0', '1.1.0', '9.9.9'],
          deprecation_reason: 'Superseded',
        });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        processed: 2,
        skipped: 1,
        errors: [{ name: '9.9.9', code: 'not_found' }],
      });
      const deprecated = await db.versions.findAll({ where: { boxId: box.id, deprecated: true } });
      expect(deprecated.map(row => row.versionNumber).sort()).toEqual(['1.0.0', '1.1.0']);
      deprecated.forEach(row => expect(row.deprecationReason).toBe('Superseded'));
    });

    it('should delete the named versions', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/box/${boxName}/version/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: ['2.0.0', '1.0.0'] });
      expect(res.body).toEqual({ processed: 2, skipped: 0, errors: [] });
      expect(await db.versions.count({ where: { boxId: box.id } })).toBe(1);

      const unknownBox = await request(app)
        .post(`/api/organization/${orgName}/box/no-such-box/version/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: ['1.1.0'] });
      expect(unknownBox.statusCode).toBe(404);
    });
  });

  describe('POST .../provider/bulk and .../architecture/bulk', () => {
    const boxName = 'leaf-bulk-box';
    const versionBase = `/api/organization/${orgName}/box/${boxName}/version/1.0.0`;
    let version;

    beforeAll(async () => {
      const box = await createBox(boxName, owner.id);
      version = await db.versions.create({ versionNumber: '1.0.0', boxId: box.id });
    });

    it('should delete the named architectures of a provider', async () => {
      const provider = await db.providers.create({ name: 'virtualbox', versionId: version.id });
      await db.architectures.create({ name: 'amd64', providerId: provider.id });
      await db.architectures.create({ name: 'arm64', providerId: provider.id });

      const asMember = await request(app)
        .post(`${versionBase}/provider/virtualbox/architecture/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'delete', names: ['amd64'] });
      expect(asMember.statusCode).toBe(403);

      const res = await request(app)
        .post(`${versionBase}/provider/virtualbox/architecture/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: ['amd64', 'riscv64'] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        processed: 1,
        skipped: 1,
        errors: [{ name: 'riscv64', code: 'not_found' }],
      });
      const left = await db.architectures.findAll({ where: { providerId: provider.id } });
      expect(left.map(row => row.name)).toEqual(['arm64']);
    });

    it('should delete the named providers with their architectures', async () => {
      const other = await db.providers.create({ name: 'libvirt', versionId: version.id });
      await db.architectures.create({ name: 'amd64', providerId: other.id });

      const badAction = await request(app)
        .post(`${versionBase}/provider/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'make_public', names: ['libvirt'] });
      expect(badAction.statusCode).toBe(422);
      expect(badAction.body.errors).toEqual([
        expect.objectContaining({ pointer: '/action', rule: 'enum' }),
      ]);

      const res = await request(app)
        .post(`${versionBase}/provider/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: ['libvirt', 'virtualbox', 'vmware'] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        processed: 2,
        skipped: 1,
        errors: [{ name: 'vmware', code: 'not_found' }],
      });
      expect(await db.providers.count({ where: { versionId: version.id } })).toBe(0);
      expect(await db.architectures.count({ where: { providerId: other.id } })).toBe(0);

      const asMember = await request(app)
        .post(`${versionBase}/provider/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'delete', names: ['libvirt'] });
      expect(asMember.statusCode).toBe(403);
    });
  });
});
