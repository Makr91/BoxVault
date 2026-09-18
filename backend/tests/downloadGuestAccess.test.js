import request from 'supertest';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureDownloadPath } from '../app/controllers/download/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const basic = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

describe('Download guest access', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `DlGuestOrg_${uniqueId}`;
  const publicName = `dg-public-${uniqueId}`;
  const flaggedName = `dg-flagged-${uniqueId}`;
  const unflaggedName = `dg-unflagged-${uniqueId}`;
  const pendingName = `dg-pending-${uniqueId}`;
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
  let guestAccountUsername;
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

  const productBase = name => `/api/organization/${orgName}/download/${name}`;
  const patchBase = name => `${productBase(name)}/release/1.0.0/patch/release`;
  const fileBase = name => `${patchBase(name)}/file/linux-x64`;

  const createProduct = async (name, values) => {
    await request(app)
      .post(`${fileBase(name)}/upload`)
      .set('x-access-token', ownerToken)
      .set('Content-Type', 'application/octet-stream')
      .set('x-file-name', `${name}.tar`)
      .send(Buffer.from(`${name}-${uniqueId}`))
      .expect(200);
    await db.download.update(values, { where: { name, organizationId: org.id } });
  };

  const get = (url, token) => {
    const req = request(app).get(url);
    return token ? req.set('x-access-token', token) : req;
  };

  const listedNames = async token => {
    const res = await get(`/api/organization/${orgName}/download`, token);
    expect(res.statusCode).toBe(200);
    return res.body.map(entry => entry.name);
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await createUser('dg-owner', 'owner');
    admin = await createUser('dg-admin', 'admin');
    member = await createUser('dg-member', 'member');
    uploader = await createUser('dg-uploader', 'member');
    guest = await createUser('dg-guest', 'guest');
    ownerToken = signFor(owner);
    adminToken = signFor(admin);
    memberToken = signFor(member);
    uploaderToken = signFor(uploader);
    guestToken = signFor(guest);

    const minted = await request(app)
      .post('/api/service-accounts')
      .set('x-access-token', memberToken)
      .send({
        description: 'Guest key',
        expiration_days: 30,
        organization_id: org.id,
        role: 'guest',
      });
    expect(minted.statusCode).toBe(201);
    guestAccountId = minted.body.id;
    guestAccountUsername = minted.body.username;
    guestAccountKey = minted.body.token;
    guestAccountToken = jwt.sign(
      { id: member.id, isServiceAccount: true, serviceAccountId: guestAccountId },
      'test-secret',
      { expiresIn: '1h', ...TEST_JWT_CLAIMS }
    );

    await createProduct(publicName, { isPublic: true, published: true });
    await createProduct(flaggedName, { isPublic: false, published: true, guestAccess: true });
    await createProduct(unflaggedName, { isPublic: false, published: true });
    await createProduct(pendingName, {
      isPublic: false,
      published: false,
      guestAccess: true,
      userId: uploader.id,
    });
  });

  afterAll(async () => {
    await db.service_account.destroy({ where: { id: guestAccountId } });
    await db.download.destroy({ where: { organizationId: org.id } });
    await db.UserOrg.destroy({ where: { organization_id: org.id } });
    await org.destroy();
    await db.user.destroy({
      where: { id: [owner.id, admin.id, member.id, uploader.id, guest.id] },
    });
    fs.rmSync(getSecureDownloadPath(orgName), { recursive: true, force: true });
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
        .get(`/api/organization/${orgName}/download`)
        .set('Authorization', `Bearer ${guestAccountKey}`);
      expect(byKey.body.map(entry => entry.name).sort()).toEqual([flaggedName, publicName].sort());
      byKey.body.forEach(entry => expect(entry.downloadCount).toBeNull());
    });

    it('should discover by role', async () => {
      const asGuest = await get('/api/downloads/discover', guestToken);
      const guestNames = asGuest.body.map(entry => entry.name);
      expect(guestNames).toContain(flaggedName);
      expect(guestNames).not.toContain(unflaggedName);
      expect(guestNames).not.toContain(pendingName);
      asGuest.body
        .filter(entry => entry.organizationId === org.id)
        .forEach(entry => expect(entry.downloadCount).toBeNull());

      const asMember = await get('/api/downloads/discover', memberToken);
      expect(asMember.body.map(entry => entry.name)).toContain(unflaggedName);
      expect(asMember.body.find(entry => entry.name === flaggedName).downloadCount).toBe(0);
      const asUploader = await get('/api/downloads/discover', uploaderToken);
      expect(asUploader.body.map(entry => entry.name)).toContain(pendingName);
    });
  });

  describe('single reads', () => {
    const productOf = {
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
      'should answer the product, its levels and its file to %s',
      async (label, token, expected) => {
        void label;
        const results = await Promise.all(
          Object.entries(expected).map(async ([key, status]) => {
            const name = productOf[key];
            const routes = [
              productBase(name),
              `${productBase(name)}/release`,
              `${productBase(name)}/release/1.0.0`,
              `${productBase(name)}/release/1.0.0/patch`,
              patchBase(name),
              `${patchBase(name)}/file`,
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

    it('should answer null counts to a guest everywhere and numbers to a member', async () => {
      const product = await get(productBase(flaggedName), guestToken);
      expect(product.body.downloadCount).toBeNull();
      product.body.releases.forEach(release =>
        release.patches.forEach(patch =>
          patch.files.forEach(file => expect(file.downloadCount).toBeNull())
        )
      );
      const releases = await get(`${productBase(flaggedName)}/release`, guestAccountToken);
      releases.body.forEach(release =>
        release.patches.forEach(patch =>
          patch.files.forEach(file => expect(file.downloadCount).toBeNull())
        )
      );
      const patches = await get(`${productBase(flaggedName)}/release/1.0.0/patch`, guestToken);
      patches.body.forEach(patch =>
        patch.files.forEach(file => expect(file.downloadCount).toBeNull())
      );
      const files = await get(`${patchBase(flaggedName)}/file`, guestToken);
      files.body.forEach(file => expect(file.downloadCount).toBeNull());
      const info = await get(`${fileBase(flaggedName)}/info`, guestToken);
      expect(info.body.downloadCount).toBeNull();
      const publicInfo = await get(`${fileBase(publicName)}/info`, guestAccountToken);
      expect(publicInfo.body.downloadCount).toBeNull();

      const asMember = await get(productBase(flaggedName), memberToken);
      expect(typeof asMember.body.downloadCount).toBe('number');
      const memberInfo = await get(`${fileBase(flaggedName)}/info`, memberToken);
      expect(typeof memberInfo.body.downloadCount).toBe('number');
    });
  });

  describe('downloads and links', () => {
    it('should mint and follow a download link for a flagged product only', async () => {
      const link = await request(app)
        .post(`${fileBase(flaggedName)}/get-download-link`)
        .set('x-access-token', guestToken);
      expect(link.statusCode).toBe(200);
      const [, token] = link.body.downloadUrl.split('token=');
      expect(
        (await request(app).get(`${fileBase(flaggedName)}/download?token=${token}`)).statusCode
      ).toBe(200);

      const refused = await request(app)
        .post(`${fileBase(unflaggedName)}/get-download-link`)
        .set('x-access-token', guestToken);
      expect(refused.statusCode).toBe(403);

      const accountLink = await request(app)
        .post(`${fileBase(flaggedName)}/get-download-link`)
        .set('x-access-token', guestAccountToken);
      expect(accountLink.statusCode).toBe(200);
      const accountRefused = await request(app)
        .post(`${fileBase(unflaggedName)}/get-download-link`)
        .set('x-access-token', guestAccountToken);
      expect(accountRefused.statusCode).toBe(403);
    });

    it('should serve the guest key as Bearer and as Basic on a flagged product only', async () => {
      const bearer = await request(app)
        .get(`${fileBase(flaggedName)}/download`)
        .set('Authorization', `Bearer ${guestAccountKey}`);
      expect(bearer.statusCode).toBe(200);
      const bearerRefused = await request(app)
        .get(`${fileBase(unflaggedName)}/download`)
        .set('Authorization', `Bearer ${guestAccountKey}`);
      expect(bearerRefused.statusCode).toBe(403);

      const basicAuth = await request(app)
        .get(`${fileBase(flaggedName)}/download`)
        .set('Authorization', basic(guestAccountUsername, guestAccountKey));
      expect(basicAuth.statusCode).toBe(200);
      const basicRefused = await request(app)
        .get(`${fileBase(unflaggedName)}/download`)
        .set('Authorization', basic(guestAccountUsername, guestAccountKey));
      expect(basicRefused.statusCode).toBe(403);
    });

    it('should let a guest watch a flagged product and refuse an unflagged one', async () => {
      const watched = await request(app)
        .post(`${productBase(flaggedName)}/watch`)
        .set('x-access-token', guestToken);
      expect(watched.statusCode).toBe(201);
      await request(app)
        .delete(`${productBase(flaggedName)}/watch`)
        .set('x-access-token', guestToken);
      const refused = await request(app)
        .post(`${productBase(unflaggedName)}/watch`)
        .set('x-access-token', guestToken);
      expect(refused.statusCode).toBe(403);
    });
  });

  describe('flag writes', () => {
    it('should open and close a product through bulk allow_guests and deny_guests', async () => {
      const asMember = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', memberToken)
        .send({ action: 'allow_guests', names: [unflaggedName] });
      expect(asMember.body).toEqual({
        processed: 0,
        skipped: 1,
        errors: [{ name: unflaggedName, code: 'forbidden' }],
      });

      const allowed = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', adminToken)
        .send({ action: 'allow_guests', names: [unflaggedName] });
      expect(allowed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await get(productBase(unflaggedName), guestToken)).statusCode).toBe(200);
      expect((await get(`${fileBase(unflaggedName)}/download`, guestToken)).statusCode).toBe(200);

      const denied = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'deny_guests', names: [unflaggedName] });
      expect(denied.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await get(productBase(unflaggedName), guestToken)).statusCode).toBe(403);
      expect((await get(`${fileBase(unflaggedName)}/download`, guestToken)).statusCode).toBe(403);
    });

    it('should accept guest_access on update from the uploader and an admin, not a plain member', async () => {
      const asMember = await request(app)
        .put(productBase(pendingName))
        .set('x-access-token', memberToken)
        .send({ guest_access: false });
      expect(asMember.statusCode).toBe(403);

      const asUploader = await request(app)
        .put(productBase(pendingName))
        .set('x-access-token', uploaderToken)
        .send({ guest_access: false });
      expect(asUploader.statusCode).toBe(200);
      expect(asUploader.body.guestAccess).toBe(false);

      const asAdmin = await request(app)
        .put(productBase(pendingName))
        .set('x-access-token', adminToken)
        .send({ guest_access: true });
      expect(asAdmin.statusCode).toBe(200);
      expect(asAdmin.body.guestAccess).toBe(true);

      const asGuest = await request(app)
        .put(productBase(flaggedName))
        .set('x-access-token', guestToken)
        .send({ guest_access: false });
      expect(asGuest.statusCode).toBe(403);

      const notBoolean = await request(app)
        .put(productBase(flaggedName))
        .set('x-access-token', adminToken)
        .send({ guest_access: 'yes' });
      expect(notBoolean.statusCode).toBe(422);
      expect(notBoolean.body.errors).toEqual([
        expect.objectContaining({ pointer: '/guest_access', rule: 'type' }),
      ]);
    });

    it('should create a product open to guests only on an explicit true', async () => {
      const created = await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken)
        .send({ name: `dg-created-${uniqueId}`, published: true, guest_access: true });
      expect(created.statusCode).toBe(201);
      expect(created.body.guestAccess).toBe(true);
      expect((await get(productBase(`dg-created-${uniqueId}`), guestToken)).statusCode).toBe(200);

      const defaulted = await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken)
        .send({ name: `dg-defaulted-${uniqueId}`, published: true });
      expect(defaulted.statusCode).toBe(201);
      expect(defaulted.body.guestAccess).toBe(false);
      expect((await get(productBase(`dg-defaulted-${uniqueId}`), guestToken)).statusCode).toBe(403);

      const dropped = await request(app)
        .post(`/api/organization/${orgName}/download/file/upload?guest_access=true`)
        .set('x-access-token', memberToken)
        .set('Content-Type', 'application/octet-stream')
        .set('x-file-name', 'Dropped_2.0.0_Linux.tar')
        .send(Buffer.from(`dropped-${uniqueId}`));
      expect(dropped.statusCode).toBe(200);
      const droppedProduct = await db.download.findOne({
        where: { name: 'dropped', organizationId: org.id },
      });
      expect(droppedProduct.guestAccess).toBe(true);
      expect(droppedProduct.published).toBe(false);
    });
  });

  describe('search', () => {
    it('should answer a guest the flagged product and never the unflagged one', async () => {
      const res = await request(app)
        .get('/api/search')
        .query({ q: 'dg-', kinds: 'item' })
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
