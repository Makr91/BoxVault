import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import db from '../app/models/index.js';
import bcrypt from 'bcryptjs';

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
    // Ensure roles exist
    const roles = ['user', 'moderator', 'admin'].map(name => ({ name }));
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
      role: 'admin',
      is_primary: true,
    });

    // Assign Regular User to Org
    await UserOrg.create({
      user_id: regularUser.id,
      organization_id: testOrg.id,
      role: 'user',
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
          expirationDays: 30,
          organizationId: testOrg.id,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.username).toBeDefined();
      expect(res.body.token).toBeDefined();
    });

    it('should fail if organizationId is missing', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', adminToken)
        .send({
          description: 'Test SA',
          expirationDays: 30,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Organization ID is required');
    });

    it('should fail if expirationDays exceeds maximum', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', adminToken)
        .send({
          description: 'Test SA',
          expirationDays: 1000, // Assuming default max is 365
          organizationId: testOrg.id,
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('expiration cannot exceed');
    });

    it('should allow regular user to create service account', async () => {
      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', userToken)
        .send({
          description: 'Test SA',
          expirationDays: 30,
          organizationId: testOrg.id,
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
          expirationDays: 30,
          organizationId: testOrg.id,
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('must be a member of this organization');
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(ServiceAccount, 'create').mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app)
        .post('/api/service-accounts')
        .set('x-access-token', adminToken)
        .send({
          description: 'Test SA',
          expirationDays: 30,
          organizationId: testOrg.id,
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
});
