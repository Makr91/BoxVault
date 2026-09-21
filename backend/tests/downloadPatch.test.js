import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureDownloadPath } from '../app/controllers/download/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('Download patch API', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `PatchOrg_${uniqueId}`;
  const productName = 'traveler';
  const releaseNumber = '14.5.1';
  const releaseBase = `/api/organization/${orgName}/download/${productName}/release/${releaseNumber}`;
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
    owner = await createUser('patch-owner', 'owner');
    member = await createUser('patch-member', 'member');
    ownerToken = signFor(owner);
    memberToken = signFor(member);
    await request(app)
      .post(`/api/organization/${orgName}/download`)
      .set('x-access-token', ownerToken)
      .send({ name: productName, published: true })
      .expect(201);
    await request(app)
      .post(`/api/organization/${orgName}/download/${productName}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: releaseNumber, published: true })
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

  it('should create the release patch and a fixpack with a date', async () => {
    const base = await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: 'release', released_at: '2026-03-19', published: true });
    expect(base.statusCode).toBe(201);
    expect(base.body.name).toBe('release');
    expect(base.body.kind).toBe('release');
    expect(base.body.released_at).toBe('2026-03-19');
    expect(base.body.published).toBe(true);
    expect(base.body.is_public).toBe(false);
    expect(base.body.guest_access).toBe(false);
    expect(
      fs.existsSync(getSecureDownloadPath(orgName, productName, releaseNumber, 'release'))
    ).toBe(true);

    const fixpack = await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', ownerToken)
      .send({
        name: 'FP1',
        kind: 'fixpack',
        released_at: '2026-07-16',
        notes_url: 'https://support.hcl-software.com/fp1',
        published: true,
      });
    expect(fixpack.statusCode).toBe(201);
    expect(fixpack.body.kind).toBe('fixpack');
    expect(fixpack.body.notes_url).toBe('https://support.hcl-software.com/fp1');
  });

  it('should be born private and unpublished without the words and never wider than the release', async () => {
    const closed = await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: 'HF1', kind: 'hotfix' });
    expect(closed.statusCode).toBe(201);
    expect(closed.body.published).toBe(false);
    expect(closed.body.is_public).toBe(false);
    expect(closed.body.guest_access).toBe(false);

    const hidden = await request(app)
      .get(`${releaseBase}/patch/HF1`)
      .set('x-access-token', memberToken);
    expect(hidden.statusCode).toBe(404);
    const listed = await request(app)
      .get(`${releaseBase}/patch`)
      .set('x-access-token', memberToken);
    expect(listed.body.map(entry => entry.name)).not.toContain('HF1');
    const asOwner = await request(app)
      .get(`${releaseBase}/patch/HF1`)
      .set('x-access-token', ownerToken);
    expect(asOwner.statusCode).toBe(200);

    const wider = await request(app)
      .put(`${releaseBase}/patch/HF1`)
      .set('x-access-token', ownerToken)
      .send({ guest_access: true, published: true });
    expect(wider.statusCode).toBe(422);
    expect(wider.body.errors).toEqual([
      expect.objectContaining({
        pointer: '/guest_access',
        rule: 'withinParent',
        params: { parent: 'private' },
      }),
    ]);

    const published = await request(app)
      .post(`${releaseBase}/patch/bulk`)
      .set('x-access-token', ownerToken)
      .send({ action: 'publish', names: ['HF1', 'HF9'] });
    expect(published.body).toEqual({
      processed: 1,
      skipped: 1,
      errors: [{ name: 'HF9', code: 'not_found' }],
    });
    const shown = await request(app)
      .get(`${releaseBase}/patch/HF1`)
      .set('x-access-token', memberToken);
    expect(shown.statusCode).toBe(200);
    const opened = await request(app)
      .post(`${releaseBase}/patch/bulk`)
      .set('x-access-token', ownerToken)
      .send({ action: 'allow_guests', names: ['HF1'] });
    expect(opened.body).toEqual({
      processed: 0,
      skipped: 1,
      errors: [{ name: 'HF1', code: 'forbidden' }],
    });
    await request(app).delete(`${releaseBase}/patch/HF1`).set('x-access-token', ownerToken);
  });

  it('should reject a released_at that is not a full-date', async () => {
    const res = await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: 'IF1', released_at: '16 Jul 2026' });
    expect(res.statusCode).toBe(422);
    expect(res.body.errors).toEqual([
      expect.objectContaining({
        pointer: '/released_at',
        rule: 'format',
        params: { format: 'date' },
      }),
    ]);
  });

  it('should reject a kind outside the enum', async () => {
    const res = await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: 'IF1', kind: 'servicepack' });
    expect(res.statusCode).toBe(422);
    expect(res.body.errors).toEqual([expect.objectContaining({ pointer: '/kind', rule: 'enum' })]);
  });

  it('should reject a duplicate patch with 409 and a bad identifier with 422', async () => {
    const duplicate = await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: 'FP1' });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.body.errors).toEqual([
      expect.objectContaining({
        pointer: '/name',
        rule: 'unique',
        params: { scope: releaseNumber },
      }),
    ]);

    const invalid = await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: '-bad' });
    expect(invalid.statusCode).toBe(422);
  });

  it('should refuse a plain member and answer 404 for an unknown release', async () => {
    const asMember = await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', memberToken)
      .send({ name: 'IF1' });
    expect(asMember.statusCode).toBe(403);

    const noRelease = await request(app)
      .post(`/api/organization/${orgName}/download/${productName}/release/9.9.9/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: 'IF1' });
    expect(noRelease.statusCode).toBe(404);
  });

  it('should list and get patches with their files', async () => {
    const list = await request(app).get(`${releaseBase}/patch`).set('x-access-token', memberToken);
    expect(list.statusCode).toBe(200);
    expect(list.body.map(entry => entry.name)).toEqual(['release', 'FP1']);
    expect(Array.isArray(list.body[0].files)).toBe(true);

    const one = await request(app)
      .get(`${releaseBase}/patch/FP1`)
      .set('x-access-token', memberToken);
    expect(one.statusCode).toBe(200);
    expect(one.body.name).toBe('FP1');
    expect(Array.isArray(one.body.files)).toBe(true);

    const anonymous = await request(app).get(`${releaseBase}/patch`);
    expect(anonymous.statusCode).toBe(403);

    const missing = await request(app)
      .get(`${releaseBase}/patch/FP9`)
      .set('x-access-token', memberToken);
    expect(missing.statusCode).toBe(404);
  });

  it('should update a patch and rename its directory', async () => {
    const res = await request(app)
      .put(`${releaseBase}/patch/FP1`)
      .set('x-access-token', ownerToken)
      .send({ description: 'Fix Pack 1', kind: 'hotfix', released_at: '2026-08-01' });
    expect(res.statusCode).toBe(200);
    expect(res.body.description).toBe('Fix Pack 1');
    expect(res.body.kind).toBe('hotfix');
    expect(res.body.released_at).toBe('2026-08-01');

    const cleared = await request(app)
      .put(`${releaseBase}/patch/FP1`)
      .set('x-access-token', ownerToken)
      .send({ notes_url: '' });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.body.notes_url).toBeNull();

    const renamed = await request(app)
      .put(`${releaseBase}/patch/FP1`)
      .set('x-access-token', ownerToken)
      .send({ name: 'FP2' });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.body.name).toBe('FP2');
    expect(fs.existsSync(getSecureDownloadPath(orgName, productName, releaseNumber, 'FP2'))).toBe(
      true
    );
    expect(fs.existsSync(getSecureDownloadPath(orgName, productName, releaseNumber, 'FP1'))).toBe(
      false
    );

    const conflict = await request(app)
      .put(`${releaseBase}/patch/FP2`)
      .set('x-access-token', ownerToken)
      .send({ name: 'release' });
    expect(conflict.statusCode).toBe(409);

    const asMember = await request(app)
      .put(`${releaseBase}/patch/FP2`)
      .set('x-access-token', memberToken)
      .send({ description: 'hijack' });
    expect(asMember.statusCode).toBe(403);
  });

  it('should move a patch to another release with its directory', async () => {
    const productBase = `/api/organization/${orgName}/download/${productName}`;
    await request(app)
      .post(`${productBase}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: '14.5.2', published: true })
      .expect(201);
    await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: 'IF3', kind: 'interim-fix', published: true })
      .expect(201);
    fs.writeFileSync(
      getSecureDownloadPath(orgName, productName, releaseNumber, 'IF3', 'if3.bin'),
      'if3'
    );
    const release = await db.downloadReleases.findOne({ where: { versionNumber: releaseNumber } });
    const patch = await db.downloadPatches.findOne({
      where: { name: 'IF3', downloadReleaseId: release.id },
    });
    const file = await db.downloadFiles.create({
      key: 'if3.bin',
      fileName: 'if3.bin',
      fileSize: 3,
      storagePath: `${orgName}/downloads/${productName}/${releaseNumber}/IF3/if3.bin`,
      downloadPatchId: patch.id,
    });

    const noRelease = await request(app)
      .put(`${releaseBase}/patch/IF3`)
      .set('x-access-token', ownerToken)
      .send({ release: '9.9.9' });
    expect(noRelease.statusCode).toBe(404);
    const asMember = await request(app)
      .put(`${releaseBase}/patch/IF3`)
      .set('x-access-token', memberToken)
      .send({ release: '14.5.2' });
    expect(asMember.statusCode).toBe(403);

    const moved = await request(app)
      .put(`${releaseBase}/patch/IF3`)
      .set('x-access-token', ownerToken)
      .send({ release: '14.5.2', name: 'IF1' });
    expect(moved.statusCode).toBe(200);
    expect(moved.body.name).toBe('IF1');
    expect(
      fs.readFileSync(getSecureDownloadPath(orgName, productName, '14.5.2', 'IF1', 'if3.bin'))
    ).toEqual(Buffer.from('if3'));
    expect(fs.existsSync(getSecureDownloadPath(orgName, productName, releaseNumber, 'IF3'))).toBe(
      false
    );
    await file.reload();
    expect(file.storagePath).toBe(`${orgName}/downloads/${productName}/14.5.2/IF1/if3.bin`);
    const arrived = await request(app)
      .get(`${productBase}/release/14.5.2/patch/IF1`)
      .set('x-access-token', memberToken);
    expect(arrived.statusCode).toBe(200);

    await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: 'IF1', kind: 'interim-fix' })
      .expect(201);
    const taken = await request(app)
      .put(`${releaseBase}/patch/IF1`)
      .set('x-access-token', ownerToken)
      .send({ release: '14.5.2' });
    expect(taken.statusCode).toBe(409);
    expect(taken.body.errors).toEqual([
      expect.objectContaining({ pointer: '/name', rule: 'unique', params: { scope: '14.5.2' } }),
    ]);
    await request(app).delete(`${releaseBase}/patch/IF1`).set('x-access-token', ownerToken);
    await request(app).delete(`${productBase}/release/14.5.2`).set('x-access-token', ownerToken);
  });

  it('should delete a patch and answer 404 afterwards', async () => {
    const asMember = await request(app)
      .delete(`${releaseBase}/patch/FP2`)
      .set('x-access-token', memberToken);
    expect(asMember.statusCode).toBe(403);

    const res = await request(app)
      .delete(`${releaseBase}/patch/FP2`)
      .set('x-access-token', ownerToken);
    expect(res.statusCode).toBe(200);

    const gone = await request(app)
      .delete(`${releaseBase}/patch/FP2`)
      .set('x-access-token', ownerToken);
    expect(gone.statusCode).toBe(404);
  });

  it('should handle DB errors', async () => {
    jest.spyOn(db.downloadPatches, 'findAll').mockRejectedValue(new Error('DB Error'));
    const list = await request(app).get(`${releaseBase}/patch`).set('x-access-token', memberToken);
    expect(list.statusCode).toBe(500);
    jest.restoreAllMocks();
    jest.spyOn(db.downloadPatches, 'create').mockRejectedValue(new Error('DB Error'));
    const created = await request(app)
      .post(`${releaseBase}/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: 'IF2' });
    expect(created.statusCode).toBe(500);
  });
});
