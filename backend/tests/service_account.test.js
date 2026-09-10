import request from 'supertest';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import bcrypt from 'bcryptjs';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const {
  service_account: ServiceAccount,
  user: User,
  organization: Organization,
  UserOrg,
  role: Role,
} = db;

describe('Service Account API', () => {
  let adminToken;
  let userToken;
  let outsiderToken;
  let adminUser;
  let regularUser;
  let outsiderUser;
  let testOrg;
  const uniqueId = Date.now().toString(36);
  const orgName = `SAOrg_${uniqueId}`;

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);

    // Ensure roles exist
    const roles = ['user', 'admin'].map(name => ({ name }));
    await Role.bulkCreate(roles, { ignoreDuplicates: true });

    const password = await bcrypt.hash('password', 8);

    // Create Admin User
    adminUser = await User.create({
      username: `SAAdmin_${uniqueId}`,
      email: `sa_admin_${uniqueId}@example.com`,
      password,
      verified: true,
    });
    const adminRole = await Role.findOne({ where: { name: 'admin' } });
    await adminUser.setRoles([adminRole]);

    // Create Regular User
    regularUser = await User.create({
      username: `SAReg_${uniqueId}`,
      email: `sa_reg_${uniqueId}@example.com`,
      password,
      verified: true,
    });
    const userRole = await Role.findOne({ where: { name: 'user' } });
    await regularUser.setRoles([userRole]);

    // Create Outsider User
    outsiderUser = await User.create({
      username: `SAOut_${uniqueId}`,
      email: `sa_out_${uniqueId}@example.com`,
      password,
      verified: true,
    });
    await outsiderUser.setRoles([userRole]);

    // Create Organization
    testOrg = await Organization.create({
      name: orgName,
      description: 'Test Organization for Service Accounts',
      access_mode: 'private',
    });

    // Assign Admin to Org
    await UserOrg.create({
      user_id: adminUser.id,
      organization_id: testOrg.id,
      role: 'owner',
      is_primary: true,
    });

    // Assign Regular User to Org
    await UserOrg.create({
      user_id: regularUser.id,
      organization_id: testOrg.id,
      role: 'member',
    });

    // Get Token for Admin
    const resAdmin = await request(app)
      .post('/api/auth/signin')
      .send({ username: adminUser.username, password: 'password' });
    adminToken = resAdmin.body.accessToken;

    // Get Token for Regular User
    const resUser = await request(app)
      .post('/api/auth/signin')
      .send({ username: regularUser.username, password: 'password' });
    userToken = resUser.body.accessToken;

    // Get Token for Outsider User
    const resOutsider = await request(app)
      .post('/api/auth/signin')
      .send({ username: outsiderUser.username, password: 'password' });
    outsiderToken = resOutsider.body.accessToken;
  });

  afterAll(async () => {
    await ServiceAccount.destroy({ where: {} });
    await UserOrg.destroy({ where: { organization_id: testOrg.id } });
    await testOrg.destroy();
    await adminUser.destroy();
    await regularUser.destroy();
    await outsiderUser.destroy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/service-accounts', () => {
    it('should create a service account successfully', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', adminToken)
        .send({
          description: 'Test SA',
          expiration_days: 30,
          organization_id: testOrg.id,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.username).toBeDefined();
      expect(res.body.token).toBeDefined();
      expect(res.body.role).toBe('member');
    });

    it('should store the requested role up to the creator role in the organization', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', adminToken)
        .send({
          description: 'Admin SA',
          expiration_days: 30,
          organization_id: testOrg.id,
          role: 'admin',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.role).toBe('admin');
      const stored = await ServiceAccount.findByPk(res.body.id);
      expect(stored.role).toBe('admin');
    });

    it('should refuse a role above the creator role in the organization', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', userToken)
        .send({
          description: 'Too high',
          expiration_days: 30,
          organization_id: testOrg.id,
          role: 'admin',
        });

      expect(res.statusCode).toBe(422);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/role', rule: 'enum', params: { enum: 'member' } }),
      ]);
    });

    it('should refuse superadmin to a creator without the global admin role', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', userToken)
        .send({
          description: 'Not an admin',
          expiration_days: 30,
          organization_id: testOrg.id,
          role: 'superadmin',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/role', rule: 'enum', params: { enum: 'member' } }),
      ]);
    });

    it('should let a global admin create a superadmin service account', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', adminToken)
        .send({
          description: 'Superadmin SA',
          expiration_days: 30,
          organization_id: testOrg.id,
          role: 'superadmin',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.role).toBe('superadmin');
    });

    it('should refuse a role outside the enum', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', adminToken)
        .send({
          description: 'Bad role',
          expiration_days: 30,
          organization_id: testOrg.id,
          role: 'boss',
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/role',
          rule: 'enum',
          params: { enum: 'member, admin, owner, superadmin' },
        }),
      ]);
    });

    it('should fail if organization_id is missing', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', adminToken)
        .send({
          description: 'Test SA',
          expiration_days: 30,
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/organization_id', rule: 'required' }),
      ]);
    });

    it('should fail if expiration_days exceeds maximum', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', adminToken)
        .send({
          description: 'Test SA',
          expiration_days: 1000,
          organization_id: testOrg.id,
        });

      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/expiration_days',
          rule: 'maximum',
          params: { maximum: 365 },
        }),
      ]);
    });

    it('should allow regular user to create service account', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', userToken)
        .send({
          description: 'Test SA',
          expiration_days: 30,
          organization_id: testOrg.id,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.username).toBeDefined();
      expect(res.body.token).toBeDefined();
    });

    it('should return 403 if user is not a member of the organization', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', outsiderToken)
        .send({
          description: 'Outsider SA',
          expiration_days: 30,
          organization_id: testOrg.id,
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/forbidden');
      expect(res.body.title).toContain('must be a member of this organization');
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(ServiceAccount, 'create').mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', adminToken)
        .send({
          description: 'Test SA',
          expiration_days: 30,
          organization_id: testOrg.id,
        });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/service-accounts', () => {
    it('should list service accounts', async () => {
      const res = await request(app).get('/api/service-accounts').set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(ServiceAccount, 'getForUser').mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app).get('/api/service-accounts').set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/service-accounts/organizations', () => {
    it('should list available organizations', async () => {
      const res = await request(app)
        .get('/api/service-accounts/organizations')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(o => o.id === testOrg.id)).toBe(true);
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(UserOrg, 'findAll').mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app)
        .get('/api/service-accounts/organizations')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
    });
  });

  describe('DELETE /api/service-accounts/:id', () => {
    let saId;

    beforeEach(async () => {
      const sa = await ServiceAccount.create({
        username: `del-sa-${Date.now()}`,
        token: `token-${Date.now()}`,
        userId: adminUser.id,
        organization_id: testOrg.id,
      });
      saId = sa.id;
    });

    it('should delete service account', async () => {
      const res = await request(app)
        .delete(`/api/service-accounts/${saId}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
    });

    it('should return 404 if service account not found', async () => {
      const res = await request(app)
        .delete(`/api/service-accounts/999999`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(ServiceAccount, 'destroy').mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app)
        .delete(`/api/service-accounts/${saId}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
    });
  });

  describe('the role a service account acts with', () => {
    let otherOrg;
    let otherBox;
    let ownerAccount;
    let superadminAccount;

    const signFor = account =>
      jwt.sign(
        { id: account.userId, isServiceAccount: true, serviceAccountId: account.id },
        'test-secret',
        { expiresIn: '1h', ...TEST_JWT_CLAIMS }
      );

    beforeAll(async () => {
      otherOrg = await Organization.create({ name: `SAOther_${uniqueId}`, access_mode: 'private' });
      await UserOrg.create({ user_id: adminUser.id, organization_id: otherOrg.id, role: 'owner' });
      otherBox = await db.box.create({
        name: `sa-other-box-${uniqueId}`,
        isPublic: false,
        published: true,
        organizationId: otherOrg.id,
        userId: adminUser.id,
      });
      ownerAccount = await ServiceAccount.create({
        username: `sa-owner-role-${uniqueId}`,
        token: `sa-owner-role-token-${uniqueId}`,
        role: 'owner',
        userId: adminUser.id,
        organization_id: testOrg.id,
      });
      superadminAccount = await ServiceAccount.create({
        username: `sa-super-${uniqueId}`,
        token: `sa-super-token-${uniqueId}`,
        role: 'superadmin',
        userId: adminUser.id,
        organization_id: testOrg.id,
      });
    });

    afterAll(async () => {
      await otherBox.destroy();
      await UserOrg.destroy({ where: { organization_id: otherOrg.id } });
      await otherOrg.destroy();
      const adminRole = await Role.findOne({ where: { name: 'admin' } });
      await adminUser.setRoles([adminRole]);
      await UserOrg.update(
        { role: 'owner' },
        { where: { user_id: adminUser.id, organization_id: testOrg.id } }
      );
    });

    it('should answer the effective role, the lower of the stored role and the creator role', async () => {
      const asOwner = await request(app)
        .get('/api/user/organizations')
        .set('x-access-token', signFor(ownerAccount));
      expect(asOwner.statusCode).toBe(200);
      expect(asOwner.body).toEqual([
        expect.objectContaining({
          organization: expect.objectContaining({ id: testOrg.id }),
          role: 'owner',
        }),
      ]);

      await UserOrg.update(
        { role: 'member' },
        { where: { user_id: adminUser.id, organization_id: testOrg.id } }
      );
      const demoted = await request(app)
        .get('/api/user/organizations')
        .set('x-access-token', signFor(ownerAccount));
      expect(demoted.statusCode).toBe(200);
      expect(demoted.body[0].role).toBe('member');

      await UserOrg.destroy({ where: { user_id: adminUser.id, organization_id: testOrg.id } });
      const removed = await request(app)
        .get('/api/user/organizations')
        .set('x-access-token', signFor(ownerAccount));
      expect(removed.statusCode).toBe(200);
      expect(removed.body).toEqual([]);

      await UserOrg.create({
        user_id: adminUser.id,
        organization_id: testOrg.id,
        role: 'owner',
        is_primary: true,
      });
    });

    it('should keep a service account out of the admin routes whatever its owner holds', async () => {
      const res = await request(app)
        .get('/api/system/storage')
        .set('x-access-token', signFor(ownerAccount));
      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/forbidden');
    });

    it('should show a service account public items only in another organization', async () => {
      const boxes = await request(app)
        .get(`/api/organization/${otherOrg.name}/box`)
        .set('x-access-token', signFor(ownerAccount));
      expect(boxes.statusCode).toBe(200);
      expect(boxes.body).toEqual([]);

      const box = await request(app)
        .get(`/api/organization/${otherOrg.name}/box/${otherBox.name}`)
        .set('x-access-token', signFor(ownerAccount));
      expect(box.statusCode).toBe(403);

      const asUser = await request(app)
        .get(`/api/organization/${otherOrg.name}/box/${otherBox.name}`)
        .set('x-access-token', adminToken);
      expect(asUser.statusCode).toBe(200);
    });

    it('should let a superadmin service account act as a global admin until its creator loses the role', async () => {
      const storage = await request(app)
        .get('/api/system/storage')
        .set('x-access-token', signFor(superadminAccount));
      expect(storage.statusCode).not.toBe(403);

      const box = await request(app)
        .get(`/api/organization/${otherOrg.name}/box/${otherBox.name}`)
        .set('x-access-token', signFor(superadminAccount));
      expect(box.statusCode).toBe(200);

      const organizations = await request(app)
        .get('/api/user/organizations')
        .set('x-access-token', signFor(superadminAccount));
      expect(organizations.statusCode).toBe(200);
      expect(organizations.body[0].role).toBe('owner');

      const userRole = await Role.findOne({ where: { name: 'user' } });
      await adminUser.setRoles([userRole]);

      const refused = await request(app)
        .get('/api/system/storage')
        .set('x-access-token', signFor(superadminAccount));
      expect(refused.statusCode).toBe(403);

      const hidden = await request(app)
        .get(`/api/organization/${otherOrg.name}/box/${otherBox.name}`)
        .set('x-access-token', signFor(superadminAccount));
      expect(hidden.statusCode).toBe(403);

      const revoked = await request(app)
        .get('/api/user/organizations')
        .set('x-access-token', signFor(superadminAccount));
      expect(revoked.body).toEqual([]);
    });
  });
});
