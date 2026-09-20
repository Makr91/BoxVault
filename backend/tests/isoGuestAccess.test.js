import request from 'supertest';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getIsoStorageRoot } from '../app/controllers/iso/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('ISO guest access', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `IsoGuestOrg_${uniqueId}`;
  const publicName = `ig-public-${uniqueId}`;
  const flaggedName = `ig-flagged-${uniqueId}`;
  const unflaggedName = `ig-unflagged-${uniqueId}`;
  const pendingName = `ig-pending-${uniqueId}`;
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

  const isoBase = name => `/api/organization/${orgName}/iso/${name}`;
  const fileBase = name => `${isoBase(name)}/version/1.0.0/architecture/amd64/file`;

  const createIso = async (name, values) => {
    const iso = await db.iso.create({
      name,
      description: name,
      organizationId: org.id,
      userId: owner.id,
      ...values,
    });
    await db.isoVersions.create({ versionNumber: '1.0.0', isoId: iso.id });
    await request(app)
      .post(`${fileBase(name)}/upload`)
      .set('x-access-token', ownerToken)
      .set('x-file-name', `${name}.iso`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from(`${name}-${uniqueId}`))
      .expect(201);
    return iso;
  };

  const get = (url, token) => {
    const req = request(app).get(url);
    return token ? req.set('x-access-token', token) : req;
  };

  const listedNames = async token => {
    const res = await get(`/api/organization/${orgName}/iso`, token);
    expect(res.statusCode).toBe(200);
    return res.body.map(entry => entry.name);
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    const isoRoot = getIsoStorageRoot();
    if (!fs.existsSync(isoRoot)) {
      fs.mkdirSync(isoRoot, { recursive: true });
    }
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await createUser('ig-owner', 'owner');
    admin = await createUser('ig-admin', 'admin');
    member = await createUser('ig-member', 'member');
    uploader = await createUser('ig-uploader', 'member');
    guest = await createUser('ig-guest', 'guest');
    ownerToken = signFor(owner);
    adminToken = signFor(admin);
    memberToken = signFor(member);
    uploaderToken = signFor(uploader);
    guestToken = signFor(guest);

    const minted = await request(app)
      .post('/api/service-accounts')
      .set('x-access-token', adminToken)
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
      { id: admin.id, is_service_account: true, service_account_id: guestAccountId },
      'test-secret',
      { expiresIn: '1h', ...TEST_JWT_CLAIMS }
    );

    await createIso(publicName, { isPublic: true, published: true });
    await createIso(flaggedName, { isPublic: false, published: true, guestAccess: true });
    await createIso(unflaggedName, { isPublic: false, published: true });
    await createIso(pendingName, {
      isPublic: false,
      published: false,
      guestAccess: true,
      userId: uploader.id,
    });
  });

  afterAll(async () => {
    await db.service_account.destroy({ where: { id: guestAccountId } });
    await db.iso.destroy({ where: { organizationId: org.id } });
    await db.UserOrg.destroy({ where: { organization_id: org.id } });
    await org.destroy();
    await db.user.destroy({
      where: { id: [owner.id, admin.id, member.id, uploader.id, guest.id] },
    });
  });

  describe('lists', () => {
    it('should list by role', async () => {
      expect(await listedNames()).toEqual([publicName]);
      expect((await listedNames(guestToken)).sort()).toEqual([flaggedName, publicName].sort());
      expect((await listedNames(guestAccountToken)).sort()).toEqual(
        [flaggedName, publicName].sort()
      );
      expect((await listedNames(memberToken)).sort()).toEqual(
        [flaggedName, publicName, unflaggedName].sort()
      );
      expect((await listedNames(adminToken)).sort()).toEqual(
        [flaggedName, publicName, unflaggedName].sort()
      );
      expect((await listedNames(uploaderToken)).sort()).toEqual(
        [flaggedName, pendingName, publicName, unflaggedName].sort()
      );

      const byKey = await request(app)
        .get(`/api/organization/${orgName}/iso`)
        .set('Authorization', `Bearer ${guestAccountKey}`);
      expect(byKey.body.map(entry => entry.name).sort()).toEqual([flaggedName, publicName].sort());
    });

    it('should discover by role', async () => {
      const asGuest = await get('/api/isos/discover', guestToken);
      const guestNames = asGuest.body.map(entry => entry.name);
      expect(guestNames).toContain(flaggedName);
      expect(guestNames).not.toContain(unflaggedName);
      expect(guestNames).not.toContain(pendingName);
      asGuest.body
        .filter(entry => entry.organization_id === org.id)
        .forEach(entry => expect(entry.download_count).toBeNull());

      const asMember = await get('/api/isos/discover', memberToken);
      expect(asMember.body.map(entry => entry.name)).toContain(unflaggedName);
      const asUploader = await get('/api/isos/discover', uploaderToken);
      expect(asUploader.body.map(entry => entry.name)).toContain(pendingName);
    });
  });

  describe('single reads', () => {
    const isoOf = {
      public: publicName,
      flagged: flaggedName,
      unflagged: unflaggedName,
      pending: pendingName,
    };
    const readCases = [
      ['anonymous', () => undefined, { public: 200, flagged: 403, unflagged: 403, pending: 403 }],
      ['guest', () => guestToken, { public: 200, flagged: 200, unflagged: 403, pending: 403 }],
      [
        'guest account',
        () => guestAccountToken,
        { public: 200, flagged: 200, unflagged: 403, pending: 403 },
      ],
      ['member', () => memberToken, { public: 200, flagged: 200, unflagged: 200, pending: 403 }],
      ['admin', () => adminToken, { public: 200, flagged: 200, unflagged: 200, pending: 403 }],
      [
        'uploader',
        () => uploaderToken,
        { public: 200, flagged: 200, unflagged: 200, pending: 200 },
      ],
    ];

    it.each(readCases)(
      'should answer the ISO, its versions and its file to %s',
      async (label, token, expected) => {
        void label;
        const results = await Promise.all(
          Object.entries(expected).map(async ([key, status]) => {
            const name = isoOf[key];
            const routes = [
              isoBase(name),
              `${isoBase(name)}/version`,
              `${isoBase(name)}/version/1.0.0`,
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

    it('should hide a version narrower than the guest reach and never wider than its ISO', async () => {
      const iso = await db.iso.findOne({ where: { name: flaggedName, organizationId: org.id } });
      await db.isoVersions.update(
        { isPublic: false, guestAccess: false },
        { where: { isoId: iso.id } }
      );
      expect((await get(`${isoBase(flaggedName)}/version/1.0.0`, guestToken)).statusCode).toBe(404);
      expect((await get(`${isoBase(flaggedName)}/version`, guestToken)).body).toEqual([]);
      expect((await get(isoBase(flaggedName), guestToken)).body.versions).toEqual([]);
      expect((await get(`${fileBase(flaggedName)}/info`, guestToken)).statusCode).toBe(404);
      expect((await get(`${fileBase(flaggedName)}/download`, guestToken)).statusCode).toBe(404);
      expect((await get(`${isoBase(flaggedName)}/version/1.0.0`, memberToken)).statusCode).toBe(
        200
      );

      const wider = await request(app)
        .put(`${isoBase(flaggedName)}/version/1.0.0`)
        .set('x-access-token', adminToken)
        .send({ is_public: true });
      expect(wider.statusCode).toBe(422);
      expect(wider.body.errors).toEqual([
        expect.objectContaining({ pointer: '/is_public', rule: 'enum', params: { enum: 'false' } }),
      ]);
      const allowed = await request(app)
        .post(`${isoBase(flaggedName)}/version/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'allow_guests', names: ['1.0.0'] });
      expect(allowed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await get(`${isoBase(flaggedName)}/version/1.0.0`, guestToken)).statusCode).toBe(200);

      await db.isoVersions.update({ published: false }, { where: { isoId: iso.id } });
      expect((await get(`${isoBase(flaggedName)}/version/1.0.0`, memberToken)).statusCode).toBe(
        404
      );
      expect((await get(`${isoBase(flaggedName)}/version/1.0.0`, adminToken)).statusCode).toBe(200);
      await db.isoVersions.update({ published: true }, { where: { isoId: iso.id } });
    });

    it('should answer null counts to a guest and numbers to a member', async () => {
      const asGuest = await get(isoBase(flaggedName), guestToken);
      expect(asGuest.body.download_count).toBeNull();
      asGuest.body.versions.forEach(version =>
        version.files.forEach(file => expect(file.download_count).toBeNull())
      );
      const versions = await get(`${isoBase(flaggedName)}/version`, guestAccountToken);
      versions.body.forEach(version =>
        version.files.forEach(file => expect(file.download_count).toBeNull())
      );
      const version = await get(`${isoBase(flaggedName)}/version/1.0.0`, guestToken);
      version.body.files.forEach(file => expect(file.download_count).toBeNull());
      const info = await get(`${fileBase(flaggedName)}/info`, guestToken);
      expect(info.body.download_count).toBeNull();
      const publicInfo = await get(`${fileBase(publicName)}/info`, guestToken);
      expect(publicInfo.body.download_count).toBeNull();

      const asMember = await get(isoBase(flaggedName), memberToken);
      expect(typeof asMember.body.download_count).toBe('number');
      const memberInfo = await get(`${fileBase(flaggedName)}/info`, memberToken);
      expect(typeof memberInfo.body.download_count).toBe('number');
    });
  });

  describe('downloads and links', () => {
    it('should mint and follow a download link for a flagged ISO only', async () => {
      const link = await request(app)
        .post(`${fileBase(flaggedName)}/get-download-link`)
        .set('x-access-token', guestToken);
      expect(link.statusCode).toBe(200);
      const [, token] = link.body.download_url.split('token=');
      expect(
        (await request(app).get(`${fileBase(flaggedName)}/download?token=${token}`)).statusCode
      ).toBe(200);

      const refused = await request(app)
        .post(`${fileBase(unflaggedName)}/get-download-link`)
        .set('x-access-token', guestToken);
      expect(refused.statusCode).toBe(403);

      const byKey = await request(app)
        .get(`${fileBase(flaggedName)}/download`)
        .set('Authorization', `Bearer ${guestAccountKey}`);
      expect(byKey.statusCode).toBe(200);
      const keyRefused = await request(app)
        .get(`${fileBase(unflaggedName)}/download`)
        .set('Authorization', `Bearer ${guestAccountKey}`);
      expect(keyRefused.statusCode).toBe(403);

      const accountLink = await request(app)
        .post(`${fileBase(flaggedName)}/get-download-link`)
        .set('x-access-token', guestAccountToken);
      expect(accountLink.statusCode).toBe(200);
      const accountRefused = await request(app)
        .post(`${fileBase(unflaggedName)}/get-download-link`)
        .set('x-access-token', guestAccountToken);
      expect(accountRefused.statusCode).toBe(403);
    });

    it('should let a guest watch a flagged ISO and refuse an unflagged one', async () => {
      const watched = await request(app)
        .post(`${isoBase(flaggedName)}/watch`)
        .set('x-access-token', guestToken);
      expect(watched.statusCode).toBe(201);
      await request(app)
        .delete(`${isoBase(flaggedName)}/watch`)
        .set('x-access-token', guestToken);
      const refused = await request(app)
        .post(`${isoBase(unflaggedName)}/watch`)
        .set('x-access-token', guestToken);
      expect(refused.statusCode).toBe(403);
    });
  });

  describe('flag writes', () => {
    it('should open and close an ISO through bulk allow_guests and deny_guests', async () => {
      const asMember = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'allow_guests', names: [unflaggedName] });
      expect(asMember.statusCode).toBe(403);

      const allowed = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'allow_guests', names: [unflaggedName] });
      expect(allowed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await get(isoBase(unflaggedName), guestToken)).statusCode).toBe(200);
      expect((await get(`${fileBase(unflaggedName)}/download`, guestToken)).statusCode).toBe(200);

      const denied = await request(app)
        .post(`/api/organization/${orgName}/iso/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'deny_guests', names: [unflaggedName] });
      expect(denied.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await get(isoBase(unflaggedName), guestToken)).statusCode).toBe(403);
      expect((await get(`${fileBase(unflaggedName)}/download`, guestToken)).statusCode).toBe(403);
    });

    it('should accept guest_access on update from an admin only', async () => {
      const asMember = await request(app)
        .put(isoBase(flaggedName))
        .set('x-access-token', memberToken)
        .send({ guest_access: false });
      expect(asMember.statusCode).toBe(403);
      const asGuest = await request(app)
        .put(isoBase(flaggedName))
        .set('x-access-token', guestToken)
        .send({ guest_access: false });
      expect(asGuest.statusCode).toBe(403);

      const closed = await request(app)
        .put(isoBase(flaggedName))
        .set('x-access-token', adminToken)
        .send({ guest_access: false });
      expect(closed.statusCode).toBe(200);
      expect(closed.body.guest_access).toBe(false);
      expect((await get(isoBase(flaggedName), guestToken)).statusCode).toBe(403);

      const opened = await request(app)
        .put(isoBase(flaggedName))
        .set('x-access-token', adminToken)
        .send({ guest_access: true });
      expect(opened.body.guest_access).toBe(true);
      expect((await get(isoBase(flaggedName), guestToken)).statusCode).toBe(200);

      const notBoolean = await request(app)
        .put(isoBase(flaggedName))
        .set('x-access-token', adminToken)
        .send({ guest_access: 'yes' });
      expect(notBoolean.statusCode).toBe(422);
    });

    it('should create an ISO open to guests only on an explicit true', async () => {
      const created = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send({ name: `ig-created-${uniqueId}`, guest_access: true });
      expect(created.statusCode).toBe(201);
      expect(created.body.guest_access).toBe(true);
      expect((await get(isoBase(`ig-created-${uniqueId}`), guestToken)).statusCode).toBe(200);

      const defaulted = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', adminToken)
        .send({ name: `ig-defaulted-${uniqueId}` });
      expect(defaulted.statusCode).toBe(201);
      expect(defaulted.body.guest_access).toBe(false);
      expect((await get(isoBase(`ig-defaulted-${uniqueId}`), guestToken)).statusCode).toBe(403);
    });
  });

  describe('search', () => {
    it('should answer a guest the flagged ISO and never the unflagged one', async () => {
      const res = await request(app)
        .get('/api/search')
        .query({ q: 'ig-', kinds: 'item' })
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
