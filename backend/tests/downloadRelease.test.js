import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureDownloadPath } from '../app/controllers/download/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('Download release API', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `ReleaseOrg_${uniqueId}`;
  const productName = 'notes-client';
  const productBase = `/api/organization/${orgName}/download/${productName}`;
  let org;
  let owner;
  let member;
  let ownerToken;
  let memberToken;

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

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await createUser('rel-owner', 'owner');
    member = await createUser('rel-member', 'member');
    ownerToken = signFor(owner);
    memberToken = signFor(member);
    await request(app)
      .post(`/api/organization/${orgName}/download`)
      .set('x-access-token', ownerToken)
      .send({ name: productName, published: true })
      .expect(201);
  });

  afterAll(async () => {
    await db.download.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({ where: { id: [owner.id, member.id] } });
    fs.rmSync(getSecureDownloadPath(orgName), { recursive: true, force: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create a release and its directory', async () => {
    const res = await request(app)
      .post(`${productBase}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '14.5', description: 'First', published: true });
    expect(res.statusCode).toBe(201);
    expect(res.body.version_number).toBe('14.5');
    expect(res.body.description).toBe('First');
    expect(res.body.deprecated).toBe(false);
    expect(res.body.published).toBe(true);
    expect(res.body.is_public).toBe(false);
    expect(res.body.guest_access).toBe(false);
    expect(fs.existsSync(getSecureDownloadPath(orgName, productName, '14.5'))).toBe(true);
  });

  it('should be born private and unpublished without the words and never wider than the product', async () => {
    const closed = await request(app)
      .post(`${productBase}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '9.0.1' });
    expect(closed.statusCode).toBe(201);
    expect(closed.body.published).toBe(false);
    expect(closed.body.is_public).toBe(false);
    expect(closed.body.guest_access).toBe(false);

    const hidden = await request(app)
      .get(`${productBase}/release/9.0.1`)
      .set('x-access-token', memberToken);
    expect(hidden.statusCode).toBe(404);
    const listed = await request(app)
      .get(`${productBase}/release`)
      .set('x-access-token', memberToken);
    expect(listed.body.map(entry => entry.version_number)).not.toContain('9.0.1');
    const asOwner = await request(app)
      .get(`${productBase}/release/9.0.1`)
      .set('x-access-token', ownerToken);
    expect(asOwner.statusCode).toBe(200);
    const product = await request(app).get(productBase).set('x-access-token', memberToken);
    expect(product.body.releases.map(entry => entry.version_number)).not.toContain('9.0.1');

    const wider = await request(app)
      .put(`${productBase}/release/9.0.1`)
      .set('x-access-token', ownerToken)
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
      .post(`${productBase}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '9.0.2', is_public: true, published: true });
    expect(bornWide.statusCode).toBe(422);
    expect(bornWide.body.errors).toEqual([
      expect.objectContaining({ pointer: '/is_public', rule: 'withinParent' }),
    ]);

    const published = await request(app)
      .put(`${productBase}/release/9.0.1`)
      .set('x-access-token', ownerToken)
      .send({ published: true });
    expect(published.statusCode).toBe(200);
    expect(published.body.published).toBe(true);
    const shown = await request(app)
      .get(`${productBase}/release/9.0.1`)
      .set('x-access-token', memberToken);
    expect(shown.statusCode).toBe(200);

    const unpublished = await request(app)
      .post(`${productBase}/release/bulk`)
      .set('x-access-token', ownerToken)
      .send({ action: 'unpublish', names: ['9.0.1'] });
    expect(unpublished.body).toEqual({ processed: 1, skipped: 0, errors: [] });
    const opened = await request(app)
      .post(`${productBase}/release/bulk`)
      .set('x-access-token', ownerToken)
      .send({ action: 'make_public', names: ['9.0.1'] });
    expect(opened.body).toEqual({
      processed: 0,
      skipped: 1,
      errors: [{ name: '9.0.1', code: 'forbidden' }],
    });
    const gone = await request(app)
      .get(`${productBase}/release/9.0.1`)
      .set('x-access-token', memberToken);
    expect(gone.statusCode).toBe(404);
    await request(app).delete(`${productBase}/release/9.0.1`).set('x-access-token', ownerToken);
  });

  it('should reject a duplicate release with 409', async () => {
    const res = await request(app)
      .post(`${productBase}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '14.5' });
    expect(res.statusCode).toBe(409);
    expect(res.body.errors).toEqual([
      expect.objectContaining({
        pointer: '/version_number',
        rule: 'unique',
        params: { scope: productName },
      }),
    ]);
  });

  it('should reject a release that is not an identifier', async () => {
    const res = await request(app)
      .post(`${productBase}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '.hidden' });
    expect(res.statusCode).toBe(422);
    expect(res.body.errors).toEqual([
      expect.objectContaining({
        pointer: '/version_number',
        rule: 'pattern',
        params: { pattern: 'identifier' },
      }),
    ]);
  });

  it('should refuse a plain member', async () => {
    const res = await request(app)
      .post(`${productBase}/release`)
      .set('x-access-token', memberToken)
      .send({ version_number: '15.0' });
    expect(res.statusCode).toBe(403);
  });

  it('should return 404 for an unknown product or organization', async () => {
    const noProduct = await request(app)
      .post(`/api/organization/${orgName}/download/no-such-product/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '1.0' });
    expect(noProduct.statusCode).toBe(404);
    const noOrg = await request(app).get(
      `/api/organization/NoOrg-${uniqueId}/download/${productName}/release`
    );
    expect(noOrg.statusCode).toBe(404);
  });

  it('should list releases newest first with their patches', async () => {
    await request(app)
      .post(`${productBase}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '14.5.1', published: true })
      .expect(201);
    const res = await request(app).get(`${productBase}/release`).set('x-access-token', memberToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.map(entry => entry.version_number)).toEqual(['14.5.1', '14.5']);
    expect(Array.isArray(res.body[0].patches)).toBe(true);
  });

  it('should refuse the release list of a private product to an anonymous caller', async () => {
    const res = await request(app).get(`${productBase}/release`);
    expect(res.statusCode).toBe(403);
  });

  it('should get one release and answer 404 for an unknown one', async () => {
    const res = await request(app)
      .get(`${productBase}/release/14.5`)
      .set('x-access-token', memberToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.version_number).toBe('14.5');
    const missing = await request(app)
      .get(`${productBase}/release/9.9.9`)
      .set('x-access-token', memberToken);
    expect(missing.statusCode).toBe(404);
  });

  it('should update release notes and deprecation', async () => {
    const missingReason = await request(app)
      .put(`${productBase}/release/14.5`)
      .set('x-access-token', ownerToken)
      .send({ deprecated: true });
    expect(missingReason.statusCode).toBe(422);
    expect(missingReason.body.errors).toEqual([
      expect.objectContaining({ pointer: '/deprecation_reason', rule: 'required' }),
    ]);

    const res = await request(app)
      .put(`${productBase}/release/14.5`)
      .set('x-access-token', ownerToken)
      .send({
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

    const asMember = await request(app)
      .put(`${productBase}/release/14.5`)
      .set('x-access-token', memberToken)
      .send({ description: 'hijack' });
    expect(asMember.statusCode).toBe(403);

    const missing = await request(app)
      .put(`${productBase}/release/9.9.9`)
      .set('x-access-token', ownerToken)
      .send({ description: 'x' });
    expect(missing.statusCode).toBe(404);
  });

  it('should rename a release and move its directory', async () => {
    const res = await request(app)
      .put(`${productBase}/release/14.5.1`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '14.5.2' });
    expect(res.statusCode).toBe(200);
    expect(res.body.version_number).toBe('14.5.2');
    expect(fs.existsSync(getSecureDownloadPath(orgName, productName, '14.5.2'))).toBe(true);
    expect(fs.existsSync(getSecureDownloadPath(orgName, productName, '14.5.1'))).toBe(false);

    const conflict = await request(app)
      .put(`${productBase}/release/14.5.2`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '14.5' });
    expect(conflict.statusCode).toBe(409);
  });

  it('should move a release to another product of the organization with its files', async () => {
    const targetName = 'notes-designer';
    await request(app)
      .post(`/api/organization/${orgName}/download`)
      .set('x-access-token', ownerToken)
      .send({ name: targetName, published: true })
      .expect(201);
    const target = await db.download.findOne({
      where: { name: targetName, organizationId: org.id },
    });
    const release = await db.downloadReleases.findOne({ where: { versionNumber: '14.5' } });
    const patch = await db.downloadPatches.create({
      name: 'release',
      kind: 'release',
      downloadReleaseId: release.id,
    });
    fs.mkdirSync(getSecureDownloadPath(orgName, productName, '14.5', 'release'), {
      recursive: true,
    });
    fs.writeFileSync(getSecureDownloadPath(orgName, productName, '14.5', 'release', 'a.bin'), 'a');
    const file = await db.downloadFiles.create({
      key: 'a.bin',
      fileName: 'a.bin',
      fileSize: 1,
      storagePath: `${orgName}/downloads/${productName}/14.5/release/a.bin`,
      downloadPatchId: patch.id,
    });

    const unknown = await request(app)
      .put(`${productBase}/release/14.5`)
      .set('x-access-token', ownerToken)
      .send({ download: 'no-such-product' });
    expect(unknown.statusCode).toBe(404);

    const notASlug = await request(app)
      .put(`${productBase}/release/14.5`)
      .set('x-access-token', ownerToken)
      .send({ download: 'bad name' });
    expect(notASlug.statusCode).toBe(422);
    expect(notASlug.body.errors).toEqual([
      expect.objectContaining({
        pointer: '/download',
        rule: 'pattern',
        params: { pattern: 'slug' },
      }),
    ]);

    const asMember = await request(app)
      .put(`${productBase}/release/14.5`)
      .set('x-access-token', memberToken)
      .send({ download: targetName });
    expect(asMember.statusCode).toBe(403);

    const moved = await request(app)
      .put(`${productBase}/release/14.5`)
      .set('x-access-token', ownerToken)
      .send({ download: targetName });
    expect(moved.statusCode).toBe(200);
    expect(moved.body.download_id).toBe(target.id);
    expect(moved.body.version_number).toBe('14.5');
    expect(
      fs.existsSync(getSecureDownloadPath(orgName, targetName, '14.5', 'release', 'a.bin'))
    ).toBe(true);
    expect(fs.existsSync(getSecureDownloadPath(orgName, productName, '14.5'))).toBe(false);
    await file.reload();
    expect(file.storagePath).toBe(`${orgName}/downloads/${targetName}/14.5/release/a.bin`);

    const gone = await request(app)
      .get(`${productBase}/release/14.5`)
      .set('x-access-token', memberToken);
    expect(gone.statusCode).toBe(404);
    const arrived = await request(app)
      .get(`/api/organization/${orgName}/download/${targetName}/release/14.5`)
      .set('x-access-token', memberToken);
    expect(arrived.statusCode).toBe(200);

    await request(app)
      .post(`${productBase}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '14.5', published: true })
      .expect(201);
    const taken = await request(app)
      .put(`${productBase}/release/14.5`)
      .set('x-access-token', ownerToken)
      .send({ download: targetName });
    expect(taken.statusCode).toBe(409);
    expect(taken.body.errors).toEqual([
      expect.objectContaining({
        pointer: '/version_number',
        rule: 'unique',
        params: { scope: targetName },
      }),
    ]);

    const renamedIn = await request(app)
      .put(`${productBase}/release/14.5`)
      .set('x-access-token', ownerToken)
      .send({ download: targetName, version_number: '14.5-again' });
    expect(renamedIn.statusCode).toBe(200);
    expect(renamedIn.body.download_id).toBe(target.id);
    expect(fs.existsSync(getSecureDownloadPath(orgName, targetName, '14.5-again'))).toBe(true);
  });

  it('should delete a release and answer 404 afterwards', async () => {
    const asMember = await request(app)
      .delete(`${productBase}/release/14.5.2`)
      .set('x-access-token', memberToken);
    expect(asMember.statusCode).toBe(403);

    const res = await request(app)
      .delete(`${productBase}/release/14.5.2`)
      .set('x-access-token', ownerToken);
    expect(res.statusCode).toBe(200);

    const gone = await request(app)
      .delete(`${productBase}/release/14.5.2`)
      .set('x-access-token', ownerToken);
    expect(gone.statusCode).toBe(404);
  });

  it('should handle DB errors', async () => {
    jest.spyOn(db.downloadReleases, 'findOne').mockRejectedValue(new Error('DB Error'));
    const created = await request(app)
      .post(`${productBase}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '16.0' });
    expect(created.statusCode).toBe(500);
    const one = await request(app)
      .get(`${productBase}/release/14.5`)
      .set('x-access-token', memberToken);
    expect(one.statusCode).toBe(500);
    jest.restoreAllMocks();
    jest.spyOn(db.downloadReleases, 'findAll').mockRejectedValue(new Error('DB Error'));
    const list = await request(app)
      .get(`${productBase}/release`)
      .set('x-access-token', memberToken);
    expect(list.statusCode).toBe(500);
  });
});
