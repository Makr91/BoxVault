import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('Box guest access', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `BoxGuestOrg_${uniqueId}`;
  const publicName = `bg-public-${uniqueId}`;
  const flaggedName = `bg-flagged-${uniqueId}`;
  const unflaggedName = `bg-unflagged-${uniqueId}`;
  const pendingName = `bg-pending-${uniqueId}`;
  const content = Buffer.from(`box-guest-${uniqueId}`);
  let org;
  let owner;
  let admin;
  let member;
  let uploader;
  let guest;
  let ownerToken;
  let adminToken;
  let memberToken;
  let uploaderToken;
  let guestToken;
  let guestAccountId;
  let guestAccountKey;
  let guestAccountToken;

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

  const boxBase = name => `/api/organization/${orgName}/box/${name}`;
  const fileBase = name =>
    `${boxBase(name)}/version/1.0.0/provider/virtualbox/architecture/amd64/file`;

  const createBox = async (name, values) => {
    const box = await db.box.create({
      name,
      description: name,
      organizationId: org.id,
      userId: owner.id,
      ...values,
    });
    const version = await db.versions.create({ versionNumber: '1.0.0', boxId: box.id });
    const provider = await db.providers.create({ name: 'virtualbox', versionId: version.id });
    const architecture = await db.architectures.create({ name: 'amd64', providerId: provider.id });
    await request(app)
      .post(`${fileBase(name)}/upload`)
      .set('x-access-token', ownerToken)
      .set('Content-Type', 'application/octet-stream')
      .send(content)
      .expect(200);
    await db.files.update(
      { isPublic: true, guestAccess: true, published: true },
      { where: { architectureId: architecture.id } }
    );
    return box;
  };

  const get = (url, token) => {
    const req = request(app).get(url);
    return token ? req.set('x-access-token', token) : req;
  };

  const listedNames = async token => {
    const res = await get(`/api/organization/${orgName}/box`, token);
    expect(res.statusCode).toBe(200);
    return res.body.map(entry => entry.name);
  };

  const discoveredNames = async token => {
    const res = await get('/api/discover', token);
    expect(res.statusCode).toBe(200);
    return res.body.map(entry => entry.name);
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await createUser('bg-owner', 'owner');
    admin = await createUser('bg-admin', 'admin');
    member = await createUser('bg-member', 'member');
    uploader = await createUser('bg-uploader', 'member');
    guest = await createUser('bg-guest', 'guest');
    ownerToken = signFor(owner);
    adminToken = signFor(admin);
    memberToken = signFor(member);
    uploaderToken = signFor(uploader);
    guestToken = signFor(guest);

    const minted = await request(app)
      .post('/api/service-accounts')
      .set('x-access-token', ownerToken)
      .send({
        description: 'Guest key',
        expiration_days: 30,
        organization_id: org.id,
        role: 'guest',
      });
    expect(minted.statusCode).toBe(201);
    guestAccountId = minted.body.id;
    guestAccountKey = minted.body.token;
    guestAccountToken = jwt.sign(
      { id: owner.id, is_service_account: true, service_account_id: guestAccountId },
      'test-secret',
      { expiresIn: '1h', ...TEST_JWT_CLAIMS }
    );

    await createBox(publicName, { isPublic: true, published: true });
    await createBox(flaggedName, { isPublic: false, published: true, guestAccess: true });
    await createBox(unflaggedName, { isPublic: false, published: true });
    await createBox(pendingName, {
      isPublic: false,
      published: false,
      guestAccess: true,
      userId: uploader.id,
    });
  });

  afterAll(async () => {
    await db.service_account.destroy({ where: { id: guestAccountId } });
    await db.box.destroy({ where: { organizationId: org.id } });
    await db.UserOrg.destroy({ where: { organization_id: org.id } });
    await org.destroy();
    await db.user.destroy({
      where: { id: [owner.id, admin.id, member.id, uploader.id, guest.id] },
    });
  });

  describe('lists', () => {
    it('should list the public box alone to an anonymous caller', async () => {
      expect(await listedNames()).toEqual([publicName]);
      const discovered = await discoveredNames();
      expect(discovered).toContain(publicName);
      expect(discovered).not.toContain(flaggedName);
    });

    it('should list the public and flagged boxes to a guest', async () => {
      const names = await listedNames(guestToken);
      expect(names.sort()).toEqual([flaggedName, publicName].sort());
      const discovered = await discoveredNames(guestToken);
      expect(discovered).toContain(flaggedName);
      expect(discovered).not.toContain(unflaggedName);
      expect(discovered).not.toContain(pendingName);
    });

    it('should list the same to a guest-role service account by key and by session', async () => {
      const byKey = await request(app)
        .get(`/api/organization/${orgName}/box`)
        .set('Authorization', `Bearer ${guestAccountKey}`);
      expect(byKey.statusCode).toBe(200);
      expect(byKey.body.map(entry => entry.name).sort()).toEqual([flaggedName, publicName].sort());
      const bySession = await listedNames(guestAccountToken);
      expect(bySession.sort()).toEqual([flaggedName, publicName].sort());
      const discovered = await request(app)
        .get('/api/discover')
        .set('Authorization', `Bearer ${guestAccountKey}`);
      expect(discovered.body.map(entry => entry.name)).toContain(flaggedName);
      expect(discovered.body.map(entry => entry.name)).not.toContain(unflaggedName);
    });

    it('should list every published box to a member and an admin', async () => {
      const asMember = await listedNames(memberToken);
      expect(asMember.sort()).toEqual([flaggedName, publicName, unflaggedName].sort());
      const asAdmin = await listedNames(adminToken);
      expect(asAdmin.sort()).toEqual([flaggedName, publicName, unflaggedName].sort());
    });

    it('should list the unpublished box to its uploader alone', async () => {
      expect(await listedNames(uploaderToken)).toContain(pendingName);
      expect(await listedNames(memberToken)).not.toContain(pendingName);
      expect(await listedNames(guestToken)).not.toContain(pendingName);
      expect(await discoveredNames(uploaderToken)).toContain(pendingName);
    });
  });

  describe('single reads', () => {
    const readCases = [
      ['anonymous', () => undefined, { public: 200, flagged: 403, unflagged: 403, pending: 403 }],
      ['guest', () => guestToken, { public: 200, flagged: 200, unflagged: 403, pending: 403 }],
      [
        'guest account',
        () => guestAccountToken,
        { public: 200, flagged: 200, unflagged: 403, pending: 403 },
      ],
      ['member', () => memberToken, { public: 200, flagged: 200, unflagged: 200 }],
      ['admin', () => adminToken, { public: 200, flagged: 200, unflagged: 200 }],
      [
        'uploader',
        () => uploaderToken,
        { public: 200, flagged: 200, unflagged: 200, pending: 200 },
      ],
    ];
    const boxOf = {
      public: publicName,
      flagged: flaggedName,
      unflagged: unflaggedName,
      pending: pendingName,
    };

    it.each(readCases)(
      'should answer the box, its levels and its file to %s',
      async (label, token, expected) => {
        void label;
        const results = await Promise.all(
          Object.entries(expected).map(async ([key, status]) => {
            const name = boxOf[key];
            const routes = [
              boxBase(name),
              `${boxBase(name)}/version`,
              `${boxBase(name)}/version/1.0.0`,
              `${boxBase(name)}/version/1.0.0/provider`,
              `${boxBase(name)}/version/1.0.0/provider/virtualbox`,
              `${boxBase(name)}/version/1.0.0/provider/virtualbox/architecture`,
              `${boxBase(name)}/version/1.0.0/provider/virtualbox/architecture/amd64`,
              `${fileBase(name)}/info`,
              `${fileBase(name)}/download`,
            ];
            const answers = await Promise.all(routes.map(route => get(route, token())));
            return [key, status, answers.map(answer => answer.statusCode)];
          })
        );
        results.forEach(([key, status, codes]) => {
          codes.forEach(code => expect([key, code]).toEqual([key, status]));
        });
      }
    );

    it('should hide a version narrower than the guest reach and never wider than its box', async () => {
      const box = await db.box.findOne({ where: { name: flaggedName, organizationId: org.id } });
      await db.versions.update(
        { isPublic: false, guestAccess: false },
        { where: { boxId: box.id } }
      );
      expect((await get(`${boxBase(flaggedName)}/version/1.0.0`, guestToken)).statusCode).toBe(404);
      const versions = await get(`${boxBase(flaggedName)}/version`, guestToken);
      expect(versions.body).toEqual([]);
      const page = await get(boxBase(flaggedName), guestToken);
      expect(page.body.versions).toEqual([]);
      expect((await get(`${fileBase(flaggedName)}/info`, guestToken)).statusCode).toBe(404);
      expect((await get(`${fileBase(flaggedName)}/download`, guestToken)).statusCode).toBe(404);
      const metadata = await request(app)
        .get(boxBase(flaggedName))
        .set('Authorization', `Bearer ${guestAccountKey}`)
        .set('User-Agent', 'Vagrant/2.3.4');
      expect(metadata.body.versions).toEqual([]);
      expect((await get(`${boxBase(flaggedName)}/version/1.0.0`, memberToken)).statusCode).toBe(
        200
      );
      const listed = await get(`/api/organization/${orgName}/box`, guestToken);
      expect(listed.body.find(entry => entry.name === flaggedName).versions).toEqual([]);

      const wider = await request(app)
        .put(`${boxBase(flaggedName)}/version/1.0.0`)
        .set('x-access-token', ownerToken)
        .send({ is_public: true });
      expect(wider.statusCode).toBe(422);
      expect(wider.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/is_public',
          rule: 'withinParent',
          params: { parent: 'guests' },
        }),
      ]);
      const allowed = await request(app)
        .post(`${boxBase(flaggedName)}/version/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'allow_guests', names: ['1.0.0'] });
      expect(allowed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await get(`${boxBase(flaggedName)}/version/1.0.0`, guestToken)).statusCode).toBe(200);

      await db.versions.update({ published: false }, { where: { boxId: box.id } });
      expect((await get(`${boxBase(flaggedName)}/version/1.0.0`, memberToken)).statusCode).toBe(
        404
      );
      expect((await get(`${boxBase(flaggedName)}/version/1.0.0`, ownerToken)).statusCode).toBe(200);
      const published = await request(app)
        .post(`${boxBase(flaggedName)}/version/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'publish', names: ['1.0.0'] });
      expect(published.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await get(`${boxBase(flaggedName)}/version/1.0.0`, memberToken)).statusCode).toBe(
        200
      );
    });

    it('should hide a provider, an architecture or a file narrower than the guest reach', async () => {
      const box = await db.box.findOne({ where: { name: flaggedName, organizationId: org.id } });
      const version = await db.versions.findOne({ where: { boxId: box.id } });
      const provider = await db.providers.findOne({ where: { versionId: version.id } });
      const architecture = await db.architectures.findOne({ where: { providerId: provider.id } });
      const providerUrl = `${boxBase(flaggedName)}/version/1.0.0/provider/virtualbox`;
      const architectureUrl = `${providerUrl}/architecture/amd64`;

      await db.files.update(
        { isPublic: false, guestAccess: false },
        { where: { architectureId: architecture.id } }
      );
      expect((await get(`${fileBase(flaggedName)}/info`, guestToken)).statusCode).toBe(404);
      expect((await get(`${fileBase(flaggedName)}/download`, guestToken)).statusCode).toBe(404);
      expect((await get(`${fileBase(flaggedName)}/info`, memberToken)).statusCode).toBe(200);
      const page = await get(boxBase(flaggedName), guestToken);
      expect(page.body.versions[0].providers[0].architectures[0].files).toEqual([]);
      await db.files.update({ guestAccess: true }, { where: { architectureId: architecture.id } });

      await db.architectures.update(
        { isPublic: false, guestAccess: false },
        { where: { id: architecture.id } }
      );
      expect((await get(architectureUrl, guestToken)).statusCode).toBe(404);
      expect((await get(`${providerUrl}/architecture`, guestToken)).body).toEqual([]);
      expect((await get(`${fileBase(flaggedName)}/download`, guestToken)).statusCode).toBe(404);
      expect((await get(architectureUrl, memberToken)).statusCode).toBe(200);
      await db.architectures.update({ guestAccess: true }, { where: { id: architecture.id } });

      await db.providers.update(
        { isPublic: false, guestAccess: false },
        { where: { id: provider.id } }
      );
      expect((await get(providerUrl, guestToken)).statusCode).toBe(404);
      expect(
        (await get(`${boxBase(flaggedName)}/version/1.0.0/provider`, guestToken)).body
      ).toEqual([]);
      expect((await get(architectureUrl, guestToken)).statusCode).toBe(404);
      const metadata = await request(app)
        .get(boxBase(flaggedName))
        .set('Authorization', `Bearer ${guestAccountKey}`)
        .set('User-Agent', 'Vagrant/2.3.4');
      expect(metadata.body.versions[0].providers).toEqual([]);
      expect((await get(providerUrl, memberToken)).statusCode).toBe(200);

      const wider = await request(app)
        .put(providerUrl)
        .set('x-access-token', ownerToken)
        .send({ is_public: true });
      expect(wider.statusCode).toBe(422);
      const allowed = await request(app)
        .post(`${boxBase(flaggedName)}/version/1.0.0/provider/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'allow_guests', names: ['virtualbox'] });
      expect(allowed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await get(providerUrl, guestToken)).statusCode).toBe(200);
    });

    it('should answer null counts to a guest and numbers to a member', async () => {
      const asGuest = await get(boxBase(flaggedName), guestToken);
      expect(asGuest.body.download_count).toBeNull();
      asGuest.body.versions.forEach(version =>
        version.providers.forEach(provider =>
          provider.architectures.forEach(architecture =>
            architecture.files.forEach(file => expect(file.download_count).toBeNull())
          )
        )
      );
      const guestInfo = await get(`${fileBase(flaggedName)}/info`, guestToken);
      expect(guestInfo.body.download_count).toBeNull();
      const guestList = await get(`/api/organization/${orgName}/box`, guestToken);
      guestList.body.forEach(entry => expect(entry.download_count).toBeNull());
      const guestPublic = await get(boxBase(publicName), guestAccountToken);
      expect(guestPublic.body.download_count).toBeNull();

      const asMember = await get(boxBase(flaggedName), memberToken);
      expect(typeof asMember.body.download_count).toBe('number');
      const memberInfo = await get(`${fileBase(flaggedName)}/info`, memberToken);
      expect(typeof memberInfo.body.download_count).toBe('number');
    });
  });

  describe('downloads and links', () => {
    it('should mint and follow a download link for a flagged box only', async () => {
      const link = await request(app)
        .post(`${fileBase(flaggedName)}/get-download-link`)
        .set('x-access-token', guestToken);
      expect(link.statusCode).toBe(200);
      const [, token] = link.body.download_url.split('token=');
      const followed = await request(app).get(`${fileBase(flaggedName)}/download?token=${token}`);
      expect(followed.statusCode).toBe(200);

      const refused = await request(app)
        .post(`${fileBase(unflaggedName)}/get-download-link`)
        .set('x-access-token', guestToken);
      expect(refused.statusCode).toBe(403);

      const accountLink = await request(app)
        .post(`${fileBase(flaggedName)}/get-download-link`)
        .set('x-access-token', guestAccountToken);
      expect(accountLink.statusCode).toBe(200);
      const [, accountToken] = accountLink.body.download_url.split('token=');
      const accountFollowed = await request(app).get(
        `${fileBase(flaggedName)}/download?token=${accountToken}`
      );
      expect(accountFollowed.statusCode).toBe(200);
      const accountRefused = await request(app)
        .post(`${fileBase(unflaggedName)}/get-download-link`)
        .set('x-access-token', guestAccountToken);
      expect(accountRefused.statusCode).toBe(403);
    });

    it('should serve Vagrant a flagged box with the guest key and refuse an unflagged one', async () => {
      const metadata = await request(app)
        .get(boxBase(flaggedName))
        .set('Authorization', `Bearer ${guestAccountKey}`)
        .set('User-Agent', 'Vagrant/2.3.4');
      expect(metadata.statusCode).toBe(200);
      expect(metadata.body.name).toBe(`${orgName}/${flaggedName}`);

      const served = await request(app)
        .get(`${fileBase(flaggedName)}/download`)
        .set('Authorization', `Bearer ${guestAccountKey}`)
        .set('User-Agent', 'Vagrant/2.3.4');
      expect(served.statusCode).toBe(200);

      const hidden = await request(app)
        .get(boxBase(unflaggedName))
        .set('Authorization', `Bearer ${guestAccountKey}`)
        .set('User-Agent', 'Vagrant/2.3.4');
      expect(hidden.statusCode).toBe(403);
      const refused = await request(app)
        .get(`${fileBase(unflaggedName)}/download`)
        .set('Authorization', `Bearer ${guestAccountKey}`)
        .set('User-Agent', 'Vagrant/2.3.4');
      expect(refused.statusCode).toBe(403);
    });

    it('should let a guest watch a flagged box and refuse an unflagged one', async () => {
      const watched = await request(app)
        .post(`${boxBase(flaggedName)}/watch`)
        .set('x-access-token', guestToken);
      expect(watched.statusCode).toBe(201);
      await request(app)
        .delete(`${boxBase(flaggedName)}/watch`)
        .set('x-access-token', guestToken);
      const refused = await request(app)
        .post(`${boxBase(unflaggedName)}/watch`)
        .set('x-access-token', guestToken);
      expect(refused.statusCode).toBe(403);
    });
  });

  describe('flag writes', () => {
    it('should open and close a box through bulk allow_guests and deny_guests', async () => {
      const allowed = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'allow_guests', names: [unflaggedName] });
      expect(allowed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await get(boxBase(unflaggedName), guestToken)).statusCode).toBe(200);
      expect((await get(`${fileBase(unflaggedName)}/download`, guestToken)).statusCode).toBe(200);

      const denied = await request(app)
        .post(`/api/organization/${orgName}/box/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'deny_guests', names: [unflaggedName] });
      expect(denied.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await get(boxBase(unflaggedName), guestToken)).statusCode).toBe(403);
      expect((await get(`${fileBase(unflaggedName)}/download`, guestToken)).statusCode).toBe(403);
    });

    it('should accept guest_access on update from the uploader and an admin, not a plain member', async () => {
      const asMember = await request(app)
        .put(boxBase(pendingName))
        .set('x-access-token', memberToken)
        .send({ guest_access: false });
      expect(asMember.statusCode).toBe(403);

      const asUploader = await request(app)
        .put(boxBase(pendingName))
        .set('x-access-token', uploaderToken)
        .send({ guest_access: false });
      expect(asUploader.statusCode).toBe(200);
      expect(asUploader.body.guest_access).toBe(false);

      const asAdmin = await request(app)
        .put(boxBase(pendingName))
        .set('x-access-token', adminToken)
        .send({ guest_access: true });
      expect(asAdmin.statusCode).toBe(200);
      expect(asAdmin.body.guest_access).toBe(true);

      const asGuest = await request(app)
        .put(boxBase(flaggedName))
        .set('x-access-token', guestToken)
        .send({ guest_access: false });
      expect(asGuest.statusCode).toBe(403);

      const notBoolean = await request(app)
        .put(boxBase(flaggedName))
        .set('x-access-token', adminToken)
        .send({ guest_access: 'yes' });
      expect(notBoolean.statusCode).toBe(422);
      expect(notBoolean.body.errors).toEqual([
        expect.objectContaining({ pointer: '/guest_access', rule: 'type' }),
      ]);
    });

    it('should create a box open to guests only on an explicit true', async () => {
      const created = await request(app)
        .post(`/api/organization/${orgName}/box`)
        .set('x-access-token', memberToken)
        .send({ name: `bg-created-${uniqueId}`, published: true, guest_access: true });
      expect(created.statusCode).toBe(201);
      expect(created.body.guest_access).toBe(true);
      expect((await get(boxBase(`bg-created-${uniqueId}`), guestToken)).statusCode).toBe(200);

      const defaulted = await request(app)
        .post(`/api/organization/${orgName}/box`)
        .set('x-access-token', memberToken)
        .send({ name: `bg-defaulted-${uniqueId}`, published: true });
      expect(defaulted.statusCode).toBe(201);
      expect(defaulted.body.guest_access).toBe(false);
      expect((await get(boxBase(`bg-defaulted-${uniqueId}`), guestToken)).statusCode).toBe(403);
    });
  });

  describe('search', () => {
    it('should answer a guest the flagged box and never the unflagged one', async () => {
      const res = await request(app)
        .get('/api/search')
        .query({ q: `bg-`, kinds: 'item' })
        .set('x-access-token', guestToken);
      expect(res.statusCode).toBe(200);
      const names = res.body.results.map(row => row.name);
      expect(names).toContain(publicName);
      expect(names).toContain(flaggedName);
      expect(names).not.toContain(unflaggedName);
      expect(names).not.toContain(pendingName);
    });
  });
});
