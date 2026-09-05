import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { runNotificationSweeps } from '../app/utils/notificationSweeps.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };
const DAY_MS = 24 * 60 * 60 * 1000;

const settle = () =>
  new Promise(resolve => {
    setTimeout(resolve, 250);
  });

const failing = (model, method) =>
  jest.spyOn(model, method).mockRejectedValueOnce(new Error('database down'));

describe('Database failures answer 500 and never crash the request', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `ErrOrg-${uniqueId}`;
  const openOrgName = `ErrOpen-${uniqueId}`;
  const boxName = `err-box-${uniqueId}`;
  const isoName = `err-iso-${uniqueId}`;
  const draftName = `err-draft-${uniqueId}`;
  let admin;
  let org;
  let openOrg;
  let owner;
  let outsider;
  let ownerToken;
  let outsiderToken;
  let box;
  let iso;
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
    if (orgRole) {
      await db.UserOrg.create({ user_id: account.id, organization_id: org.id, role: orgRole });
    }
    return account;
  };

  const boxUrl = (suffix = '') => `/api/organization/${orgName}/box/${boxName}${suffix}`;
  const isoUrl = (name, suffix = '') => `/api/organization/${orgName}/iso/${name}${suffix}`;
  const isoFileUrl = suffix => isoUrl(isoName, `/version/1.0.0/architecture/amd64/file/${suffix}`);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    admin = await db.user.findOne({ where: { username: 'SomeUser' } });
    org = await db.organization.create({ name: orgName });
    openOrg = await db.organization.create({ name: openOrgName, access_mode: 'request_to_join' });
    owner = await createUser('err-owner', 'owner');
    outsider = await createUser('err-outsider', null);
    ownerToken = signFor(owner);
    outsiderToken = signFor(outsider);
    await db.UserOrg.create({ user_id: owner.id, organization_id: openOrg.id, role: 'owner' });
    await db.credential.create({
      user_id: owner.id,
      provider: 'https://err-idp.example',
      subject: `err-owner-${uniqueId}`,
      external_email: owner.email,
    });
    box = await db.box.create({
      name: boxName,
      description: 'box',
      isPublic: true,
      published: true,
      organizationId: org.id,
      userId: owner.id,
    });
    const version = await db.versions.create({ versionNumber: '1.0.0', boxId: box.id });
    const provider = await db.providers.create({ name: 'virtualbox', versionId: version.id });
    await db.architectures.create({ name: 'amd64', providerId: provider.id });
    iso = await db.iso.create({
      name: isoName,
      description: 'iso',
      isPublic: true,
      published: true,
      organizationId: org.id,
      userId: owner.id,
    });
    await db.isoVersions.create({ versionNumber: '1.0.0', isoId: iso.id });
    draftIso = await db.iso.create({
      name: draftName,
      description: 'draft',
      isPublic: false,
      published: false,
      organizationId: org.id,
      userId: owner.id,
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await db.Request.destroy({ where: { organization_id: openOrg.id } });
    await db.invitation.destroy({ where: { organizationId: org.id } });
    await db.iso.destroy({ where: { organizationId: org.id } });
    await db.box.destroy({ where: { organizationId: org.id } });
    await db.organization.destroy({ where: { id: [org.id, openOrg.id] } });
    await db.user.destroy({ where: { id: [owner.id, outsider.id] } });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('box watches, badges and artwork', () => {
    it('should answer 500 when the watch table fails', async () => {
      failing(db.boxWatcher, 'findOrCreate');
      const watch = await request(app).post(boxUrl('/watch')).set('x-access-token', ownerToken);
      expect(watch.statusCode).toBe(500);
      failing(db.boxWatcher, 'destroy');
      const unwatch = await request(app).delete(boxUrl('/watch')).set('x-access-token', ownerToken);
      expect(unwatch.statusCode).toBe(500);
      failing(db.boxWatcher, 'findAll');
      const list = await request(app).get('/api/user/watches').set('x-access-token', ownerToken);
      expect(list.statusCode).toBe(500);
    });

    it('should answer 500 when the badge lookup fails', async () => {
      failing(db.organization, 'findOne');
      const res = await request(app).get(`/badge/${orgName}/${boxName}.svg`);
      expect(res.statusCode).toBe(500);
      expect(res.text).toBe('Internal Server Error');
    });

    it('should answer 500 when the artwork lookups fail', async () => {
      failing(db.box, 'findOne');
      const upload = await request(app)
        .post(boxUrl('/artwork'))
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('png'));
      expect(upload.statusCode).toBe(500);
      failing(db.organization, 'findOne');
      const fetch = await request(app).get(boxUrl('/artwork'));
      expect(fetch.statusCode).toBe(500);
    });
  });

  describe('ISO routes', () => {
    it('should answer 500 when the ISO watch table fails', async () => {
      failing(db.isoWatcher, 'findOrCreate');
      const watch = await request(app)
        .post(isoUrl(isoName, '/watch'))
        .set('x-access-token', ownerToken);
      expect(watch.statusCode).toBe(500);
      failing(db.isoWatcher, 'destroy');
      const unwatch = await request(app)
        .delete(isoUrl(isoName, '/watch'))
        .set('x-access-token', ownerToken);
      expect(unwatch.statusCode).toBe(500);
      failing(db.isoWatcher, 'findAll');
      const list = await request(app)
        .get('/api/user/iso-watches')
        .set('x-access-token', ownerToken);
      expect(list.statusCode).toBe(500);
    });

    it('should answer 500 when creating, checking or deleting ISOs fails', async () => {
      failing(db.iso, 'findOne');
      const duplicate = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', ownerToken)
        .send({ name: `fresh-${uniqueId}` });
      expect(duplicate.statusCode).toBe(500);
      failing(db.iso, 'create');
      const create = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', ownerToken)
        .send({ name: `fresh-${uniqueId}` });
      expect(create.statusCode).toBe(500);
      failing(db.iso, 'findAll');
      const deleteAll = await request(app)
        .delete(`/api/organization/${orgName}/iso`)
        .set('x-access-token', ownerToken);
      expect(deleteAll.statusCode).toBe(500);
    });

    it('should still publish when the watcher fan-out fails', async () => {
      failing(db.isoWatcher, 'findAll');
      const res = await request(app)
        .put(isoUrl(draftName))
        .set('x-access-token', ownerToken)
        .send({ published: true });
      expect(res.statusCode).toBe(200);
      await settle();
      await draftIso.update({ published: false });
    });

    it('should answer 500 when the version table fails', async () => {
      failing(db.organization, 'findOne');
      const attach = await request(app).get(isoUrl(isoName, '/version'));
      expect(attach.statusCode).toBe(500);
      failing(db.isoVersions, 'findAll');
      const list = await request(app).get(isoUrl(isoName, '/version'));
      expect(list.statusCode).toBe(500);
      failing(db.isoVersions, 'findOne');
      const one = await request(app).get(isoUrl(isoName, '/version/1.0.0'));
      expect(one.statusCode).toBe(500);
      failing(db.isoVersions, 'findOne');
      const duplicate = await request(app)
        .post(isoUrl(isoName, '/version'))
        .set('x-access-token', ownerToken)
        .send({ versionNumber: '2.0.0' });
      expect(duplicate.statusCode).toBe(500);
      failing(db.isoVersions, 'create');
      const create = await request(app)
        .post(isoUrl(isoName, '/version'))
        .set('x-access-token', ownerToken)
        .send({ versionNumber: '2.0.0' });
      expect(create.statusCode).toBe(500);
      failing(db.isoVersions, 'findOne');
      const update = await request(app)
        .put(isoUrl(isoName, '/version/1.0.0'))
        .set('x-access-token', ownerToken)
        .send({ description: 'x' });
      expect(update.statusCode).toBe(500);
      failing(db.isoVersions, 'findOne');
      const remove = await request(app)
        .delete(isoUrl(isoName, '/version/1.0.0'))
        .set('x-access-token', ownerToken);
      expect(remove.statusCode).toBe(500);
    });

    it('should answer 500 when the file table fails', async () => {
      failing(db.organization, 'findOne');
      const path = await request(app).get(isoFileUrl('info'));
      expect(path.statusCode).toBe(500);
      failing(db.isoFiles, 'findOne');
      const info = await request(app).get(isoFileUrl('info'));
      expect(info.statusCode).toBe(500);
      failing(db.service_account, 'findOne');
      const link = await request(app)
        .post(isoFileUrl('get-download-link'))
        .set('x-access-token', ownerToken);
      expect(link.statusCode).toBe(500);
      failing(db.isoFiles, 'findOne');
      const download = await request(app).get(isoFileUrl('download'));
      expect(download.statusCode).toBe(500);
      failing(db.isoFiles, 'findOne');
      const remove = await request(app)
        .delete(isoFileUrl('delete'))
        .set('x-access-token', ownerToken);
      expect(remove.statusCode).toBe(500);
    });
  });

  describe('organizations and users', () => {
    it('should answer 500 when deleting the organization fails', async () => {
      const original = db.organization.findOne.bind(db.organization);
      jest
        .spyOn(db.organization, 'findOne')
        .mockImplementationOnce(original)
        .mockRejectedValueOnce(new Error('database down'));
      const guard = await request(app)
        .delete(`/api/organization/${orgName}`)
        .set('x-access-token', ownerToken);
      expect(guard.statusCode).toBe(500);
      jest.restoreAllMocks();

      jest.spyOn(db.organization.prototype, 'destroy').mockRejectedValueOnce(new Error('down'));
      const destroy = await request(app)
        .delete(`/api/organization/${orgName}`)
        .set('x-access-token', ownerToken);
      expect(destroy.statusCode).toBe(500);
      expect(await db.organization.findByPk(org.id)).not.toBeNull();
    });

    it('should answer 500 when the admin self-join fails', async () => {
      failing(db.UserOrg, 'create');
      const res = await request(app)
        .post(`/api/organization/${orgName}/join`)
        .set('x-access-token', signFor(admin));
      expect(res.statusCode).toBe(500);
    });

    it('should answer 500 when saving a display name or removing a member fails', async () => {
      jest.spyOn(db.user.prototype, 'save').mockRejectedValueOnce(new Error('down'));
      const rename = await request(app)
        .put(`/api/users/${owner.id}/change-name`)
        .set('x-access-token', ownerToken)
        .send({ name: 'Nope' });
      expect(rename.statusCode).toBe(500);
      const original = db.user.findOne.bind(db.user);
      jest
        .spyOn(db.user, 'findOne')
        .mockImplementation(options =>
          options?.where?.username ? Promise.reject(new Error('database down')) : original(options)
        );
      const remove = await request(app)
        .delete(`/api/organization/${orgName}/users/${outsider.username}`)
        .set('x-access-token', ownerToken);
      expect(remove.statusCode).toBe(500);
    });

    it('should answer 500 when the invitation lookup fails and still accept when the notice fails', async () => {
      failing(db.invitation, 'findOne');
      const broken = await request(app)
        .post('/api/auth/invitations/some-token/accept')
        .set('x-access-token', outsiderToken);
      expect(broken.statusCode).toBe(500);

      const invitation = await db.invitation.create({
        email: outsider.email,
        token: `err-${uniqueId}`,
        expires: new Date(Date.now() + DAY_MS),
        organizationId: org.id,
        invited_role: 'member',
        invited_by: owner.id,
      });
      failing(db.credential, 'findAll');
      const accepted = await request(app)
        .post(`/api/auth/invitations/${invitation.token}/accept`)
        .set('x-access-token', outsiderToken);
      expect(accepted.statusCode).toBe(200);
      await db.UserOrg.destroy({ where: { user_id: outsider.id, organization_id: org.id } });
    });

    it('should still record a join request when the manager notice fails', async () => {
      failing(db.credential, 'findAll');
      const res = await request(app)
        .post(`/api/organization/${openOrgName}/requests`)
        .set('x-access-token', outsiderToken)
        .send({});
      expect(res.statusCode).toBe(201);
    });
  });

  describe('version events', () => {
    it('should still publish and deprecate when the watcher lookup fails', async () => {
      failing(db.boxWatcher, 'findAll');
      const created = await request(app)
        .post(boxUrl('/version'))
        .set('x-access-token', ownerToken)
        .send({ versionNumber: '3.0.0' });
      expect(created.statusCode).toBe(201);
      await settle();
      failing(db.boxWatcher, 'findAll');
      const deprecated = await request(app)
        .put(boxUrl('/version/3.0.0'))
        .set('x-access-token', ownerToken)
        .send({ deprecated: true, deprecation_reason: 'old' });
      expect(deprecated.statusCode).toBe(200);
      await settle();
    });
  });

  describe('optional authentication', () => {
    it('should fall back to the anonymous view when the viewer lookup fails', async () => {
      failing(db.UserOrg, 'getUserOrganizations');
      const discover = await request(app).get('/api/discover').set('x-access-token', ownerToken);
      expect(discover.statusCode).toBe(200);
      failing(db.user, 'findByPk');
      const boxes = await request(app)
        .get(`/api/organization/${orgName}/box`)
        .set('x-access-token', ownerToken);
      expect(boxes.statusCode).toBe(200);
    });

    it('should refuse basic credentials and ignore a bearer key when the key lookup fails', async () => {
      const downloadUrl = boxUrl(
        '/version/1.0.0/provider/virtualbox/architecture/amd64/file/download'
      );
      failing(db.service_account, 'findOne');
      const basic = await request(app)
        .get(downloadUrl)
        .set('Authorization', `Basic ${Buffer.from('user:pass').toString('base64')}`);
      expect(basic.statusCode).toBe(401);
      failing(db.service_account, 'findOne');
      const bearer = await request(app).get(downloadUrl).set('Authorization', 'Bearer raw-key');
      expect(bearer.statusCode).toBe(404);
    });
  });

  describe('search and sweeps', () => {
    it('should answer 500 when a finder fails', async () => {
      failing(db.organization, 'findAll');
      const res = await request(app).get('/api/search').query({ q: 'zz', kinds: 'organization' });
      expect(res.statusCode).toBe(500);
    });

    it('should survive a failing service-account sweep', async () => {
      failing(db.service_account, 'findAll');
      await expect(runNotificationSweeps()).resolves.toBeUndefined();
    });
  });
});
