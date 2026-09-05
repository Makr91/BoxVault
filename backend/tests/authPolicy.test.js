import request from 'supertest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import jwt from 'jsonwebtoken';
import { hashSync } from 'bcryptjs';
import { fileURLToPath } from 'url';
import app from '../server.js';
import db from '../app/models/index.js';
import { hashServiceAccountToken } from '../app/utils/serviceAccountAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configDir = path.join(__dirname, '../app/config');

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };
const PASSWORD = 'Secret123!';
const DAY_MS = 24 * 60 * 60 * 1000;

const updateConfig = (configName, mutate) => {
  const configPath = path.join(configDir, `${configName}.test.config.yaml`);
  const original = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(configPath, yaml.dump(config));
  return () => fs.writeFileSync(configPath, original);
};

describe('Local authentication policy', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `PolicyOrg-${uniqueId}`;
  const rawKey = `policy-key-${uniqueId}-${'c'.repeat(20)}`;
  let admin;
  let org;
  let account;
  let orgAdmin;
  let serviceAccount;

  const signFor = user =>
    jwt.sign({ id: user.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const signin = body => request(app).post('/api/auth/signin').send(body);

  const signup = body =>
    request(app)
      .post('/api/auth/signup')
      .send({
        username: `signup-${uniqueId}-${Math.random().toString(36).slice(2, 8)}`,
        email: `signup-${uniqueId}-${Math.random().toString(36).slice(2, 8)}@example.com`,
        password: PASSWORD,
        ...body,
      });

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    admin = await db.user.findOne({ where: { username: 'SomeUser' } });
    org = await db.organization.create({ name: orgName });
    const role = await db.role.findOne({ where: { name: 'user' } });
    account = await db.user.create({
      username: `policy-user-${uniqueId}`,
      email: `policy-user-${uniqueId}@example.com`,
      password: hashSync(PASSWORD, 8),
      verified: true,
      primary_organization_id: org.id,
    });
    await account.setRoles([role]);
    await db.UserOrg.create({ user_id: account.id, organization_id: org.id, role: 'owner' });
    orgAdmin = await db.user.create({
      username: `policy-admin-${uniqueId}`,
      email: `policy-admin-${uniqueId}@example.com`,
      password: hashSync(PASSWORD, 8),
      verified: true,
    });
    await orgAdmin.setRoles([role]);
    await db.UserOrg.create({ user_id: orgAdmin.id, organization_id: org.id, role: 'admin' });
    serviceAccount = await db.service_account.create({
      username: `policy-sa-${uniqueId}`,
      token: hashServiceAccountToken(rawKey),
      expiresAt: new Date(Date.now() + DAY_MS),
      userId: account.id,
      organization_id: org.id,
    });
  });

  afterAll(async () => {
    await serviceAccount.destroy();
    await db.invitation.destroy({ where: { organizationId: org.id } });
    await db.user.destroy({ where: { username: { [db.Sequelize.Op.like]: `%${uniqueId}%` } } });
    await db.organization.destroy({ where: { name: { [db.Sequelize.Op.like]: `%${uniqueId}%` } } });
  });

  describe('signin gates', () => {
    it('should answer the same 401 for an unknown user and a wrong password', async () => {
      const unknown = await signin({ username: `nobody-${uniqueId}`, password: PASSWORD });
      expect(unknown.statusCode).toBe(401);
      const wrong = await signin({ username: account.username, password: 'wrong' });
      expect(wrong.statusCode).toBe(401);
    });

    it('should sign a valid local account in', async () => {
      const res = await signin({ username: account.username, password: PASSWORD });
      expect(res.statusCode).toBe(200);
      expect(res.body.provider).toBe('local');
      expect(res.body.organization).toBe(orgName);
    });

    it('should refuse local accounts while local authentication is switched off', async () => {
      const restore = updateConfig('auth', config => {
        config.auth.jwt.local_enabled = { value: false };
      });
      try {
        const res = await signin({ username: account.username, password: PASSWORD });
        expect(res.statusCode).toBe(403);
        const registration = await signup({});
        expect(registration.statusCode).toBe(403);
      } finally {
        restore();
      }
    });

    it('should refuse a suspended account after checking the password', async () => {
      await account.update({ suspended: true });
      try {
        const res = await signin({ username: account.username, password: PASSWORD });
        expect(res.statusCode).toBe(403);
      } finally {
        await account.update({ suspended: false });
      }
    });

    it('should refuse an unverified account when verification is required', async () => {
      const restore = updateConfig('auth', config => {
        config.auth.local.local_require_email_verification = { value: true };
      });
      await account.update({ verified: false });
      try {
        const res = await signin({ username: account.username, password: PASSWORD });
        expect(res.statusCode).toBe(403);
      } finally {
        restore();
        await account.update({ verified: true });
      }
    });

    it('should sign a service account in and refuse it once expired or orphaned', async () => {
      const ok = await signin({ username: serviceAccount.username, password: rawKey });
      expect(ok.statusCode).toBe(200);
      expect(ok.body.isServiceAccount).toBe(true);
      expect(ok.body.organization).toBe(orgName);

      await account.update({ suspended: true });
      const suspendedOwner = await signin({ username: serviceAccount.username, password: rawKey });
      expect(suspendedOwner.statusCode).toBe(403);
      await account.update({ suspended: false });

      await serviceAccount.update({ expiresAt: new Date(Date.now() - DAY_MS) });
      const expired = await signin({ username: serviceAccount.username, password: rawKey });
      expect(expired.statusCode).toBe(401);
      await serviceAccount.update({ expiresAt: new Date(Date.now() + DAY_MS) });
    });
  });

  describe('password policy', () => {
    let restore;

    beforeAll(() => {
      restore = updateConfig('auth', config => {
        config.auth.local.local_password_min_length = { value: 8 };
        config.auth.local.local_password_require_uppercase = { value: true };
        config.auth.local.local_password_require_lowercase = { value: true };
        config.auth.local.local_password_require_numbers = { value: true };
        config.auth.local.local_password_require_symbols = { value: true };
      });
    });

    afterAll(() => {
      restore();
    });

    it('should reject every weak password shape on signup', async () => {
      const cases = ['short', 'lowercase1!', 'UPPERCASE1!', 'NoNumbers!', 'NoSymbols1'];
      const responses = await Promise.all(cases.map(password => signup({ password })));
      responses.forEach(res => {
        expect(res.statusCode).toBe(400);
      });
    });

    it('should apply the same policy to password changes', async () => {
      const weak = await request(app)
        .put(`/api/users/${account.id}/change-password`)
        .set('x-access-token', signFor(account))
        .send({ newPassword: 'short' });
      expect(weak.statusCode).toBe(400);

      const missing = await request(app)
        .put('/api/users/999999/change-password')
        .set('x-access-token', signFor(admin))
        .send({ newPassword: 'Strong123!' });
      expect(missing.statusCode).toBe(404);
    });
  });

  describe('signup gates', () => {
    it('should reject an unsafe username', async () => {
      const res = await signup({ username: 'bad..name' });
      expect(res.statusCode).toBe(400);
    });

    it('should refuse a new personal organization when the knob is off', async () => {
      const restore = updateConfig('auth', config => {
        config.auth.local.local_allow_new_organizations = { value: false };
      });
      try {
        const res = await signup({});
        expect(res.statusCode).toBe(403);
      } finally {
        restore();
      }
    });

    it('should enforce the invitation rules', async () => {
      const email = `invited-${uniqueId}@example.com`;
      const invitation = (overrides = {}) =>
        db.invitation.create({
          email,
          token: `signup-${uniqueId}-${Math.random().toString(36).slice(2)}`,
          expires: new Date(Date.now() + DAY_MS),
          organizationId: org.id,
          invited_role: 'member',
          ...overrides,
        });

      const unknown = await signup({ email, invitationToken: 'no-such-token' });
      expect(unknown.statusCode).toBe(400);

      const used = await invitation({ accepted: true });
      expect((await signup({ email, invitationToken: used.token })).statusCode).toBe(400);

      const stale = await invitation({ expires: new Date(Date.now() - DAY_MS) });
      expect((await signup({ email, invitationToken: stale.token })).statusCode).toBe(400);
      await stale.reload();
      expect(stale.expired).toBe(true);

      const addressed = await invitation();
      const mismatch = await signup({
        email: `someone-else-${uniqueId}@example.com`,
        invitationToken: addressed.token,
      });
      expect(mismatch.statusCode).toBe(400);

      const joined = await signup({ email, invitationToken: addressed.token });
      expect(joined.statusCode).toBe(201);
      const created = await db.user.findOne({ where: { email } });
      const membership = await db.UserOrg.findUserOrgRole(created.id, org.id);
      expect(membership.role).toBe('member');
    });

    it('should fail when the organization code space is exhausted', async () => {
      const holder = await db.organization.create({
        name: `Exhausted-${uniqueId}`,
        org_code: 'FFFFFF',
      });
      const restore = updateConfig('app', config => {
        config.boxvault.org_code_seed = { value: 'FFFFFF' };
      });
      try {
        const res = await signup({});
        expect(res.statusCode).toBe(500);
      } finally {
        restore();
        await holder.destroy();
      }
    });
  });

  describe('name and address guards', () => {
    it('should reject an organization name with consecutive periods', async () => {
      const res = await request(app)
        .post('/api/organization')
        .set('x-access-token', signFor(account))
        .send({ organization: 'bad..org' });
      expect(res.statusCode).toBe(400);
    });

    it('should answer 404 when changing the email of an unknown user', async () => {
      const res = await request(app)
        .put('/api/users/999999/change-email')
        .set('x-access-token', signFor(admin))
        .send({ newEmail: `nobody-${uniqueId}@example.com` });
      expect(res.statusCode).toBe(404);
    });

    it('should let only owners invite administrators', async () => {
      const res = await request(app)
        .post('/api/auth/invite')
        .set('x-access-token', signFor(orgAdmin))
        .send({
          email: `admin-invitee-${uniqueId}@example.com`,
          organizationName: orgName,
          inviteRole: 'admin',
        });
      expect(res.statusCode).toBe(403);
    });
  });
});
