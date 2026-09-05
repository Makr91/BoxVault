import request from 'supertest';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getIsoStorageRoot } from '../app/controllers/iso/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const settle = () =>
  new Promise(resolve => {
    setTimeout(resolve, 250);
  });

describe('ISO watches and ISO route guards', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `IsoWatchOrg-${uniqueId}`;
  const publicName = `iso-public-${uniqueId}`;
  const draftName = `iso-draft-${uniqueId}`;
  let org;
  let owner;
  let member;
  let ownerToken;
  let memberToken;
  let publicIso;
  let draftIso;

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

  const isoUrl = (name, suffix = '') => `/api/organization/${orgName}/iso/${name}${suffix}`;

  const watch = (organization, name, token) =>
    request(app)
      .post(`/api/organization/${organization}/iso/${name}/watch`)
      .set('x-access-token', token);

  const unwatch = (organization, name, token) =>
    request(app)
      .delete(`/api/organization/${organization}/iso/${name}/watch`)
      .set('x-access-token', token);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName });
    owner = await createUser('isow-owner', 'owner');
    member = await createUser('isow-member', 'member');
    ownerToken = signFor(owner);
    memberToken = signFor(member);
    publicIso = await db.iso.create({
      name: publicName,
      description: 'public iso',
      isPublic: true,
      published: true,
      organizationId: org.id,
      userId: owner.id,
    });
    draftIso = await db.iso.create({
      name: draftName,
      description: 'draft iso',
      isPublic: false,
      published: false,
      organizationId: org.id,
      userId: owner.id,
    });
    await db.credential.create({
      user_id: member.id,
      provider: 'https://iso-idp.example',
      subject: `isow-member-${uniqueId}`,
      external_email: member.email,
    });
  });

  afterAll(async () => {
    await db.iso.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({ where: { id: [owner.id, member.id] } });
  });

  it('should answer 404 for an unknown organization or ISO', async () => {
    expect((await watch(`NoOrg-${uniqueId}`, publicName, memberToken)).statusCode).toBe(404);
    expect((await watch(orgName, 'no-such-iso', memberToken)).statusCode).toBe(404);
    expect((await unwatch(`NoOrg-${uniqueId}`, publicName, memberToken)).statusCode).toBe(404);
    expect((await unwatch(orgName, 'no-such-iso', memberToken)).statusCode).toBe(404);
  });

  it('should hide an unpublished ISO from members who did not create it', async () => {
    const res = await watch(orgName, draftName, memberToken);
    expect(res.statusCode).toBe(403);
  });

  it('should let the creator watch the unpublished ISO', async () => {
    const res = await watch(orgName, draftName, ownerToken);
    expect(res.statusCode).toBe(201);
  });

  it('should watch, repeat idempotently, list and unwatch', async () => {
    expect((await watch(orgName, publicName, memberToken)).statusCode).toBe(201);
    expect((await watch(orgName, publicName, memberToken)).statusCode).toBe(200);

    const listed = await request(app)
      .get('/api/user/iso-watches')
      .set('x-access-token', memberToken);
    expect(listed.statusCode).toBe(200);
    expect(listed.body).toEqual([
      {
        isoId: publicIso.id,
        name: publicName,
        description: 'public iso',
        organization: orgName,
        logo: null,
      },
    ]);

    const removed = await unwatch(orgName, publicName, memberToken);
    expect(removed.statusCode).toBe(200);
    expect(removed.body).toEqual({ watched: false });
  });

  it('should reject an ISO name with consecutive dots and accept rename-free updates', async () => {
    const dotted = await request(app)
      .post(`/api/organization/${orgName}/iso`)
      .set('x-access-token', ownerToken)
      .send({ name: 'bad..name' });
    expect(dotted.statusCode).toBe(400);

    const untouched = await request(app)
      .put(isoUrl(publicName))
      .set('x-access-token', ownerToken)
      .send({ description: 'still public' });
    expect(untouched.statusCode).toBe(200);
    expect(untouched.body.description).toBe('still public');

    const sameName = await request(app)
      .put(isoUrl(publicName))
      .set('x-access-token', ownerToken)
      .send({ name: publicName, description: 'same name' });
    expect(sameName.statusCode).toBe(200);
    expect(sameName.body.description).toBe('same name');
  });

  it('should answer 404 on the version routes of an unknown organization', async () => {
    const res = await request(app).get(
      `/api/organization/NoOrg-${uniqueId}/iso/${publicName}/version`
    );
    expect(res.statusCode).toBe(404);
  });

  it('should answer 404 on the file routes of an unknown organization or ISO', async () => {
    const base = name => `/iso/${name}/version/1.0.0/architecture/amd64/file/info`;
    const noOrg = await request(app).get(`/api/organization/NoOrg-${uniqueId}${base(publicName)}`);
    expect(noOrg.statusCode).toBe(404);
    const noIso = await request(app).get(`/api/organization/${orgName}${base('no-such-iso')}`);
    expect(noIso.statusCode).toBe(404);
  });

  describe('versions', () => {
    let draftVersion;

    beforeAll(async () => {
      draftVersion = await db.isoVersions.create({ versionNumber: '0.9.0', isoId: draftIso.id });
      await db.isoVersions.create({ versionNumber: '1.0.0', isoId: publicIso.id });
    });

    it('should hide the versions of an unpublished ISO from anonymous callers', async () => {
      const list = await request(app).get(isoUrl(draftName, '/version'));
      expect(list.statusCode).toBe(403);
      const one = await request(app).get(
        isoUrl(draftName, `/version/${draftVersion.versionNumber}`)
      );
      expect(one.statusCode).toBe(403);
      const asOwner = await request(app)
        .get(isoUrl(draftName, `/version/${draftVersion.versionNumber}`))
        .set('x-access-token', ownerToken);
      expect(asOwner.statusCode).toBe(200);
    });

    it('should validate the release note and deprecation fields of a version', async () => {
      const missing = await request(app)
        .put(isoUrl(publicName, '/version/9.9.9'))
        .set('x-access-token', ownerToken)
        .send({ description: 'x' });
      expect(missing.statusCode).toBe(404);

      const cases = [
        { releaseNotes: 5 },
        { deprecated: 'yes' },
        { deprecationReason: 'x'.repeat(513) },
        { deprecated: true },
      ];
      const responses = await Promise.all(
        cases.map(body =>
          request(app)
            .put(isoUrl(publicName, '/version/1.0.0'))
            .set('x-access-token', ownerToken)
            .send(body)
        )
      );
      responses.forEach(res => {
        expect(res.statusCode).toBe(400);
      });

      const updated = await request(app)
        .put(isoUrl(publicName, '/version/1.0.0'))
        .set('x-access-token', ownerToken)
        .send({
          description: 'first',
          releaseNotes: 'notes',
          deprecated: true,
          deprecationReason: 'old',
        });
      expect(updated.statusCode).toBe(200);
      expect(updated.body).toMatchObject({
        description: 'first',
        releaseNotes: 'notes',
        deprecated: true,
        deprecationReason: 'old',
      });
    });

    it('should remove the stored file with the last version referencing it', async () => {
      const storagePath = `orphan-${uniqueId}.iso`;
      const root = getIsoStorageRoot();
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, storagePath), 'iso-bytes');
      await db.isoFiles.create({
        architecture: 'amd64',
        fileName: 'draft.iso',
        fileSize: 9,
        checksum: `orphan-${uniqueId}`,
        checksumType: 'SHA256',
        storagePath,
        isoVersionId: draftVersion.id,
      });

      const res = await request(app)
        .delete(isoUrl(draftName, `/version/${draftVersion.versionNumber}`))
        .set('x-access-token', ownerToken);
      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(path.join(root, storagePath))).toBe(false);
    });
  });

  it('should notify the watchers when the ISO is published', async () => {
    await watch(orgName, draftName, ownerToken);
    await db.isoWatcher.findOrCreate({ where: { user_id: member.id, iso_id: draftIso.id } });
    const res = await request(app)
      .put(isoUrl(draftName))
      .set('x-access-token', ownerToken)
      .send({ published: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.published).toBe(true);
    await settle();
  });

  it('should discover the published ISOs and delete every ISO of the organization', async () => {
    const discovered = await request(app).get('/api/isos/discover');
    expect(discovered.statusCode).toBe(200);
    expect(discovered.body.map(iso => iso.name)).toContain(publicName);

    const deleted = await request(app)
      .delete(`/api/organization/${orgName}/iso`)
      .set('x-access-token', ownerToken);
    expect(deleted.statusCode).toBe(200);
    expect(await db.iso.count({ where: { organizationId: org.id } })).toBe(0);

    const nothing = await request(app)
      .delete(`/api/organization/${orgName}/iso`)
      .set('x-access-token', ownerToken);
    expect(nothing.statusCode).toBe(404);
  });
});
