import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureDownloadPath } from '../app/controllers/download/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('Download bulk API', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `BulkDownloadOrg_${uniqueId}`;
  const productName = 'domino-server';
  const productBase = `/api/organization/${orgName}/download/${productName}`;
  const fileContent = Buffer.from(`bulk-installer-${uniqueId}`);
  let org;
  let owner;
  let member;
  let other;
  let ownerToken;
  let memberToken;
  let otherToken;

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
    await db.UserOrg.create({ user_id: account.id, organization_id: org.id, role: orgRole });
    return account;
  };

  const filePath = (release, patch, fileName) =>
    getSecureDownloadPath(orgName, productName, release, patch, fileName);

  const upload = (release, patch, key, fileName, content) =>
    request(app)
      .post(`${productBase}/release/${release}/patch/${patch}/file/${key}/upload`)
      .set('x-access-token', ownerToken)
      .set('x-file-name', fileName)
      .set('Content-Type', 'application/octet-stream')
      .send(content);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await createUser('dlb-owner', 'owner');
    member = await createUser('dlb-member', 'member');
    other = await createUser('dlb-other', 'member');
    ownerToken = signFor(owner);
    memberToken = signFor(member);
    otherToken = signFor(other);
    await request(app)
      .post(`/api/organization/${orgName}/download`)
      .set('x-access-token', ownerToken)
      .send({ name: productName, published: true })
      .expect(201);
  });

  afterAll(async () => {
    await db.download.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({ where: { id: [owner.id, member.id, other.id] } });
    fs.rmSync(getSecureDownloadPath(orgName), { recursive: true, force: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST .../patch/:patch/file/bulk', () => {
    beforeAll(async () => {
      await upload('14.5.1', 'release', 'linux-x64', 'Domino_Linux.tar', fileContent).expect(200);
      await upload('14.5.1', 'release', 'windows-x64', 'Domino_Win.exe', fileContent).expect(200);
      await upload('14.5.1', 'release', 'notes', 'Notes.pdf', Buffer.from(`n-${uniqueId}`)).expect(
        200
      );
    });

    it('should delete rows by key and by file name and promote a link', async () => {
      const asMember = await request(app)
        .post(`${productBase}/release/14.5.1/patch/release/file/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'delete', names: ['linux-x64'] });
      expect(asMember.statusCode).toBe(403);

      const res = await request(app)
        .post(`${productBase}/release/14.5.1/patch/release/file/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: ['linux-x64', 'Notes.pdf', 'no-such-key'] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        processed: 2,
        skipped: 1,
        errors: [{ name: 'no-such-key', code: 'not_found' }],
      });
      expect(fs.existsSync(filePath('14.5.1', 'release', 'Domino_Linux.tar'))).toBe(false);
      expect(fs.existsSync(filePath('14.5.1', 'release', 'Notes.pdf'))).toBe(false);

      const heir = await db.downloadFiles.findOne({ where: { fileName: 'Domino_Win.exe' } });
      expect(heir.original).toBe(true);
      expect(heir.linksTo).toBeNull();
      const heirPath = filePath('14.5.1', 'release', 'Domino_Win.exe');
      expect(fs.lstatSync(heirPath).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(heirPath)).toEqual(fileContent);
    });
  });

  describe('POST .../release/:versionNumber/patch/bulk', () => {
    it('should delete the named patches with their files', async () => {
      await upload('14.5.1', 'FP1', 'linux-x64', 'Domino_FP1.tar', fileContent).expect(200);
      await upload('14.5.1', 'IF1', 'linux-x64', 'Domino_IF1.tar', fileContent).expect(200);

      const asMember = await request(app)
        .post(`${productBase}/release/14.5.1/patch/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'delete', names: ['FP1'] });
      expect(asMember.statusCode).toBe(403);

      const res = await request(app)
        .post(`${productBase}/release/14.5.1/patch/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: ['FP1', 'IF1', 'FP9'] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        processed: 2,
        skipped: 1,
        errors: [{ name: 'FP9', code: 'not_found' }],
      });
      expect(fs.existsSync(getSecureDownloadPath(orgName, productName, '14.5.1', 'FP1'))).toBe(
        false
      );
      expect(fs.existsSync(getSecureDownloadPath(orgName, productName, '14.5.1', 'IF1'))).toBe(
        false
      );
      const kept = filePath('14.5.1', 'release', 'Domino_Win.exe');
      expect(fs.lstatSync(kept).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(kept)).toEqual(fileContent);

      const badAction = await request(app)
        .post(`${productBase}/release/14.5.1/patch/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'deprecate', names: ['release'], deprecation_reason: 'x' });
      expect(badAction.statusCode).toBe(422);
      expect(badAction.body.errors).toEqual([
        expect.objectContaining({ pointer: '/action', rule: 'enum' }),
      ]);
    });
  });

  describe('POST .../download/:name/release/bulk', () => {
    it('should deprecate with a reason and delete releases, promoting shared bytes', async () => {
      await upload('14.5', 'release', 'linux-x64', 'Domino_145.tar', fileContent).expect(200);

      const noReason = await request(app)
        .post(`${productBase}/release/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'deprecate', names: ['14.5'] });
      expect(noReason.statusCode).toBe(422);
      expect(noReason.body.errors).toEqual([
        expect.objectContaining({ pointer: '/deprecation_reason', rule: 'required' }),
      ]);

      const deprecated = await request(app)
        .post(`${productBase}/release/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'deprecate', names: ['14.5', '9.9.9'], deprecation_reason: 'Superseded' });
      expect(deprecated.body).toEqual({
        processed: 1,
        skipped: 1,
        errors: [{ name: '9.9.9', code: 'not_found' }],
      });
      const product = await db.download.findOne({
        where: { name: productName, organizationId: org.id },
      });
      const release = await db.downloadReleases.findOne({
        where: { versionNumber: '14.5', downloadId: product.id },
      });
      expect(release.deprecated).toBe(true);
      expect(release.deprecationReason).toBe('Superseded');

      const asMember = await request(app)
        .post(`${productBase}/release/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'delete', names: ['14.5.1'] });
      expect(asMember.statusCode).toBe(403);

      const deleted = await request(app)
        .post(`${productBase}/release/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: ['14.5.1'] });
      expect(deleted.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect(fs.existsSync(getSecureDownloadPath(orgName, productName, '14.5.1'))).toBe(false);

      const heir = await db.downloadFiles.findOne({ where: { fileName: 'Domino_145.tar' } });
      expect(heir.original).toBe(true);
      const heirPath = filePath('14.5', 'release', 'Domino_145.tar');
      expect(fs.lstatSync(heirPath).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(heirPath)).toEqual(fileContent);
    });
  });

  describe('POST /api/organization/:organization/download/bulk', () => {
    it('should check every row against the single route permission and flip the columns', async () => {
      await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken)
        .send({ name: 'member-product' })
        .expect(201);

      const asOther = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', otherToken)
        .send({ action: 'publish', names: [productName, 'member-product', 'missing'] });
      expect(asOther.statusCode).toBe(200);
      expect(asOther.body).toEqual({
        processed: 0,
        skipped: 3,
        errors: [
          { name: productName, code: 'forbidden' },
          { name: 'member-product', code: 'forbidden' },
          { name: 'missing', code: 'not_found' },
        ],
      });

      const asMember = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'make_public', names: [productName, 'member-product'] });
      expect(asMember.body).toEqual({
        processed: 1,
        skipped: 1,
        errors: [{ name: productName, code: 'forbidden' }],
      });

      const asOwner = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'publish', names: [productName, 'member-product'] });
      expect(asOwner.body).toEqual({ processed: 2, skipped: 0, errors: [] });
      const memberProduct = await db.download.findOne({
        where: { name: 'member-product', organizationId: org.id },
      });
      expect(memberProduct.isPublic).toBe(true);
      expect(memberProduct.published).toBe(true);
      expect(memberProduct.guestAccess).toBe(false);
    });

    it('should open and close the named products to guests by the single route permission', async () => {
      const asOther = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', otherToken)
        .send({ action: 'allow_guests', names: [productName, 'member-product'] });
      expect(asOther.body).toEqual({
        processed: 0,
        skipped: 2,
        errors: [
          { name: productName, code: 'forbidden' },
          { name: 'member-product', code: 'forbidden' },
        ],
      });

      const asOwner = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'allow_guests', names: [productName, 'member-product', 'missing'] });
      expect(asOwner.statusCode).toBe(200);
      expect(asOwner.body).toEqual({
        processed: 2,
        skipped: 1,
        errors: [{ name: 'missing', code: 'not_found' }],
      });
      const opened = await db.download.findAll({ where: { organizationId: org.id } });
      opened.forEach(row => expect(row.guestAccess).toBe(true));

      const asMember = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'deny_guests', names: [productName, 'member-product'] });
      expect(asMember.body).toEqual({
        processed: 1,
        skipped: 1,
        errors: [{ name: productName, code: 'forbidden' }],
      });
      const memberProduct = await db.download.findOne({
        where: { name: 'member-product', organizationId: org.id },
      });
      expect(memberProduct.guestAccess).toBe(false);
      const product = await db.download.findOne({
        where: { name: productName, organizationId: org.id },
      });
      expect(product.guestAccess).toBe(true);
    });

    it('should delete the named products with their files and directories', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'delete', names: [productName, 'member-product'] });
      expect(res.body).toEqual({ processed: 2, skipped: 0, errors: [] });
      expect(await db.download.count({ where: { organizationId: org.id } })).toBe(0);
      expect(fs.existsSync(getSecureDownloadPath(orgName, productName))).toBe(false);
      expect(fs.existsSync(filePath('14.5', 'release', 'Domino_145.tar'))).toBe(false);
    });

    it('should answer a thrown row as internal', async () => {
      jest.spyOn(db.download, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', ownerToken)
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
