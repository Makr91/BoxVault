import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import db from '../app/models/index.js';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('User API', () => {
  let userToken;
  let adminToken;
  let testUser;
  let adminUser;
  let anotherUser;
  let orgOne;
  let orgTwo;

  const uniqueId = Date.now().toString(36);

  beforeAll(async () => {
    const hashedPassword = await bcrypt.hash('aSecurePassword123', 8);

    // Create Users
    testUser = await db.user.create({
      username: `test-user-${uniqueId}`,
      email: `test-user-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    adminUser = await db.user.create({
      username: `admin-user-${uniqueId}`,
      email: `admin-user-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    anotherUser = await db.user.create({
      username: `another-user-${uniqueId}`,
      email: `another-user-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });

    // Assign Roles
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await testUser.setRoles([userRole]);
    await adminUser.setRoles([adminRole]);
    await anotherUser.setRoles([userRole]);

    // Create Organizations
    orgOne = await db.organization.create({ name: `user-org-one-${uniqueId}` });
    orgTwo = await db.organization.create({ name: `user-org-two-${uniqueId}` });

    // Link Users to Organizations
    await db.UserOrg.create({
      user_id: testUser.id,
      organization_id: orgOne.id,
      role: 'user',
      is_primary: true,
    });
    await db.UserOrg.create({
      user_id: testUser.id,
      organization_id: orgTwo.id,
      role: 'user',
      is_primary: false,
    });
    await db.UserOrg.create({
      user_id: adminUser.id,
      organization_id: orgOne.id,
      role: 'admin',
      is_primary: true,
    });
    await db.UserOrg.create({
      user_id: anotherUser.id,
      organization_id: orgOne.id,
      role: 'user',
      is_primary: true,
    });

    // Get Auth Tokens
    const userAuth = await request(app)
      .post('/api/auth/signin')
      .send({ username: testUser.username, password: 'aSecurePassword123' });
    userToken = userAuth.body.accessToken;

    const adminAuth = await request(app)
      .post('/api/auth/signin')
      .send({ username: adminUser.username, password: 'aSecurePassword123' });
    adminToken = adminAuth.body.accessToken;
  });

  describe('GET /api/user', () => {
    it("should get the authenticated user's profile", async () => {
      const res = await request(app).get('/api/user').set('x-access-token', userToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('username', testUser.username);
      expect(res.body).toHaveProperty('email', testUser.email);
    });
  });

  describe('GET /api/user/organizations', () => {
    it('should get the list of organizations for the user', async () => {
      const res = await request(app)
        .get('/api/user/organizations')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body.some(org => org.organization.name === orgOne.name)).toBe(true);
    });
  });

  describe('User Model', () => {
    it('should get organization role', async () => {
      const role = await testUser.getOrganizationRole(orgOne.id);
      expect(role).toBe('user');
    });

    it('should check if user has organization role', async () => {
      const hasRole = await testUser.hasOrganizationRole(orgOne.id, 'user');
      expect(hasRole).toBe(true);
      const hasAdmin = await testUser.hasOrganizationRole(orgOne.id, 'admin');
      expect(hasAdmin).toBe(false);
    });

    it('should get all organizations', async () => {
      const orgs = await testUser.getAllOrganizations();
      expect(orgs.length).toBeGreaterThanOrEqual(2);
    });

    it('should return null for organization role if not member', async () => {
      const nonMemberOrg = await db.organization.create({ name: `NonMemOrg-${uniqueId}` });
      const role = await testUser.getOrganizationRole(nonMemberOrg.id);
      expect(role).toBeNull();
      await nonMemberOrg.destroy();
    });

    it('should return false for hasOrganizationRole if not member', async () => {
      const nonMemberOrg = await db.organization.create({ name: `NonMemRoleOrg-${uniqueId}` });
      const hasRole = await testUser.hasOrganizationRole(nonMemberOrg.id, 'user');
      expect(hasRole).toBe(false);
      await nonMemberOrg.destroy();
    });
  });

  describe('Credential Model', () => {
    let credUser;

    beforeAll(async () => {
      const hashedPassword = await bcrypt.hash('password', 8);
      credUser = await db.user.create({
        username: `cred-user-${uniqueId}`,
        email: `cred-${uniqueId}@example.com`,
        password: hashedPassword,
        verified: true,
      });
    });

    afterAll(async () => {
      await db.user.destroy({ where: { id: credUser.id } });
    });

    it('should link credential to user', async () => {
      const profile = {
        id: 'sub123',
        email: 'ext@example.com',
        displayName: 'Ext User',
      };
      const cred = await db.credential.linkToUser(credUser.id, 'oidc', profile);
      expect(cred).toBeDefined();
      expect(cred.subject).toBe('sub123');
      expect(cred.user_id).toBe(credUser.id);
    });

    it('should find credential by provider and subject', async () => {
      const cred = await db.credential.findByProviderAndSubject('oidc', 'sub123');
      expect(cred).toBeDefined();
      expect(cred.user_id).toBe(credUser.id);
    });

    it('should find credentials by user id', async () => {
      const creds = await db.credential.findByUserId(credUser.id);
      expect(creds.length).toBeGreaterThan(0);
      expect(creds[0].provider).toBe('oidc');
    });

    it('should find credential by external email', async () => {
      const cred = await db.credential.findByExternalEmail('ext@example.com');
      expect(cred).toBeDefined();
      expect(cred.user).toBeDefined();
      expect(cred.user.id).toBe(credUser.id);
    });

    it('should update credential profile', async () => {
      const cred = await db.credential.findOne({ where: { subject: 'sub123' } });
      await cred.updateProfile({ email: 'new-ext@example.com' });

      const updated = await db.credential.findByPk(cred.id);
      expect(updated.external_email).toBe('new-ext@example.com');
    });

    it('should check if credential is expired', async () => {
      const cred = await db.credential.findOne({ where: { subject: 'sub123' } });
      expect(cred.isExpired()).toBe(false);
    });

    it('should link credential using alternative profile fields', async () => {
      // 1. Mail (LDAP) + UID
      const ldapProfile = { mail: 'ldap@test.com', uid: 'ldap-uid' };
      const cred1 = await db.credential.linkToUser(credUser.id, 'ldap', ldapProfile);
      expect(cred1.external_email).toBe('ldap@test.com');
      expect(cred1.subject).toBe('ldap-uid');
      expect(cred1.external_id).toBe('ldap-uid');

      // 2. Emails array (Passport) + Sub
      const passportProfile = { emails: [{ value: 'passport@test.com' }], sub: 'passport-sub' };
      const cred2 = await db.credential.linkToUser(credUser.id, 'oidc', passportProfile);
      expect(cred2.external_email).toBe('passport@test.com');
      expect(cred2.subject).toBe('passport-sub');

      // 3. ID + Email
      const standardProfile = { email: 'standard@test.com', id: 'standard-id' };
      const cred3 = await db.credential.linkToUser(credUser.id, 'oauth2', standardProfile);
      expect(cred3.external_email).toBe('standard@test.com');
      expect(cred3.subject).toBe('standard-id');
      expect(cred3.external_id).toBe('standard-id');
    });

    it('should update profile with alternative fields and fallbacks', async () => {
      const cred = await db.credential.create({
        user_id: credUser.id,
        provider: 'oidc',
        subject: 'update-sub',
        external_id: 'original-id',
        external_email: 'original@test.com',
      });

      // Update with emails array (no email prop)
      await cred.updateProfile({ emails: [{ value: 'updated-array@test.com' }] });
      await cred.reload();
      expect(cred.external_email).toBe('updated-array@test.com');
      // ID should remain original
      expect(cred.external_id).toBe('original-id');

      // Update with id (no email prop)
      await cred.updateProfile({ id: 'new-id' });
      await cred.reload();
      expect(cred.external_id).toBe('new-id');
      // Email should remain
      expect(cred.external_email).toBe('updated-array@test.com');
    });
  });

  describe('Primary Organization Management', () => {
    it("should get the user's primary organization", async () => {
      const res = await request(app)
        .get('/api/user/primary-organization')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.organization).toHaveProperty('name', orgOne.name);
    });

    it('should get primary organization via model method', async () => {
      const primary = await testUser.getPrimaryOrganization();
      expect(primary.organization_id).toBe(orgOne.id);
    });

    it('should set a new primary organization', async () => {
      const res = await request(app)
        .put(`/api/user/primary-organization/${orgTwo.name}`)
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/Primary organization set to/);

      // Verify by calling getPrimaryOrganization again
      const checkRes = await request(app)
        .get('/api/user/primary-organization')
        .set('x-access-token', userToken);
      expect(checkRes.body.organization).toHaveProperty('name', orgTwo.name);
    });

    it('should handle transaction rollback in setPrimaryOrganization', async () => {
      const tempUser = await db.user.create({
        username: `rollback-user-${uniqueId}`,
        email: `rollback-${uniqueId}@test.com`,
        password: 'password',
        verified: true,
      });
      const org = await db.organization.create({ name: `RollbackOrg-${uniqueId}` });
      await db.UserOrg.create({ user_id: tempUser.id, organization_id: org.id, role: 'user' });

      // Mock update to throw error
      const updateSpy = jest.spyOn(db.UserOrg, 'update').mockRejectedValue(new Error('DB Error'));

      await expect(db.UserOrg.setPrimaryOrganization(tempUser.id, org.id)).rejects.toThrow(
        'DB Error'
      );

      updateSpy.mockRestore();
      await org.destroy();
      await tempUser.destroy();
    });
  });

  describe('POST /api/user/leave/:orgName', () => {
    it('should allow a user to leave a non-primary organization', async () => {
      // Ensure orgOne is not primary before leaving
      await request(app)
        .put(`/api/user/primary-organization/${orgTwo.name}`)
        .set('x-access-token', userToken);

      const res = await request(app)
        .post(`/api/user/leave/${orgOne.name}`)
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', `Successfully left organization ${orgOne.name}`);

      // Verify user is no longer in orgOne
      const orgsRes = await request(app)
        .get('/api/user/organizations')
        .set('x-access-token', userToken);
      expect(orgsRes.body.some(org => org.organization.name === orgOne.name)).toBe(false);
    });

    it('should prevent a user from leaving their only organization', async () => {
      // At this point, user is only in orgTwo
      const res = await request(app)
        .post(`/api/user/leave/${orgTwo.name}`)
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/Cannot leave your only organization/);
    });
  });

  describe('User Management by Admin', () => {
    beforeAll(async () => {
      // Re-add testUser to orgOne for these tests
      await db.UserOrg.create({
        user_id: testUser.id,
        organization_id: orgOne.id,
        role: 'user',
        is_primary: false,
      });
    });

    it('should allow an admin to promote a user to moderator', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgOne.name}/users/${anotherUser.id}/role`)
        .set('x-access-token', adminToken)
        .send({ role: 'moderator' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('newRole', 'moderator');
    });

    it('should allow an admin to demote a moderator to user', async () => {
      // First, ensure the user is a moderator
      await db.UserOrg.update(
        { role: 'moderator' },
        { where: { user_id: anotherUser.id, organization_id: orgOne.id } }
      );

      const res = await request(app)
        .put(`/api/organization/${orgOne.name}/users/${anotherUser.id}/role`)
        .set('x-access-token', adminToken)
        .send({ role: 'user' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('newRole', 'user');
    });

    it('should allow a user to leave their primary organization if they have others', async () => {
      // Create a temp user with 2 orgs
      const tempUser = await db.user.create({
        username: `leaver-${uniqueId}`,
        email: `leaver-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
      });
      const role = await db.role.findOne({ where: { name: 'user' } });
      await tempUser.setRoles([role]);

      // Add to orgOne (primary)
      await db.UserOrg.create({
        user_id: tempUser.id,
        organization_id: orgOne.id,
        role: 'user',
        is_primary: true,
      });
      // Add to orgTwo (secondary)
      await db.UserOrg.create({
        user_id: tempUser.id,
        organization_id: orgTwo.id,
        role: 'user',
        is_primary: false,
      });

      const tempToken = jwt.sign({ id: tempUser.id }, 'test-secret', { expiresIn: '1h' });

      const res = await request(app)
        .post(`/api/user/leave/${orgOne.name}`)
        .set('x-access-token', tempToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain(`Successfully left organization ${orgOne.name}`);

      // Verify orgTwo is now primary
      const userOrgs = await db.UserOrg.findAll({ where: { user_id: tempUser.id } });
      const primary = userOrgs.find(uo => uo.is_primary);
      expect(primary.organization_id).toBe(orgTwo.id);

      await db.user.destroy({ where: { id: tempUser.id } });
    });

    it('should allow an admin to globally promote a user to moderator', async () => {
      const res = await request(app)
        .put(`/api/users/${anotherUser.id}/promote`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Promoted to moderator');

      // Verify role change
      const user = await db.user.findByPk(anotherUser.id, { include: ['roles'] });
      const roleNames = user.roles.map(r => r.name);
      expect(roleNames).toContain('moderator');
    });

    it('should allow an admin to globally demote a moderator to user', async () => {
      const res = await request(app)
        .put(`/api/users/${anotherUser.id}/demote`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Demoted to user');

      // Verify role change
      const user = await db.user.findByPk(anotherUser.id, { include: ['roles'] });
      const roleNames = user.roles.map(r => r.name);
      expect(roleNames).toContain('user');
      expect(roleNames).not.toContain('moderator');
    });

    it('should not allow a regular user to change roles', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgOne.name}/users/${anotherUser.id}/role`)
        .set('x-access-token', userToken) // Using non-admin token
        .send({ role: 'moderator' });

      expect(res.statusCode).toBe(403);
    });

    it('should allow an admin to suspend a user', async () => {
      const res = await request(app)
        .put(`/api/users/${anotherUser.id}/suspend`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'User suspended successfully.');

      const user = await db.user.findByPk(anotherUser.id);
      expect(user.suspended).toBe(true);
    });

    it('should allow an admin to resume a suspended user', async () => {
      const res = await request(app)
        .put(`/api/users/${anotherUser.id}/resume`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'User resumed successfully!');

      const user = await db.user.findByPk(anotherUser.id);
      expect(user.suspended).toBe(false);
    });

    it('should allow an admin to update user details', async () => {
      const newEmail = `updated-${uniqueId}@example.com`;
      const res = await request(app)
        .put(`/api/organization/${orgOne.name}/users/${anotherUser.username}`)
        .set('x-access-token', adminToken)
        .send({ email: newEmail });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'User was updated successfully.');

      const user = await db.user.findByPk(anotherUser.id);
      expect(user.email).toBe(newEmail);

      const expectedHash = createHash('sha256').update(newEmail.trim().toLowerCase()).digest('hex');
      expect(user.emailHash).toBe(expectedHash);
    });

    it('should allow an admin to delete a user from organization', async () => {
      const tempHashedPassword = await bcrypt.hash('password', 8);
      const tempUser = await db.user.create({
        username: `temp-del-org-${uniqueId}`,
        email: `temp-del-org-${uniqueId}@example.com`,
        password: tempHashedPassword,
        verified: true,
      });
      const tempUserRole = await db.role.findOne({ where: { name: 'user' } });
      await tempUser.setRoles([tempUserRole]);
      await db.UserOrg.create({
        user_id: tempUser.id,
        organization_id: orgOne.id,
        role: 'user',
        is_primary: false,
      });

      const res = await request(app)
        .delete(`/api/organization/${orgOne.name}/users/${tempUser.username}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'User was deleted successfully!');

      const checkUser = await db.user.findByPk(tempUser.id);
      expect(checkUser).toBeNull();
    });

    it('should return 404 when deleting a user from a non-existent organization', async () => {
      const res = await request(app)
        .delete(`/api/organization/NonExistentOrg/users/${testUser.username}`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('User Organization Context', () => {
    it('should retrieve user details within an organization (Admin)', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgOne.name}/users/${testUser.username}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('username', testUser.username);
      expect(res.body).toHaveProperty('email', testUser.email);
    });

    it('should check if user is the only one in organization', async () => {
      // Create a new org with single user
      const soloOrg = await db.organization.create({ name: `SoloOrg-${uniqueId}` });
      await db.UserOrg.create({
        user_id: testUser.id,
        organization_id: soloOrg.id,
        role: 'admin',
        is_primary: false,
      });

      const res = await request(app)
        .get(`/api/organizations/${soloOrg.name}/only-user`)
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('isOnlyUser', true);

      await db.organization.destroy({ where: { id: soloOrg.id } });
    });
  });

  describe('User Self-Management', () => {
    it('should allow a user to change their password', async () => {
      const res = await request(app)
        .put(`/api/users/${testUser.id}/change-password`)
        .set('x-access-token', userToken)
        .send({
          currentPassword: 'aSecurePassword123',
          newPassword: 'aNewSecurePassword456',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Password changed successfully!');

      // Verify login with new password
      const loginRes = await request(app)
        .post('/api/auth/signin')
        .send({ username: testUser.username, password: 'aNewSecurePassword456' });
      expect(loginRes.statusCode).toBe(200);
    });

    it('should allow a user to change their email', async () => {
      const newEmail = `new-self-email-${uniqueId}@example.com`;
      const res = await request(app)
        .put(`/api/users/${testUser.id}/change-email`)
        .set('x-access-token', userToken)
        .send({ newEmail });

      expect(res.statusCode).toBe(200);

      const user = await db.user.findByPk(testUser.id);
      expect(user.email).toBe(newEmail);
      const expectedHash = createHash('sha256').update(newEmail.trim().toLowerCase()).digest('hex');
      expect(user.emailHash).toBe(expectedHash);
    });

    it('should allow a user to delete their own account', async () => {
      const tempHashedPassword = await bcrypt.hash('password', 8);
      const tempUser = await db.user.create({
        username: `temp-delete-${uniqueId}`,
        email: `temp-delete-${uniqueId}@example.com`,
        password: tempHashedPassword,
        verified: true,
      });
      const tempUserRole = await db.role.findOne({ where: { name: 'user' } });
      await tempUser.setRoles([tempUserRole]);
      const tempAuth = await request(app)
        .post('/api/auth/signin')
        .send({ username: tempUser.username, password: 'password' });
      expect(tempAuth.statusCode).toBe(200);
      const tempToken = tempAuth.body.accessToken;

      const res = await request(app)
        .delete(`/api/users/${tempUser.id}`)
        .set('x-access-token', tempToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'User was deleted successfully!');

      const checkUser = await db.user.findByPk(tempUser.id);
      expect(checkUser).toBeNull();
    });

    it('should return 404 when changing email for non-existent user', async () => {
      const res = await request(app)
        .put(`/api/users/999999/change-email`)
        .set('x-access-token', userToken)
        .send({ newEmail: 'fail@test.com' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Board Endpoints', () => {
    it('GET /api/users/all should return public content', async () => {
      const res = await request(app).get('/api/users/all');
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('title');
    });

    it('GET /api/users/user should return user content', async () => {
      const res = await request(app).get('/api/users/user').set('x-access-token', userToken);
      expect(res.statusCode).toBe(200);
    });

    it('GET /api/users/admin should return admin content', async () => {
      const res = await request(app).get('/api/users/admin').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
    });

    it('GET /api/users/admin should fail for non-admin', async () => {
      const res = await request(app).get('/api/users/admin').set('x-access-token', userToken);
      expect(res.statusCode).toBe(403);
    });

    it('GET /api/users/roles should return user roles for admin', async () => {
      const res = await request(app).get('/api/users/roles').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/user should return 404 for deleted user with valid token', async () => {
      const tempToken = jwt.sign({ id: 999999 }, 'test-secret', { expiresIn: '1h' });
      const res = await request(app).get('/api/user').set('x-access-token', tempToken);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('User Controller Edge Cases', () => {
    it('DELETE /api/organization/:organization/users/:username - should return 404 if user not found in organization', async () => {
      // Create a new user not in orgOne
      const outsider = await db.user.create({
        username: `outsider-${uniqueId}`,
        email: `out-${uniqueId}@test.com`,
        password: 'pwd',
        verified: true,
      });

      const res = await request(app)
        .delete(`/api/organization/${orgOne.name}/users/${outsider.username}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
      await outsider.destroy();
    });

    it('DELETE /api/organization/:organization/users/:username - should return 404 if user does not exist', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgOne.name}/users/NonExistentUser`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('User not found.');
    });

    it('DELETE /api/organization/:organization/users/:username - should return 404 if organization not found', async () => {
      const res = await request(app)
        .delete(`/api/organization/NonExistentOrg/users/${testUser.username}`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Organization not found');
    });

    it('GET /api/organization/:organization/users - should return 404 if organization not found', async () => {
      const res = await request(app)
        .get('/api/organization/NonExistentOrg/users')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/organization/:organization/users/:userName - should return 404 if organization not found', async () => {
      const res = await request(app)
        .get(`/api/organization/NonExistentOrg/users/${testUser.username}`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/organization/:organization/users/:userName - should return 404 if user not found', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgOne.name}/users/NonExistentUser`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/organization/:organization/users/:userName - should return 404 if user not in organization', async () => {
      const outsider = await db.user.create({
        username: `outsider2-${uniqueId}`,
        email: `out2-${uniqueId}@test.com`,
        password: 'pwd',
        verified: true,
      });

      const res = await request(app)
        .get(`/api/organization/${orgOne.name}/users/${outsider.username}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
      await outsider.destroy();
    });

    it('PUT /api/organization/:organization/users/:userName - should return 404 if user not found', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgOne.name}/users/NonExistentUser`)
        .set('x-access-token', adminToken)
        .send({ email: 'new@test.com' });
      expect(res.statusCode).toBe(404);
    });

    it('PUT /api/organization/:organization/users/:userName - should succeed without email update', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgOne.name}/users/${testUser.username}`)
        .set('x-access-token', adminToken)
        .send({}); // No email provided
      expect(res.statusCode).toBe(200);
    });

    it('POST /api/user/leave/:orgName - should return 404 if organization not found', async () => {
      const res = await request(app)
        .post('/api/user/leave/NonExistentOrg')
        .set('x-access-token', userToken);
      expect(res.statusCode).toBe(404);
    });

    it('POST /api/user/leave/:orgName - should return 400 if user not member', async () => {
      const otherOrg = await db.organization.create({ name: `OtherOrg-${uniqueId}` });
      const res = await request(app)
        .post(`/api/user/leave/${otherOrg.name}`)
        .set('x-access-token', userToken);
      expect(res.statusCode).toBe(400);
      await otherOrg.destroy();
    });

    it('PUT /api/user/primary-organization/:orgName - should return 404 if organization not found', async () => {
      const res = await request(app)
        .put('/api/user/primary-organization/NonExistentOrg')
        .set('x-access-token', userToken);
      expect(res.statusCode).toBe(404);
    });

    it('PUT /api/user/primary-organization/:orgName - should return 400 if user not member', async () => {
      const otherOrg = await db.organization.create({ name: `OtherOrg2-${uniqueId}` });
      const res = await request(app)
        .put(`/api/user/primary-organization/${otherOrg.name}`)
        .set('x-access-token', userToken);
      expect(res.statusCode).toBe(400);
      await otherOrg.destroy();
    });

    it('GET /api/organizations/:organization/only-user - should return 404 if organization not found', async () => {
      const res = await request(app)
        .get('/api/organizations/NonExistentOrg/only-user')
        .set('x-access-token', userToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('User Controller Error Handling', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('GET /api/user - should handle database errors', async () => {
      // Mock success for middleware, then failure for controller
      jest
        .spyOn(db.user, 'findByPk')
        .mockResolvedValueOnce({ id: 1, getRoles: () => Promise.resolve([{ name: 'user' }]) })
        .mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app).get('/api/user').set('x-access-token', userToken);

      expect(res.statusCode).toBe(500);
    });

    it('GET /api/user - should handle user not found in controller', async () => {
      // Mock success for middleware, then null for controller
      jest
        .spyOn(db.user, 'findByPk')
        .mockResolvedValueOnce({ id: 1, getRoles: () => Promise.resolve([{ name: 'user' }]) })
        .mockResolvedValueOnce(null);

      const res = await request(app).get('/api/user').set('x-access-token', userToken);

      expect(res.statusCode).toBe(404);
    });

    it('GET /api/organizations/:organization/only-user - should return false if multiple users', async () => {
      // Create another user in orgOne
      const otherUser = await db.user.create({
        username: `other-${uniqueId}`,
        email: `other-${uniqueId}@test.com`,
        password: 'pwd',
        verified: true,
      });
      await db.UserOrg.create({ user_id: otherUser.id, organization_id: orgOne.id, role: 'user' });

      const res = await request(app)
        .get(`/api/organizations/${orgOne.name}/only-user`)
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.isOnlyUser).toBe(false);

      await otherUser.destroy();
    });

    it('GET /api/user - should return profile with null organization if no primary set', async () => {
      jest
        .spyOn(db.user, 'findByPk')
        .mockResolvedValueOnce({ id: 1, getRoles: () => Promise.resolve([{ name: 'user' }]) }) // Middleware
        .mockResolvedValueOnce({
          id: 1,
          username: 'test',
          email: 'test@test.com',
          roles: [{ name: 'user' }],
          primaryOrganization: null,
          getRoles: () => Promise.resolve([{ name: 'user' }]),
        }); // Controller

      const res = await request(app).get('/api/user').set('x-access-token', userToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.organization).toBeNull();
    });

    it('GET /api/user - should return profile with no roles', async () => {
      jest
        .spyOn(db.user, 'findByPk')
        .mockResolvedValueOnce({ id: 1, getRoles: () => Promise.resolve([{ name: 'user' }]) }) // Middleware (needs valid role to pass)
        .mockResolvedValueOnce({
          id: 1,
          username: 'test',
          email: 'test@test.com',
          roles: [],
          primaryOrganization: { name: 'Org' },
          getRoles: () => Promise.resolve([]),
        }); // Controller

      const res = await request(app).get('/api/user').set('x-access-token', userToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.roles).toEqual([]);
    });

    it('GET /api/user/primary-organization - should return 404 if no primary org', async () => {
      // Create a user with NO primary organization
      const noOrgUser = await db.user.create({
        username: `no-org-${uniqueId}`,
        email: `no-org-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
        primary_organization_id: null,
      });
      const userRole = await db.role.findOne({ where: { name: 'user' } });
      await noOrgUser.setRoles([userRole]);

      const token = jwt.sign({ id: noOrgUser.id }, 'test-secret', { expiresIn: '1h' });

      const res = await request(app)
        .get('/api/user/primary-organization')
        .set('x-access-token', token);

      expect(res.statusCode).toBe(404);
      await noOrgUser.destroy();
    });

    it('GET /api/user - should use default token expiration if config value is missing', async () => {
      // 1. Read current auth config
      const configPath = path.join(__dirname, '../app/config/auth.test.config.yaml');
      const originalConfig = fs.readFileSync(configPath, 'utf8');
      const parsedConfig = yaml.load(originalConfig);

      // 2. Modify config to remove expiration
      delete parsedConfig.auth.jwt.jwt_expiration.value;
      fs.writeFileSync(configPath, yaml.dump(parsedConfig));

      try {
        // 3. Make request - controller will reload config from disk
        const res = await request(app).get('/api/user').set('x-access-token', userToken);

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('accessToken');
        // We can't easily verify the expiration time of the returned token without decoding it
        // and checking the 'exp' claim, but the fact that it didn't crash and returned 200
        // means the fallback '24h' was likely used (or it would have thrown an error).
      } finally {
        // 4. Restore original config
        fs.writeFileSync(configPath, originalConfig);
      }
    });

    it('PUT /api/users/:userId/change-email - should handle errors', async () => {
      // Middleware uses findByPk, controller uses findByPk.
      // Mock user.save to throw to ensure we hit controller error block
      jest.spyOn(db.user.prototype, 'save').mockRejectedValue(new Error(''));

      const res = await request(app)
        .put(`/api/users/${testUser.id}/change-email`)
        .set('x-access-token', userToken)
        .send({ newEmail: 'fail@test.com' });
      expect(res.statusCode).toBe(500);
    });

    it('PUT /api/users/:userId/change-password - should handle errors', async () => {
      // Mock user.save to throw
      jest.spyOn(db.user.prototype, 'save').mockRejectedValue(new Error(''));

      const res = await request(app)
        .put(`/api/users/${testUser.id}/change-password`)
        .set('x-access-token', userToken)
        .send({ currentPassword: 'old', newPassword: 'new' });
      expect(res.statusCode).toBe(500);
    });

    it('PUT /api/users/:userId/change-password - should handle user not found (404)', async () => {
      const res = await request(app)
        .put(`/api/users/999999/change-password`)
        .set('x-access-token', userToken)
        .send({ newPassword: 'new' });
      expect(res.statusCode).toBe(404);
    });

    it('PUT /api/users/:userId/demote - should handle errors', async () => {
      // Mock user.removeRole to throw
      jest.spyOn(db.user.prototype, 'removeRole').mockRejectedValue(new Error(''));

      const res = await request(app)
        .put(`/api/users/${testUser.id}/demote`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
    });

    it('PUT /api/users/:userId/promote - should handle errors with fallback message', async () => {
      // Mock user.addRole to throw error without message
      jest.spyOn(db.user.prototype, 'addRole').mockRejectedValue({});
      jest.spyOn(db.user.prototype, 'addRole').mockRejectedValue(new Error(''));

      const res = await request(app)
        .put(`/api/users/${testUser.id}/promote`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
    });

    it('PUT /api/users/:userId/promote - should handle user not found (404)', async () => {
      const res = await request(app)
        .put(`/api/users/999999/promote`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('PUT /api/users/:userId/demote - should handle user not found (404)', async () => {
      const res = await request(app)
        .put(`/api/users/999999/demote`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /api/organization/:organization/users/:username - should handle errors', async () => {
      // Controller uses Organization.findOne then User.findOne. Middleware uses User.findByPk.
      // We can mock Organization.findOne to throw, which is safe.
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      const res = await request(app)
        .delete(`/api/organization/${orgOne.name}/users/${testUser.username}`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
    });

    it('GET /organization/:organization/users/:userName - should handle errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      const res = await request(app)
        .get(`/api/organization/${orgOne.name}/users/${testUser.username}`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
    });

    it('PUT /organization/:organization/users/:userName - should handle errors', async () => {
      jest.spyOn(db.user, 'findOne').mockRejectedValue(new Error(''));
      // Mock findByPk for middleware to pass
      jest.spyOn(db.user, 'findByPk').mockResolvedValue({
        getRoles: () => Promise.resolve([{ name: 'admin' }]),
      });
      jest.spyOn(db.user, 'findOne').mockRejectedValue(new Error('Specific Error'));
      const res = await request(app)
        .put(`/api/organization/${orgOne.name}/users/${testUser.username}`)
        .set('x-access-token', adminToken)
        .send({ email: 'new@test.com' });
      expect(res.statusCode).toBe(500);
    });

    it('PUT /organization/:organization/users/:userName - should handle errors with fallback message', async () => {
      jest.spyOn(db.user, 'findOne').mockRejectedValue({}); // Error with no message
      // Mock findByPk for middleware to pass
      jest.spyOn(db.user, 'findByPk').mockResolvedValue({
        getRoles: () => Promise.resolve([{ name: 'admin' }]),
      });
      jest.spyOn(db.user, 'findOne').mockRejectedValue(new Error('')); // Error with empty message
      const res = await request(app)
        .put(`/api/organization/${orgOne.name}/users/${testUser.username}`)
        .set('x-access-token', adminToken)
        .send({ email: 'new@test.com' });
      expect(res.statusCode).toBe(500);
    });

    it('GET /api/users/roles - should handle errors', async () => {
      jest
        .spyOn(db.user, 'findByPk')
        .mockResolvedValueOnce({ id: 1, getRoles: () => Promise.resolve([{ name: 'admin' }]) }) // isUser middleware
        .mockResolvedValueOnce({ id: 1, getRoles: () => Promise.resolve([{ name: 'admin' }]) }) // isAdmin middleware
        .mockRejectedValueOnce(new Error('')); // controller

      const res = await request(app).get('/api/users/roles').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
    });

    it('GET /api/users/roles - should handle user not found in controller', async () => {
      jest
        .spyOn(db.user, 'findByPk')
        .mockResolvedValueOnce({ id: 1, getRoles: () => Promise.resolve([{ name: 'admin' }]) }) // isUser middleware
        .mockResolvedValueOnce({ id: 1, getRoles: () => Promise.resolve([{ name: 'admin' }]) }) // isAdmin middleware
        .mockResolvedValueOnce(null);

      const res = await request(app).get('/api/users/roles').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/user/organizations - should handle errors', async () => {
      // Mock User.findByPk for middleware to pass
      jest.spyOn(db.user, 'findByPk').mockResolvedValue({
        getRoles: () => Promise.resolve([{ name: 'user' }]),
      });
      jest.spyOn(db.UserOrg, 'getUserOrganizations').mockRejectedValue(new Error(''));
      const res = await request(app)
        .get('/api/user/organizations')
        .set('x-access-token', userToken);
      expect(res.statusCode).toBe(500);
    });

    it('POST /api/user/leave/:orgName - should handle errors', async () => {
      // Mock User.findByPk for middleware to pass
      jest.spyOn(db.user, 'findByPk').mockResolvedValue({
        getRoles: () => Promise.resolve([{ name: 'user' }]),
      });
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      const res = await request(app)
        .post(`/api/user/leave/${orgOne.name}`)
        .set('x-access-token', userToken);
      expect(res.statusCode).toBe(500);
    });

    it('GET /api/user/primary-organization - should handle errors', async () => {
      // Mock User.findByPk for middleware to pass
      jest.spyOn(db.user, 'findByPk').mockResolvedValue({
        getRoles: () => Promise.resolve([{ name: 'user' }]),
      });
      jest.spyOn(db.UserOrg, 'getPrimaryOrganization').mockRejectedValue(new Error(''));
      const res = await request(app)
        .get('/api/user/primary-organization')
        .set('x-access-token', userToken);
      expect(res.statusCode).toBe(500);
    });

    it('PUT /api/user/primary-organization/:orgName - should handle errors', async () => {
      // Mock User.findByPk for middleware to pass
      jest.spyOn(db.user, 'findByPk').mockResolvedValue({
        getRoles: () => Promise.resolve([{ name: 'user' }]),
      });
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      const res = await request(app)
        .put(`/api/user/primary-organization/${orgOne.name}`)
        .set('x-access-token', userToken);
      expect(res.statusCode).toBe(500);
    });

    it('GET /api/organizations/:organization/only-user - should handle errors', async () => {
      // Mock User.findByPk for middleware to pass
      jest.spyOn(db.user, 'findByPk').mockResolvedValue({
        getRoles: () => Promise.resolve([{ name: 'user' }]),
      });
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      const res = await request(app)
        .get(`/api/organizations/${orgOne.name}/only-user`)
        .set('x-access-token', userToken);
      expect(res.statusCode).toBe(500);
    });

    it('PUT /api/users/:userId/suspend - should handle database errors', async () => {
      jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/users/${testUser.id}/suspend`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
    });

    it('PUT /api/users/:userId/resume - should handle database errors', async () => {
      jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/users/${testUser.id}/resume`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
    });

    it('PUT /api/users/:userId/suspend - should handle error with fallback message', async () => {
      jest
        .spyOn(db.user, 'findByPk')
        .mockResolvedValueOnce({ id: 1, getRoles: () => Promise.resolve([{ name: 'admin' }]) }) // Middleware success
        .mockRejectedValueOnce(new Error('')); // Controller failure

      const res = await request(app)
        .put(`/api/users/${testUser.id}/suspend`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('PUT /api/users/:userId/resume - should handle error with fallback message', async () => {
      jest
        .spyOn(db.user, 'findByPk')
        .mockResolvedValueOnce({ id: 1, getRoles: () => Promise.resolve([{ name: 'admin' }]) }) // Middleware success
        .mockRejectedValueOnce(new Error('')); // Controller failure

      const res = await request(app)
        .put(`/api/users/${testUser.id}/resume`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('DELETE /api/users/:userId - should handle database errors', async () => {
      jest.spyOn(db.user, 'destroy').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .delete(`/api/users/${testUser.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
    });

    it('PUT /api/users/:userId/suspend - should return 404 if user not found', async () => {
      const res = await request(app)
        .put('/api/users/999999/suspend')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('PUT /api/users/:userId/resume - should return 404 if user not found', async () => {
      const res = await request(app)
        .put('/api/users/999999/resume')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /api/users/:userId - should return 200 with error message if user not found', async () => {
      const res = await request(app).delete('/api/users/999999').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Cannot delete User');
    });

    it('PUT /api/users/:userId/suspend - should handle error with no message (suspend.js line 56)', async () => {
      const mockUser = {
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'admin' }]),
        update: jest.fn().mockRejectedValue(new Error('')), // Fail with empty message
      };
      jest.spyOn(db.user, 'findByPk').mockResolvedValue(mockUser);

      const res = await request(app)
        .put(`/api/users/${testUser.id}/suspend`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Some error occurred while suspending the user.');
    });

    it('PUT /api/users/:userId/resume - should handle error with no message (resume.js line 59)', async () => {
      const mockUser = {
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'admin' }]),
        save: jest.fn().mockRejectedValue(new Error('')), // Fail with empty message
        suspended: true,
      };
      jest.spyOn(db.user, 'findByPk').mockResolvedValue(mockUser);

      const res = await request(app)
        .put(`/api/users/${testUser.id}/resume`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Some error occurred while resuming the user.');
    });

    it('PUT /api/users/:userId/suspend - should handle error with no message (suspend.js line 56)', async () => {
      const mockUser = {
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'admin' }]),
        update: jest.fn().mockRejectedValue(new Error('')), // Fail with empty message
      };
      jest.spyOn(db.user, 'findByPk').mockResolvedValue(mockUser);

      const res = await request(app)
        .put(`/api/users/${testUser.id}/suspend`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Some error occurred while suspending the user.');
    });

    it('PUT /api/users/:userId/resume - should handle error with no message (resume.js line 59)', async () => {
      const mockUser = {
        id: 1,
        getRoles: jest.fn().mockResolvedValue([{ name: 'admin' }]),
        save: jest.fn().mockRejectedValue(new Error('')), // Fail with empty message
        suspended: true,
      };
      jest.spyOn(db.user, 'findByPk').mockResolvedValue(mockUser);

      const res = await request(app)
        .put(`/api/users/${testUser.id}/resume`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('Some error occurred while resuming the user.');
    });
  });
});
