import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import db from '../app/models/index.js';
import bcrypt from 'bcryptjs';

const { Request, organization: Organization, user: User, UserOrg, role: Role } = db;

describe('Request API Integration Tests', () => {
  let adminToken;
  let moderatorToken;
  let outsiderToken;
  let adminUser;
  let moderatorUser;
  let regularUser;
  let outsiderUser;
  let testOrg;
  const uniqueId = Date.now().toString(36);
  const orgName = `ReqOrg_${uniqueId}`;

  beforeAll(async () => {
    // Ensure roles exist
    const roles = ['user', 'moderator', 'admin'].map(name => ({ name }));
    await Role.bulkCreate(roles, { ignoreDuplicates: true });

    const password = await bcrypt.hash('password', 8);

    // Helper to create user with role
    const createUser = async (prefix, roleName) => {
      const user = await User.create({
        username: `${prefix}_${uniqueId}`,
        email: `${prefix}_${uniqueId}@example.com`,
        password,
        verified: true,
      });
      const role = await Role.findOne({ where: { name: roleName || 'user' } });
      if (role) {
        await user.setRoles([role]);
      }
      return user;
    };

    adminUser = await createUser('ReqAdmin', 'admin');
    moderatorUser = await createUser('ReqMod', 'moderator');
    regularUser = await createUser('ReqUser', 'user');
    outsiderUser = await createUser('ReqOut', 'user');

    // Create Organization
    testOrg = await Organization.create({
      name: orgName,
      description: 'Test Organization for Requests',
      access_mode: 'request_to_join',
    });

    // Assign Org Memberships
    await UserOrg.create({
      user_id: adminUser.id,
      organization_id: testOrg.id,
      role: 'admin',
      is_primary: true,
    });
    await UserOrg.create({
      user_id: moderatorUser.id,
      organization_id: testOrg.id,
      role: 'moderator',
    });
    await UserOrg.create({
      user_id: regularUser.id,
      organization_id: testOrg.id,
      role: 'user',
    });

    // Get Tokens
    const getToken = async user => {
      const res = await request(app)
        .post('/api/auth/signin')
        .send({ username: user.username, password: 'password' });
      return res.body.accessToken;
    };

    adminToken = await getToken(adminUser);
    moderatorToken = await getToken(moderatorUser);
    outsiderToken = await getToken(outsiderUser);
  });

  afterAll(async () => {
    // Cleanup
    await Request.destroy({ where: {} });
    await UserOrg.destroy({ where: { organization_id: testOrg.id } });
    await testOrg.destroy();
    await adminUser.destroy();
    await moderatorUser.destroy();
    await regularUser.destroy();
    await outsiderUser.destroy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/organization/:organization/requests', () => {
    it('should allow outsider to create a join request', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/requests`)
        .set('x-access-token', outsiderToken)
        .send({ message: 'Let me in!' });
      expect(res.statusCode).toBe(201);
    });

    it('should return 400 if pending request exists', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/requests`)
        .set('x-access-token', outsiderToken)
        .send({ message: 'Again' });
      expect(res.statusCode).toBe(400);
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(Request, 'createJoinRequest').mockRejectedValueOnce(new Error('DB Error'));

      const password = await bcrypt.hash('password', 8);

      // Use a fresh user to bypass "pending request" check
      const tempUser = await User.create({
        username: `Temp500_${uniqueId}`,
        email: `temp500_${uniqueId}@example.com`,
        password,
        verified: true,
      });
      const role = await Role.findOne({ where: { name: 'user' } });
      await tempUser.setRoles([role]);

      const tempTokenRes = await request(app)
        .post('/api/auth/signin')
        .send({ username: tempUser.username, password: 'password' });
      const tempToken = tempTokenRes.body.accessToken;

      const res = await request(app)
        .post(`/api/organization/${orgName}/requests`)
        .set('x-access-token', tempToken)
        .send({ message: 'Error test' });

      expect(res.statusCode).toBe(500);

      await tempUser.destroy();
    });
  });

  describe('GET /api/organization/:organization/requests', () => {
    it('should return requests for moderator', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/requests`)
        .set('x-access-token', moderatorToken);
      expect(res.statusCode).toBe(200);
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(Request, 'getPendingRequests').mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/organization/${orgName}/requests`)
        .set('x-access-token', moderatorToken);
      expect(res.statusCode).toBe(500);
    });
  });

  describe('GET /api/user/requests', () => {
    it('should return user requests', async () => {
      const res = await request(app).get('/api/user/requests').set('x-access-token', outsiderToken);
      expect(res.statusCode).toBe(200);
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(Request, 'getUserPendingRequests').mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app).get('/api/user/requests').set('x-access-token', outsiderToken);
      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/organization/:organization/requests/:requestId/approve', () => {
    let requestId;

    beforeEach(async () => {
      // Ensure pending request for outsider
      await Request.destroy({ where: { user_id: outsiderUser.id, organization_id: testOrg.id } });
      const req = await Request.createJoinRequest(outsiderUser.id, testOrg.id, 'Approve me');
      requestId = req.id;
    });

    it('should approve request', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/requests/${requestId}/approve`)
        .set('x-access-token', moderatorToken)
        .send({ assignedRole: 'user' });
      expect(res.statusCode).toBe(200);

      // Cleanup membership
      await UserOrg.destroy({ where: { user_id: outsiderUser.id, organization_id: testOrg.id } });
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(Request, 'approveRequest').mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app)
        .post(`/api/organization/${orgName}/requests/${requestId}/approve`)
        .set('x-access-token', moderatorToken)
        .send({ assignedRole: 'user' });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('POST /api/organization/:organization/requests/:requestId/deny', () => {
    let requestId;

    beforeEach(async () => {
      await Request.destroy({ where: { user_id: outsiderUser.id, organization_id: testOrg.id } });
      const req = await Request.createJoinRequest(outsiderUser.id, testOrg.id, 'Deny me');
      requestId = req.id;
    });

    it('should deny request', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/requests/${requestId}/deny`)
        .set('x-access-token', moderatorToken);
      expect(res.statusCode).toBe(200);
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(Request, 'denyRequest').mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app)
        .post(`/api/organization/${orgName}/requests/${requestId}/deny`)
        .set('x-access-token', moderatorToken);
      expect(res.statusCode).toBe(500);
    });
  });

  describe('DELETE /api/user/requests/:requestId', () => {
    let requestId;

    beforeEach(async () => {
      await Request.destroy({ where: { user_id: outsiderUser.id, organization_id: testOrg.id } });
      const req = await Request.createJoinRequest(outsiderUser.id, testOrg.id, 'Cancel me');
      requestId = req.id;
    });

    it('should cancel request', async () => {
      const res = await request(app)
        .delete(`/api/user/requests/${requestId}`)
        .set('x-access-token', outsiderToken);
      expect(res.statusCode).toBe(200);
    });

    it('should return 500 on DB error', async () => {
      jest.spyOn(Request, 'findOne').mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app)
        .delete(`/api/user/requests/${requestId}`)
        .set('x-access-token', outsiderToken);
      expect(res.statusCode).toBe(500);
    });
  });

  describe('Edge Cases', () => {
    it('should return 404 when creating request for non-existent organization', async () => {
      const res = await request(app)
        .post(`/api/organization/NonExistentOrg_${uniqueId}/requests`)
        .set('x-access-token', outsiderToken)
        .send({ message: 'Hello' });
      expect(res.statusCode).toBe(404);
    });

    it('should return 403 when creating request for private organization', async () => {
      const privateOrg = await Organization.create({
        name: `PrivOrg_${uniqueId}`,
        access_mode: 'private',
      });
      const res = await request(app)
        .post(`/api/organization/${privateOrg.name}/requests`)
        .set('x-access-token', outsiderToken)
        .send({ message: 'Let me in' });
      expect(res.statusCode).toBe(403);
      await privateOrg.destroy();
    });

    it('should return 400 when creating request if already a member', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/requests`)
        .set('x-access-token', adminToken)
        .send({ message: 'I am member' });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when approving with invalid role', async () => {
      const tempUser = await User.create({
        username: `TempRole_${uniqueId}`,
        email: `temprole_${uniqueId}@example.com`,
        password: await bcrypt.hash('password', 8),
        verified: true,
      });
      const role = await Role.findOne({ where: { name: 'user' } });
      await tempUser.setRoles([role]);
      const tempToken = (
        await request(app)
          .post('/api/auth/signin')
          .send({ username: tempUser.username, password: 'password' })
      ).body.accessToken;

      await request(app)
        .post(`/api/organization/${orgName}/requests`)
        .set('x-access-token', tempToken)
        .send({ message: 'hi' });
      const req = await Request.findOne({
        where: { user_id: tempUser.id, organization_id: testOrg.id },
      });

      const res = await request(app)
        .post(`/api/organization/${orgName}/requests/${req.id}/approve`)
        .set('x-access-token', moderatorToken)
        .send({ assignedRole: 'invalid_role' });

      expect(res.statusCode).toBe(400);

      await req.destroy();
      await tempUser.destroy();
    });

    it('should return 404 when approving non-existent request', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/requests/999999/approve`)
        .set('x-access-token', moderatorToken);
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 when approving request from another organization', async () => {
      const otherOrg = await Organization.create({
        name: `OtherOrg_${uniqueId}`,
        access_mode: 'request_to_join',
      });
      const tempUser = await User.create({
        username: `TempOther_${uniqueId}`,
        email: `tempother_${uniqueId}@example.com`,
        password: await bcrypt.hash('password', 8),
        verified: true,
      });
      const role = await Role.findOne({ where: { name: 'user' } });
      await tempUser.setRoles([role]);

      const req = await Request.createJoinRequest(tempUser.id, otherOrg.id);

      const res = await request(app)
        .post(`/api/organization/${orgName}/requests/${req.id}/approve`)
        .set('x-access-token', moderatorToken);

      expect(res.statusCode).toBe(404);

      await req.destroy();
      await tempUser.destroy();
      await otherOrg.destroy();
    });

    it('should return 400 when approving already processed request', async () => {
      const tempUser = await User.create({
        username: `TempProc_${uniqueId}`,
        email: `tempproc_${uniqueId}@example.com`,
        password: await bcrypt.hash('password', 8),
        verified: true,
      });
      const role = await Role.findOne({ where: { name: 'user' } });
      await tempUser.setRoles([role]);

      const req = await Request.create({
        user_id: tempUser.id,
        organization_id: testOrg.id,
        status: 'approved',
        requested_role: 'user',
      });

      const res = await request(app)
        .post(`/api/organization/${orgName}/requests/${req.id}/approve`)
        .set('x-access-token', moderatorToken);

      expect(res.statusCode).toBe(400);

      await req.destroy();
      await tempUser.destroy();
    });

    it('should return 404 when denying non-existent request', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/requests/999999/deny`)
        .set('x-access-token', moderatorToken);
      expect(res.statusCode).toBe(404);
    });

    it('should return 400 when denying already processed request', async () => {
      const tempUser = await User.create({
        username: `TempDeny_${uniqueId}`,
        email: `tempdeny_${uniqueId}@example.com`,
        password: await bcrypt.hash('password', 8),
        verified: true,
      });
      const role = await Role.findOne({ where: { name: 'user' } });
      await tempUser.setRoles([role]);

      const req = await Request.create({
        user_id: tempUser.id,
        organization_id: testOrg.id,
        status: 'approved',
        requested_role: 'user',
      });

      const res = await request(app)
        .post(`/api/organization/${orgName}/requests/${req.id}/deny`)
        .set('x-access-token', moderatorToken);

      expect(res.statusCode).toBe(400);

      await req.destroy();
      await tempUser.destroy();
    });

    it('should return 404 when cancelling non-existent request', async () => {
      const res = await request(app)
        .delete(`/api/user/requests/999999`)
        .set('x-access-token', outsiderToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Request Model Direct Tests', () => {
    it('should handle transaction rollback in approveRequest', async () => {
      // Ensure no conflicting request exists
      await Request.destroy({ where: { user_id: outsiderUser.id, organization_id: testOrg.id } });

      // Create a pending request
      const req = await Request.createJoinRequest(outsiderUser.id, testOrg.id, 'Rollback test');

      // Mock request.update to throw error to trigger rollback
      // We need to spy on the prototype since findByPk returns an instance
      const updateSpy = jest
        .spyOn(Request.prototype, 'update')
        .mockRejectedValue(new Error('Update Error'));

      await expect(Request.approveRequest(req.id, moderatorUser.id)).rejects.toThrow(
        'Update Error'
      );

      // Verify request is still pending (rollback successful)
      const checkReq = await Request.findByPk(req.id);
      expect(checkReq.status).toBe('pending');

      updateSpy.mockRestore();
      await req.destroy();
    });

    it('denyRequest should throw if request not found or not pending', async () => {
      // Test non-existent
      await expect(Request.denyRequest(999999, moderatorUser.id)).rejects.toThrow(
        'Request not found or already processed'
      );

      // Test already processed
      const req = await Request.create({
        user_id: outsiderUser.id,
        organization_id: testOrg.id,
        status: 'approved',
        requested_role: 'user',
      });

      await expect(Request.denyRequest(req.id, moderatorUser.id)).rejects.toThrow(
        'Request not found or already processed'
      );

      await req.destroy();
    });

    it('approveRequest should throw if request not found or not pending', async () => {
      // Test non-existent
      await expect(Request.approveRequest(999999, moderatorUser.id)).rejects.toThrow(
        'Request not found or already processed'
      );
    });
  });
});
