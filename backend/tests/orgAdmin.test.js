import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { hashServiceAccountToken } from '../app/utils/serviceAccountAuth.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };
const ISSUER = 'https://admin-idp.example';

describe('Organization administration guards', () => {
  const uniqueId = Date.now().toString(36);
  const orgAName = `AdminOrg-${uniqueId}`;
  const orgBName = `SoleOrg-${uniqueId}`;
  const extOrgName = `AdminExt-${uniqueId}`;
  const openOrgName = `OpenOrg-${uniqueId}`;
  const rawKey = `sa-key-${uniqueId}-${'b'.repeat(24)}`;
  let admin;
  let orgA;
  let orgB;
  let extOrg;
  let openOrg;
  let ownerA;
  let adminA;
  let memberA;
  let ownerB;
  let memberB;
  let ownerE;
  let serviceAccount;

  const signFor = (account, claims = {}) =>
    jwt.sign({ id: account.id, ...claims }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const createUser = async (label, org, orgRole) => {
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
    admin = await db.user.findOne({ where: { username: 'SomeUser' } });
    orgA = await db.organization.create({ name: orgAName });
    orgB = await db.organization.create({ name: orgBName });
    openOrg = await db.organization.create({ name: openOrgName, access_mode: 'request_to_join' });
    extOrg = await db.organization.create({
      name: extOrgName,
      email: `ext-${uniqueId}@example.com`,
      description: 'mirrored description',
      external_issuer: ISSUER,
      external_org_id: `admin-ext-${uniqueId}`,
    });
    ownerA = await createUser('adm-ownerA', orgA, 'owner');
    adminA = await createUser('adm-adminA', orgA, 'admin');
    memberA = await createUser('adm-memberA', orgA, 'member');
    ownerB = await createUser('adm-ownerB', orgB, 'owner');
    memberB = await createUser('adm-memberB', orgB, 'member');
    ownerE = await createUser('adm-ownerE', extOrg, 'owner');
    serviceAccount = await db.service_account.create({
      username: `adm-sa-${uniqueId}`,
      token: hashServiceAccountToken(rawKey),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      userId: ownerA.id,
      organization_id: orgA.id,
    });
  });

  afterAll(async () => {
    await serviceAccount.destroy();
    await db.Request.destroy({ where: { organization_id: openOrg.id } });
    await db.UserOrg.destroy({
      where: { organization_id: [orgA.id, orgB.id, extOrg.id, openOrg.id] },
    });
    await db.organization.destroy({ where: { id: [orgA.id, orgB.id, extOrg.id, openOrg.id] } });
    await db.user.destroy({
      where: { id: [ownerA.id, adminA.id, memberA.id, ownerB.id, memberB.id, ownerE.id] },
    });
  });

  describe('display name changes', () => {
    const changeName = (target, token, body) =>
      request(app).put(`/api/users/${target}/change-name`).set('x-access-token', token).send(body);

    it('should reject a name that is not a string or is too long', async () => {
      const notString = await changeName(memberA.id, signFor(memberA), { name: 5 });
      expect(notString.statusCode).toBe(400);
      const tooLong = await changeName(memberA.id, signFor(memberA), { name: 'x'.repeat(256) });
      expect(tooLong.statusCode).toBe(400);
    });

    it('should answer 404 for an unknown user', async () => {
      const res = await changeName(999999, signFor(admin), { name: 'Nobody' });
      expect(res.statusCode).toBe(404);
    });

    it('should set and clear the display name', async () => {
      const set = await changeName(memberA.id, signFor(memberA), { name: '  Jane Doe ' });
      expect(set.statusCode).toBe(200);
      expect(set.body.name).toBe('Jane Doe');
      const cleared = await changeName(memberA.id, signFor(memberA), { name: '' });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.body.name).toBeNull();
    });
  });

  describe('preferences', () => {
    const patch = (token, body) =>
      request(app).patch('/api/user/preferences').set('x-access-token', token).send(body);

    it('should answer the stored preferences for an empty patch', async () => {
      const res = await patch(signFor(memberA), {});
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ language: null, theme: null, timezone: null });
    });

    it('should reject an invalid language, theme or timezone', async () => {
      const cases = [{ language: 'x'.repeat(11) }, { theme: 'neon' }, { timezone: 'Mars/Olympus' }];
      const responses = await Promise.all(cases.map(body => patch(signFor(memberA), body)));
      responses.forEach(res => {
        expect(res.statusCode).toBe(400);
      });
    });

    it('should store valid preferences for a local account', async () => {
      const res = await patch(signFor(memberA), {
        language: 'en-US',
        theme: 'dark',
        timezone: 'UTC',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ language: 'en-US', theme: 'dark', timezone: 'UTC' });
    });

    it('should require an identity-provider session for a federated account', async () => {
      await ownerE.update({ authProvider: 'oidc' });
      const res = await patch(signFor(ownerE), { theme: 'light' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('service-account organization view', () => {
    it('should answer the single organization of a raw key', async () => {
      const res = await request(app)
        .get('/api/user/organizations')
        .set('Authorization', `Bearer ${rawKey}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({
          organization: expect.objectContaining({ id: orgA.id, name: orgAName }),
          role: 'member',
          isPrimary: true,
        }),
      ]);
    });

    it('should list the organization boxes for a raw key', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgAName}/box`)
        .set('Authorization', `Bearer ${rawKey}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should refuse a service-account session whose owner is suspended', async () => {
      await ownerA.update({ suspended: true });
      try {
        const res = await request(app)
          .get('/api/user/organizations')
          .set(
            'x-access-token',
            signFor(ownerA, { isServiceAccount: true, serviceAccountId: serviceAccount.id })
          );
        expect(res.statusCode).toBe(403);
      } finally {
        await ownerA.update({ suspended: false });
      }
    });
  });

  describe('suspended sessions', () => {
    it('should refuse a suspended user on the refresh and profile routes', async () => {
      await memberA.update({ suspended: true });
      try {
        const refresh = await request(app)
          .post('/api/auth/refresh-token')
          .set('x-access-token', signFor(memberA))
          .send({});
        expect(refresh.statusCode).toBe(403);
        const profile = await request(app).get('/api/user').set('x-access-token', signFor(memberA));
        expect(profile.statusCode).toBe(403);
      } finally {
        await memberA.update({ suspended: false });
      }
    });
  });

  describe('membership hierarchy', () => {
    it('should let an organization admin remove a member but not the owner', async () => {
      const removed = await request(app)
        .delete(`/api/organization/${orgAName}/members/${memberA.id}`)
        .set('x-access-token', signFor(adminA));
      expect(removed.statusCode).toBe(200);
      expect(await db.UserOrg.findUserOrgRole(memberA.id, orgA.id)).toBeNull();

      const refused = await request(app)
        .delete(`/api/organization/${orgAName}/members/${ownerA.id}`)
        .set('x-access-token', signFor(adminA));
      expect(refused.statusCode).toBe(403);
    });

    it('should keep the last owner from demoting, leaving or deleting themselves', async () => {
      const demote = await request(app)
        .put(`/api/organization/${orgBName}/users/${ownerB.id}/role`)
        .set('x-access-token', signFor(ownerB))
        .send({ role: 'member' });
      expect(demote.statusCode).toBe(400);

      const leave = await request(app)
        .post(`/api/user/leave/${orgBName}`)
        .set('x-access-token', signFor(ownerB));
      expect(leave.statusCode).toBe(400);

      const destroy = await request(app)
        .delete(`/api/users/${ownerB.id}`)
        .set('x-access-token', signFor(ownerB));
      expect(destroy.statusCode).toBe(400);
    });

    it('should delete the account once the organization has no other members', async () => {
      await db.UserOrg.destroy({ where: { user_id: memberB.id, organization_id: orgB.id } });
      const res = await request(app)
        .delete(`/api/users/${ownerB.id}`)
        .set('x-access-token', signFor(ownerB));
      expect(res.statusCode).toBe(200);
      expect(await db.user.findByPk(ownerB.id)).toBeNull();
    });
  });

  describe('join requests without managers', () => {
    it('should accept a request for an organization nobody manages', async () => {
      const res = await request(app)
        .post(`/api/organization/${openOrgName}/requests`)
        .set('x-access-token', signFor(memberA))
        .send({ message: 'hello' });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('global admin self-join', () => {
    it('should answer 404 for an unknown organization', async () => {
      const res = await request(app)
        .post(`/api/organization/NoOrg-${uniqueId}/join`)
        .set('x-access-token', signFor(admin));
      expect(res.statusCode).toBe(404);
    });

    it('should join as owner once and refuse a second join', async () => {
      const joined = await request(app)
        .post(`/api/organization/${orgAName}/join`)
        .set('x-access-token', signFor(admin));
      expect(joined.statusCode).toBe(200);
      const membership = await db.UserOrg.findUserOrgRole(admin.id, orgA.id);
      expect(membership.role).toBe('owner');
      expect(membership.is_primary).toBe(false);

      const again = await request(app)
        .post(`/api/organization/${orgAName}/join`)
        .set('x-access-token', signFor(admin));
      expect(again.statusCode).toBe(400);
    });
  });

  describe('ownership handover', () => {
    it('should let an owner step down and leave once another owner exists', async () => {
      const promote = await request(app)
        .put(`/api/organization/${orgAName}/users/${adminA.id}/role`)
        .set('x-access-token', signFor(ownerA))
        .send({ role: 'owner' });
      expect(promote.statusCode).toBe(200);
      expect(promote.body.newRole).toBe('owner');

      const stepDown = await request(app)
        .put(`/api/organization/${orgAName}/users/${ownerA.id}/role`)
        .set('x-access-token', signFor(ownerA))
        .send({ role: 'member' });
      expect(stepDown.statusCode).toBe(200);

      const leave = await request(app)
        .post(`/api/user/leave/${orgAName}`)
        .set('x-access-token', signFor(adminA));
      expect(leave.statusCode).toBe(200);
      expect(await db.UserOrg.findUserOrgRole(adminA.id, orgA.id)).toBeNull();
    });
  });

  describe('editing a mirrored organization', () => {
    const edit = body =>
      request(app)
        .put(`/api/organization/${extOrgName}`)
        .set('x-access-token', signFor(ownerE))
        .send(body);

    it('should refuse a rename', async () => {
      const res = await edit({ organization: `Renamed-${uniqueId}` });
      expect(res.statusCode).toBe(403);
    });

    it('should refuse a profile change', async () => {
      const res = await edit({ email: `changed-${uniqueId}@example.com` });
      expect(res.statusCode).toBe(403);
    });

    it('should accept an unchanged echo of the profile', async () => {
      const res = await edit({
        email: `ext-${uniqueId}@example.com`,
        description: 'mirrored description',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.organization.name).toBe(extOrgName);
    });

    it('should refuse to delete a mirrored organization', async () => {
      const res = await request(app)
        .delete(`/api/organization/${extOrgName}`)
        .set('x-access-token', signFor(ownerE));
      expect(res.statusCode).toBe(403);
      expect(await db.organization.findByPk(extOrg.id)).not.toBeNull();
    });
  });
});
