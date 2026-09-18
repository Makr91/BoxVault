import request from 'supertest';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import app from '../server.js';
import db from '../app/models/index.js';
import { getPendingPath, getSecureDownloadPath } from '../app/controllers/download/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

const sha256 = content => createHash('sha256').update(content).digest('hex');

describe('Download pending upload API', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `PendingOrg_${uniqueId}`;
  const otherOrgName = `PendingOther_${uniqueId}`;
  const pendingBase = `/api/organization/${orgName}/download/pending`;
  const nsfContent = Buffer.from(`test-nsf-${uniqueId}-with-two-chunks`);
  let org;
  let otherOrg;
  let owner;
  let admin;
  let member;
  let other;
  let guest;
  let stranger;
  let adminToken;
  let memberToken;
  let otherToken;
  let guestToken;
  let strangerToken;

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const createUser = async (label, organization, orgRole) => {
    const account = await db.user.create({
      username: `${label}-${uniqueId}`,
      email: `${label}-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    await account.setRoles([role]);
    if (orgRole) {
      await db.UserOrg.create({
        user_id: account.id,
        organization_id: organization.id,
        role: orgRole,
      });
    }
    return account;
  };

  const drop = (token, content, fileName, headers = {}) => {
    const req = request(app)
      .post(`${pendingBase}/upload`)
      .set('x-access-token', token)
      .set('Content-Type', 'application/octet-stream');
    if (fileName) {
      req.set('x-file-name', fileName);
    }
    Object.entries(headers).forEach(([header, value]) => req.set(header, value));
    return req.send(content);
  };

  const dropWhole = async (token, content, fileName) => {
    const res = await drop(token, content, fileName);
    expect(res.statusCode).toBe(200);
    expect(res.body.details.isComplete).toBe(true);
    return res.body.details;
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    otherOrg = await db.organization.create({ name: otherOrgName, access_mode: 'private' });
    owner = await createUser('pending-owner', org, 'owner');
    admin = await createUser('pending-admin', org, 'admin');
    member = await createUser('pending-member', org, 'member');
    other = await createUser('pending-other', org, 'member');
    guest = await createUser('pending-guest', org, 'guest');
    stranger = await createUser('pending-stranger', otherOrg, 'member');
    adminToken = signFor(admin);
    memberToken = signFor(member);
    otherToken = signFor(other);
    guestToken = signFor(guest);
    strangerToken = signFor(stranger);
  });

  afterAll(async () => {
    await db.downloadPendingUploads.destroy({ where: { organizationId: [org.id, otherOrg.id] } });
    await db.download.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await otherOrg.destroy();
    await db.user.destroy({
      where: { id: [owner.id, admin.id, member.id, other.id, guest.id, stranger.id] },
    });
    fs.rmSync(getSecureDownloadPath(orgName), { recursive: true, force: true });
    fs.rmSync(getSecureDownloadPath(otherOrgName), { recursive: true, force: true });
  });

  describe('the two steps', () => {
    let pendingId;

    it('should take test.nsf in chunks, answer the id and an empty release guess, and answer the poll', async () => {
      const half = Math.ceil(nsfContent.length / 2);
      const first = await drop(memberToken, nsfContent.subarray(0, half), 'test.nsf', {
        'x-chunk-index': '0',
        'x-total-chunks': '2',
      });
      expect(first.statusCode).toBe(200);
      expect(first.body.details.isComplete).toBe(false);
      expect(first.body.details.status).toBe('uploading');
      expect(first.body.details.chunksReceived).toBe(1);
      expect(first.body.details.file_name).toBe('test.nsf');
      expect(first.body.details.size).toBe(0);
      expect(first.body.details.guess.release).toBe('');
      pendingId = first.body.details.id;
      expect(typeof pendingId).toBe('string');
      expect(pendingId.length).toBe(32);

      const second = await drop(memberToken, nsfContent.subarray(half), 'test.nsf', {
        'x-chunk-index': '1',
        'x-total-chunks': '2',
      });
      expect(second.statusCode).toBe(200);
      expect(second.body.details.isComplete).toBe(true);
      expect(second.body.details.status).toBe('complete');
      expect(second.body.details.fileSize).toBe(nsfContent.length);
      expect(second.body.details).toMatchObject({
        id: pendingId,
        file_name: 'test.nsf',
        size: nsfContent.length,
        guess: {
          product: 'test',
          release: '',
          patch: 'release',
          key: 'test.nsf',
          kind: 'other',
          platform: 'any',
          architecture: 'any',
          language: 'any',
        },
      });
      expect(fs.readFileSync(getPendingPath(orgName, pendingId, 'test.nsf'))).toEqual(nsfContent);

      const info = await request(app)
        .get(`${pendingBase}/${pendingId}/info`)
        .set('x-access-token', memberToken);
      expect(info.statusCode).toBe(200);
      expect(info.body.id).toBe(pendingId);
      expect(info.body.file_name).toBe('test.nsf');
      expect(info.body.fileSize).toBe(nsfContent.length);
      expect(info.body.checksum).toBe(sha256(nsfContent));
      expect(info.body.checksumType).toBe('SHA256');
      expect(info.body.guess.release).toBe('');
    });

    it('should refuse a blank release with the /release pointer and keep the upload', async () => {
      const res = await request(app)
        .post(`${pendingBase}/${pendingId}/place`)
        .set('x-access-token', memberToken)
        .send({ product: 'test-db', release: '', patch: 'release' });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ pointer: '/release' })])
      );
      expect(res.body.errors.some(error => error.pointer === '/version_number')).toBe(false);

      const blankProduct = await request(app)
        .post(`${pendingBase}/${pendingId}/place`)
        .set('x-access-token', memberToken)
        .send({ product: '', release: '1.0' });
      expect(blankProduct.statusCode).toBe(422);
      expect(blankProduct.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ pointer: '/product' })])
      );
      expect(await db.downloadPendingUploads.count({ where: { id: pendingId } })).toBe(1);
      expect(fs.existsSync(getPendingPath(orgName, pendingId, 'test.nsf'))).toBe(true);
      expect(await db.download.count({ where: { name: 'test-db', organizationId: org.id } })).toBe(
        0
      );
    });

    it('should place the upload, create the levels and answer the address', async () => {
      const res = await request(app)
        .post(`${pendingBase}/${pendingId}/place`)
        .set('x-access-token', memberToken)
        .send({
          product: 'test-db',
          release: '1.0',
          patch: 'release',
          kind: 'template',
          variant: '',
          checksum_type: 'NULL',
          checksum: '',
        });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        product: 'test-db',
        release: '1.0',
        patch: 'release',
        key: 'test.nsf',
      });

      const product = await db.download.findOne({
        where: { name: 'test-db', organizationId: org.id },
      });
      expect(product.userId).toBe(member.id);
      expect(product.published).toBe(false);
      expect(product.isPublic).toBe(false);
      expect(product.guestAccess).toBe(false);
      const release = await db.downloadReleases.findOne({
        where: { versionNumber: '1.0', downloadId: product.id },
      });
      const patch = await db.downloadPatches.findOne({
        where: { name: 'release', downloadReleaseId: release.id },
      });
      const file = await db.downloadFiles.findOne({
        where: { key: 'test.nsf', downloadPatchId: patch.id },
      });
      expect(file.fileName).toBe('test.nsf');
      expect(file.kind).toBe('template');
      expect(file.platform).toBe('any');
      expect(Number(file.fileSize)).toBe(nsfContent.length);
      expect(file.checksum).toBe(sha256(nsfContent));
      expect(file.checksumType).toBe('SHA256');
      expect(file.original).toBe(true);
      expect(file.storagePath).toBe(`${orgName}/downloads/test-db/1.0/release/test.nsf`);
      const finalPath = getSecureDownloadPath(orgName, 'test-db', '1.0', 'release', 'test.nsf');
      expect(fs.readFileSync(finalPath)).toEqual(nsfContent);

      expect(await db.downloadPendingUploads.count({ where: { id: pendingId } })).toBe(0);
      expect(fs.existsSync(getPendingPath(orgName, pendingId))).toBe(false);
      const gone = await request(app)
        .get(`${pendingBase}/${pendingId}/info`)
        .set('x-access-token', memberToken);
      expect(gone.statusCode).toBe(404);
    });

    it('should guess the words a richer file name gives', async () => {
      const details = await dropWhole(
        memberToken,
        Buffer.from(`domino-${uniqueId}`),
        'Domino_14.5.1_Linux_English.tar'
      );
      expect(details.guess).toEqual({
        product: 'domino',
        release: '14.5.1',
        patch: 'release',
        key: 'Domino_14.5.1_Linux_English.tar',
        kind: 'other',
        platform: 'linux',
        architecture: 'any',
        language: 'en',
      });
      await request(app)
        .delete(`${pendingBase}/${details.id}`)
        .set('x-access-token', memberToken)
        .expect(204);
    });

    it('should refuse a missing file name and a path traversal', async () => {
      const noName = await drop(memberToken, nsfContent);
      expect(noName.statusCode).toBe(400);
      const traversal = await drop(memberToken, nsfContent, '../../etc/passwd');
      expect(traversal.statusCode).toBe(400);
    });
  });

  describe('permissions', () => {
    it('should refuse a guest with no row created', async () => {
      const before = await db.downloadPendingUploads.count({ where: { organizationId: org.id } });
      const res = await drop(guestToken, nsfContent, 'guest.nsf');
      expect(res.statusCode).toBe(403);
      expect(await db.downloadPendingUploads.count({ where: { organizationId: org.id } })).toBe(
        before
      );
    });

    it('should refuse another member placing or deleting and let an org admin delete', async () => {
      const details = await dropWhole(memberToken, Buffer.from(`mine-${uniqueId}`), 'mine.nsf');

      const placed = await request(app)
        .post(`${pendingBase}/${details.id}/place`)
        .set('x-access-token', otherToken)
        .send({ product: 'mine', release: '1.0' });
      expect(placed.statusCode).toBe(403);
      const removed = await request(app)
        .delete(`${pendingBase}/${details.id}`)
        .set('x-access-token', otherToken);
      expect(removed.statusCode).toBe(403);
      expect(fs.existsSync(getPendingPath(orgName, details.id, 'mine.nsf'))).toBe(true);

      const asAdmin = await request(app)
        .delete(`${pendingBase}/${details.id}`)
        .set('x-access-token', adminToken);
      expect(asAdmin.statusCode).toBe(204);
      expect(fs.existsSync(getPendingPath(orgName, details.id))).toBe(false);
      expect(await db.downloadPendingUploads.count({ where: { id: details.id } })).toBe(0);
    });

    it('should let an org admin place a member upload', async () => {
      const content = Buffer.from(`theirs-${uniqueId}`);
      const details = await dropWhole(memberToken, content, 'theirs.nsf');
      const res = await request(app)
        .post(`${pendingBase}/${details.id}/place`)
        .set('x-access-token', adminToken)
        .send({ product: 'theirs', release: '2.0', is_public: true, guest_access: true });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        product: 'theirs',
        release: '2.0',
        patch: 'release',
        key: 'theirs.nsf',
      });
      const product = await db.download.findOne({
        where: { name: 'theirs', organizationId: org.id },
      });
      expect(product.userId).toBe(admin.id);
      expect(product.isPublic).toBe(true);
      expect(product.guestAccess).toBe(true);

      const badFlag = await dropWhole(memberToken, Buffer.from(`flag-${uniqueId}`), 'flag.nsf');
      const refused = await request(app)
        .post(`${pendingBase}/${badFlag.id}/place`)
        .set('x-access-token', memberToken)
        .send({ product: 'flagged', release: '1.0', guest_access: 'yes' });
      expect(refused.statusCode).toBe(422);
      expect(refused.body.errors).toEqual([
        expect.objectContaining({ pointer: '/guest_access', rule: 'type' }),
      ]);
      await request(app)
        .delete(`${pendingBase}/${badFlag.id}`)
        .set('x-access-token', memberToken)
        .expect(204);
      expect(
        fs.readFileSync(getSecureDownloadPath(orgName, 'theirs', '2.0', 'release', 'theirs.nsf'))
      ).toEqual(content);
    });

    it('should refuse a member placing into a product they do not own', async () => {
      const details = await dropWhole(
        otherToken,
        Buffer.from(`intrude-${uniqueId}`),
        'intrude.nsf'
      );
      const res = await request(app)
        .post(`${pendingBase}/${details.id}/place`)
        .set('x-access-token', otherToken)
        .send({ product: 'test-db', release: '1.1' });
      expect(res.statusCode).toBe(403);
      await request(app)
        .delete(`${pendingBase}/${details.id}`)
        .set('x-access-token', otherToken)
        .expect(204);
    });

    it("should answer 404 for another organization's id", async () => {
      const details = await dropWhole(memberToken, Buffer.from(`ours-${uniqueId}`), 'ours.nsf');
      const info = await request(app)
        .get(`/api/organization/${otherOrgName}/download/pending/${details.id}/info`)
        .set('x-access-token', strangerToken);
      expect(info.statusCode).toBe(404);
      const placed = await request(app)
        .post(`/api/organization/${otherOrgName}/download/pending/${details.id}/place`)
        .set('x-access-token', strangerToken)
        .send({ product: 'ours', release: '1.0' });
      expect(placed.statusCode).toBe(404);
      const removed = await request(app)
        .delete(`/api/organization/${otherOrgName}/download/pending/${details.id}`)
        .set('x-access-token', strangerToken);
      expect(removed.statusCode).toBe(404);
      await request(app)
        .delete(`${pendingBase}/${details.id}`)
        .set('x-access-token', memberToken)
        .expect(204);
    });
  });

  describe('expiry', () => {
    it("should drop a pending upload older than a day on the next upload's sweep", async () => {
      const details = await dropWhole(memberToken, Buffer.from(`old-${uniqueId}`), 'old.nsf');
      const old = new Date(Date.now() - TWO_DAYS_MS);
      await db.sequelize.query(
        'UPDATE download_pending_uploads SET createdAt = :at WHERE id = :id',
        { replacements: { at: old, id: details.id } }
      );
      fs.utimesSync(getPendingPath(orgName, details.id), old, old);

      const content = Buffer.from(`fresh-${uniqueId}-in-two-chunks`);
      const half = Math.ceil(content.length / 2);
      const first = await drop(memberToken, content.subarray(0, half), 'fresh.nsf', {
        'x-chunk-index': '0',
        'x-total-chunks': '2',
      });
      expect(first.statusCode).toBe(200);

      expect(await db.downloadPendingUploads.count({ where: { id: details.id } })).toBe(0);
      expect(fs.existsSync(getPendingPath(orgName, details.id))).toBe(false);
      expect(await db.downloadPendingUploads.count({ where: { id: first.body.details.id } })).toBe(
        1
      );
      expect(fs.existsSync(getPendingPath(orgName, first.body.details.id))).toBe(true);

      const second = await drop(memberToken, content.subarray(half), 'fresh.nsf', {
        'x-chunk-index': '1',
        'x-total-chunks': '2',
      });
      expect(second.statusCode).toBe(200);
      expect(second.body.details.isComplete).toBe(true);
      await request(app)
        .delete(`${pendingBase}/${first.body.details.id}`)
        .set('x-access-token', memberToken)
        .expect(204);
    });
  });
});
