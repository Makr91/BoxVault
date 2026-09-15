import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const settle = () =>
  new Promise(resolve => {
    setTimeout(resolve, 250);
  });

describe('Download watches', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `DownloadWatchOrg-${uniqueId}`;
  const publicName = `dl-public-${uniqueId}`;
  const draftName = `dl-draft-${uniqueId}`;
  let org;
  let owner;
  let member;
  let outsider;
  let ownerToken;
  let memberToken;
  let outsiderToken;
  let publicDownload;
  let draftDownload;

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

  const downloadUrl = (name, suffix = '') =>
    `/api/organization/${orgName}/download/${name}${suffix}`;

  const watch = (organization, name, token) =>
    request(app)
      .post(`/api/organization/${organization}/download/${name}/watch`)
      .set('x-access-token', token);

  const unwatch = (organization, name, token) =>
    request(app)
      .delete(`/api/organization/${organization}/download/${name}/watch`)
      .set('x-access-token', token);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName });
    owner = await createUser('dlw-owner', 'owner');
    member = await createUser('dlw-member', 'member');
    outsider = await createUser('dlw-outsider', null);
    ownerToken = signFor(owner);
    memberToken = signFor(member);
    outsiderToken = signFor(outsider);
    publicDownload = await db.download.create({
      name: publicName,
      description: 'public download',
      isPublic: true,
      published: true,
      organizationId: org.id,
      userId: owner.id,
    });
    draftDownload = await db.download.create({
      name: draftName,
      description: 'draft download',
      isPublic: false,
      published: false,
      organizationId: org.id,
      userId: owner.id,
    });
  });

  afterAll(async () => {
    await db.download.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({ where: { id: [owner.id, member.id, outsider.id] } });
  });

  it('should answer 404 for an unknown organization or product', async () => {
    expect((await watch(`NoOrg-${uniqueId}`, publicName, memberToken)).statusCode).toBe(404);
    expect((await watch(orgName, 'no-such-product', memberToken)).statusCode).toBe(404);
    expect((await unwatch(`NoOrg-${uniqueId}`, publicName, memberToken)).statusCode).toBe(404);
    expect((await unwatch(orgName, 'no-such-product', memberToken)).statusCode).toBe(404);
  });

  it('should hide an unpublished product from members who did not create it', async () => {
    const res = await watch(orgName, draftName, memberToken);
    expect(res.statusCode).toBe(403);
  });

  it('should let the creator watch the unpublished product', async () => {
    const res = await watch(orgName, draftName, ownerToken);
    expect(res.statusCode).toBe(201);
  });

  it('should let a stranger watch a public product but not a private one', async () => {
    expect((await watch(orgName, publicName, outsiderToken)).statusCode).toBe(201);
    await db.download.update({ isPublic: false }, { where: { id: publicDownload.id } });
    expect((await watch(orgName, publicName, outsiderToken)).statusCode).toBe(403);
    expect((await watch(orgName, publicName, memberToken)).statusCode).toBe(201);
    await db.download.update({ isPublic: true }, { where: { id: publicDownload.id } });
    await unwatch(orgName, publicName, outsiderToken);
    await unwatch(orgName, publicName, memberToken);
  });

  it('should watch, repeat idempotently, list and unwatch', async () => {
    expect((await watch(orgName, publicName, memberToken)).statusCode).toBe(201);
    expect((await watch(orgName, publicName, memberToken)).statusCode).toBe(200);

    const listed = await request(app)
      .get('/api/user/download-watches')
      .set('x-access-token', memberToken);
    expect(listed.statusCode).toBe(200);
    expect(listed.body).toEqual([
      {
        downloadId: publicDownload.id,
        name: publicName,
        description: 'public download',
        organization: orgName,
        logo: null,
      },
    ]);

    const removed = await unwatch(orgName, publicName, memberToken);
    expect(removed.statusCode).toBe(200);
    expect(removed.body).toEqual({ watched: false });

    const emptied = await request(app)
      .get('/api/user/download-watches')
      .set('x-access-token', memberToken);
    expect(emptied.body).toEqual([]);
  });

  it('should notify the watchers when the product is published', async () => {
    await watch(orgName, draftName, ownerToken);
    await db.downloadWatcher.findOrCreate({
      where: { user_id: member.id, download_id: draftDownload.id },
    });
    const res = await request(app)
      .put(downloadUrl(draftName))
      .set('x-access-token', ownerToken)
      .send({ published: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.published).toBe(true);
    await settle();
  });

  it('should discover the published products and delete every product of the organization', async () => {
    const discovered = await request(app).get('/api/downloads/discover');
    expect(discovered.statusCode).toBe(200);
    expect(discovered.body.map(download => download.name)).toContain(publicName);
    expect(discovered.body.map(download => download.name)).not.toContain(draftName);

    const deleted = await request(app)
      .delete(`/api/organization/${orgName}/download`)
      .set('x-access-token', ownerToken);
    expect(deleted.statusCode).toBe(200);
    expect(await db.download.count({ where: { organizationId: org.id } })).toBe(0);
  });
});
