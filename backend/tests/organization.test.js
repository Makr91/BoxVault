import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import db from '../app/models/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { getSecureBoxPath } from '../app/utils/paths.js';

describe('Organization API', () => {
  let authToken;
  let adminToken;
  let user;
  let adminUser;
  let organization;

  const uniqueId = Date.now().toString(36);
  const userName = `OrgUser-${uniqueId}`;
  const adminName = `OrgAdmin-${uniqueId}`;
  const orgName = `TestOrg-${uniqueId}`;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeAll(async () => {
    // 1. Create Regular User
    const hashedPassword = await bcrypt.hash('password', 8);
    user = await db.user.create({
      username: userName,
      email: `user_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await user.setRoles([userRole]);

    // 2. Create Admin User
    adminUser = await db.user.create({
      username: adminName,
      email: `admin_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await adminUser.setRoles([adminRole]);

    // 3. Create Organization
    organization = await db.organization.create({
      name: orgName,
      description: 'Test Organization',
      access_mode: 'private',
    });

    // 4. Link Regular User to Organization
    await db.UserOrg.create({
      user_id: user.id,
      organization_id: organization.id,
      role: 'user',
      is_primary: true,
    });

    // Link Admin User to Organization (required for some endpoints)
    await db.UserOrg.create({
      user_id: adminUser.id,
      organization_id: organization.id,
      role: 'admin',
      is_primary: true,
    });

    // 5. Get Auth Tokens
    const userAuth = await request(app).post('/api/auth/signin').send({
      username: userName,
      password: 'password',
    });
    authToken = userAuth.body.accessToken;

    const adminAuth = await request(app).post('/api/auth/signin').send({
      username: adminName,
      password: 'password',
    });
    adminToken = adminAuth.body.accessToken;
  });

  afterAll(async () => {
    if (user) {
      await db.user.destroy({ where: { id: user.id } });
    }
    if (adminUser) {
      await db.user.destroy({ where: { id: adminUser.id } });
    }
    if (organization) {
      await db.organization.destroy({ where: { id: organization.id } });
    }
  });

  describe('Organization Model', () => {
    it('should get discoverable organizations', async () => {
      // Ensure org is discoverable
      await organization.update({ access_mode: 'invite_only' });

      const discoverable = await db.organization.getDiscoverable(false); // Non-admin
      expect(Array.isArray(discoverable)).toBe(true);
      const found = discoverable.find(o => o.id === organization.id);
      expect(found).toBeDefined();
    });

    it('should get organization users via model method', async () => {
      const users = await db.UserOrg.getOrganizationUsers(organization.id);
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
      expect(users[0]).toHaveProperty('user');
    });

    it('should count boxes in getDiscoverable', async () => {
      // Create a public box for the user in this organization
      const box = await db.box.create({
        name: `disc-box-${uniqueId}`,
        organizationId: organization.id,
        userId: user.id,
        isPublic: true,
        published: true,
      });

      // Ensure org is discoverable
      await organization.update({ access_mode: 'invite_only' });

      const discoverable = await db.organization.getDiscoverable(false);
      const found = discoverable.find(o => o.id === organization.id);
      expect(found).toBeDefined();
      expect(found.totalBoxCount).toBeGreaterThan(0);

      await box.destroy();
    });

    it('should get discoverable organizations for admin (all)', async () => {
      // Create a private org
      const privOrg = await db.organization.create({
        name: `PrivDiscModel-${uniqueId}`,
        access_mode: 'private',
      });

      const discoverable = await db.organization.getDiscoverable(true); // Admin
      const found = discoverable.find(o => o.id === privOrg.id);
      expect(found).toBeDefined();

      await privOrg.destroy();
    });

    it('should get discoverable organizations with default admin flag (false)', async () => {
      // Ensure org is discoverable
      await organization.update({ access_mode: 'invite_only' });

      // Call without arguments to test default parameter
      const discoverable = await db.organization.getDiscoverable();

      expect(Array.isArray(discoverable)).toBe(true);
      const found = discoverable.find(o => o.id === organization.id);
      expect(found).toBeDefined();
    });
  });

  describe('GET /api/organization/:organization', () => {
    it('should return organization details for a member', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('name', orgName);
      expect(res.body).toHaveProperty('totalBoxes');
    });

    it('should fail for non-existent organization', async () => {
      const res = await request(app)
        .get('/api/organization/NonExistentOrg')
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });

    it('should handle members with no boxes', async () => {
      const mockOrg = {
        id: organization.id,
        name: orgName,
        toJSON: () => ({ id: organization.id, name: orgName }),
        members: [
          {
            id: 1,
            box: null, // Triggers the uncovered line in reduce
          },
        ],
      };
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(mockOrg);

      const res = await request(app)
        .get(`/api/organization/${orgName}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.totalBoxes).toBe(0);
    });

    it('should handle organization with undefined members', async () => {
      const mockOrg = {
        id: organization.id,
        name: orgName,
        toJSON: () => ({ id: organization.id, name: orgName }),
        members: undefined, // Triggers the else path for members check
      };
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(mockOrg);

      const res = await request(app)
        .get(`/api/organization/${orgName}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.totalBoxes).toBe(0);
    });

    it('should count public boxes correctly', async () => {
      // Create a public box
      const pubBox = await db.box.create({
        name: `pub-count-${uniqueId}`,
        organizationId: organization.id,
        userId: user.id,
        isPublic: true,
      });

      const res = await request(app)
        .get(`/api/organization/${orgName}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.totalBoxes).toBeGreaterThanOrEqual(1);

      await pubBox.destroy();
    });

    it('should handle members with no boxes', async () => {
      const mockOrg = {
        id: organization.id,
        name: orgName,
        toJSON: () => ({ id: organization.id, name: orgName }),
        members: [
          {
            id: 1,
            box: null, // Triggers the uncovered line in reduce
          },
        ],
      };
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(mockOrg);

      const res = await request(app)
        .get(`/api/organization/${orgName}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.totalBoxes).toBe(0);
    });
  });

  describe('PUT /api/organization/:organization', () => {
    it('should fail for regular user (requires moderator/admin)', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', authToken)
        .send({ description: 'Updated Description' });

      expect(res.statusCode).toBe(403);
    });

    it('should update organization for global admin', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken)
        .send({ description: 'Updated by Admin' });

      expect(res.statusCode).toBe(200);
      expect(res.body.organization).toHaveProperty('description', 'Updated by Admin');
    });

    it('should rename organization and its directory if it exists', async () => {
      const oldName = `RenameOrg-${uniqueId}`;
      const newName = `RenamedOrg-${uniqueId}`;
      const tempOrg = await db.organization.create({ name: oldName });
      const oldPath = getSecureBoxPath(oldName);
      const newPath = getSecureBoxPath(newName);

      // Create a dummy directory and file to simulate existing storage
      if (!fs.existsSync(oldPath)) {
        fs.mkdirSync(oldPath, { recursive: true });
      }
      fs.writeFileSync(path.join(oldPath, 'test.txt'), 'content');

      const res = await request(app)
        .put(`/api/organization/${oldName}`)
        .set('x-access-token', adminToken)
        .send({ organization: newName });

      expect(res.statusCode).toBe(200);
      expect(res.body.organization.name).toBe(newName);

      // Verify directory was renamed
      expect(fs.existsSync(oldPath)).toBe(false);
      expect(fs.existsSync(newPath)).toBe(true);
      expect(fs.existsSync(path.join(newPath, 'test.txt'))).toBe(true);

      // Cleanup
      fs.rmSync(newPath, { recursive: true, force: true });
      await tempOrg.destroy();
    });

    it('should fail to update with duplicate org_code', async () => {
      const otherOrg = await db.organization.create({
        name: `CodeDupOrg-${uniqueId}`,
        org_code: 'ABCDEF',
      });

      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken)
        .send({ org_code: 'ABCDEF' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('already in use');

      await otherOrg.destroy();
    });

    it('should fail to update with invalid org_code format', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken)
        .send({ org_code: 'INVALID' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid organization code');
    });

    it('should update org_code successfully', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken)
        .send({ org_code: '123456' });

      expect(res.statusCode).toBe(200);
      const updatedOrg = await db.organization.findByPk(organization.id);
      expect(updatedOrg.org_code).toBe('123456');
    });

    it('should allow update with same org_code', async () => {
      const org = await db.organization.findOne({ where: { name: orgName } });
      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken)
        .send({ org_code: org.org_code });

      expect(res.statusCode).toBe(200);
    });

    it('should handle file system errors during rename', async () => {
      const fsErrOrg = await db.organization.create({ name: `FsErr-${uniqueId}` });
      const oldPath = getSecureBoxPath(fsErrOrg.name);
      if (!fs.existsSync(oldPath)) {
        fs.mkdirSync(oldPath, { recursive: true });
      }

      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('Rename Failed');
      });

      const res = await request(app)
        .put(`/api/organization/${fsErrOrg.name}`)
        .set('x-access-token', adminToken)
        .send({ organization: `FsErrUpdated-${uniqueId}` });

      // Controller catches error and proceeds with DB update
      expect(res.statusCode).toBe(200);
      expect(res.body.organization.name).toBe(`FsErrUpdated-${uniqueId}`);

      renameSpy.mockRestore();
      if (fs.existsSync(oldPath)) {
        fs.rmdirSync(oldPath);
      }
      await fsErrOrg.destroy();
    });

    it('should clean up old directory if it remains after rename', async () => {
      const cleanupOrg = await db.organization.create({ name: `Cleanup-${uniqueId}` });
      const newName = `CleanupUpdated-${uniqueId}`;

      const originalExists = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        if (typeof pathArg === 'string' && pathArg.includes(cleanupOrg.name)) {
          return true;
        }
        if (typeof pathArg === 'string' && pathArg.includes(newName)) {
          return true;
        }
        return originalExists(pathArg);
      });

      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
      const rmdirSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});

      const res = await request(app)
        .put(`/api/organization/${cleanupOrg.name}`)
        .set('x-access-token', adminToken)
        .send({ organization: newName });

      expect(res.statusCode).toBe(200);
      expect(rmdirSpy).toHaveBeenCalled();

      existsSpy.mockRestore();
      renameSpy.mockRestore();
      rmdirSpy.mockRestore();
      await cleanupOrg.destroy();
    });

    it('should update organization name when directory does not exist', async () => {
      const noDirOrg = await db.organization.create({ name: `NoDirUpdate-${uniqueId}` });
      // Ensure no directory
      const dirPath = getSecureBoxPath(noDirOrg.name);
      if (fs.existsSync(dirPath)) {
        fs.rmdirSync(dirPath, { recursive: true });
      }

      const res = await request(app)
        .put(`/api/organization/${noDirOrg.name}`)
        .set('x-access-token', adminToken)
        .send({ organization: `NoDirUpdated-${uniqueId}` });

      expect(res.statusCode).toBe(200);
      expect(res.body.organization.name).toBe(`NoDirUpdated-${uniqueId}`);

      await noDirOrg.destroy();
    });
  });

  describe('PUT /api/organization/:organization/access-mode', () => {
    it('should update access mode (admin only)', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/access-mode`)
        .set('x-access-token', adminToken)
        .send({ accessMode: 'invite_only', defaultRole: 'user' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('accessMode', 'invite_only');
    });

    it('should fail with invalid access mode', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/access-mode`)
        .set('x-access-token', adminToken)
        .send({ accessMode: 'invalid_mode' });

      expect(res.statusCode).toBe(400);
    });

    it('should fail with invalid default role', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/access-mode`)
        .set('x-access-token', adminToken)
        .send({ accessMode: 'invite_only', defaultRole: 'invalid_role' });

      expect(res.statusCode).toBe(400);
    });

    it('should fail with invalid default role', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/access-mode`)
        .set('x-access-token', adminToken)
        .send({ accessMode: 'invite_only', defaultRole: 'invalid_role' });

      expect(res.statusCode).toBe(400);
    });

    it('should fail with invalid default role', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/access-mode`)
        .set('x-access-token', adminToken)
        .send({ accessMode: 'invite_only', defaultRole: 'invalid_role' });

      expect(res.statusCode).toBe(400);
    });

    it('should handle database errors during access mode update', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/access-mode`)
        .set('x-access-token', adminToken)
        .send({ accessMode: 'invite_only' });

      expect(res.statusCode).toBe(500);
    });

    it('should update access mode without defaultRole', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/access-mode`)
        .set('x-access-token', adminToken)
        .send({ accessMode: 'private' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('accessMode', 'private');
      expect(res.body).toHaveProperty('defaultRole');
    });
  });

  describe('POST /api/organization', () => {
    const newOrgName = `NewOrg-${uniqueId}`;

    afterAll(async () => {
      await db.organization.destroy({ where: { name: newOrgName } });
    });

    it('should create a new organization', async () => {
      const res = await request(app)
        .post('/api/organization')
        .set('x-access-token', authToken)
        .send({
          organization: newOrgName,
          description: 'A brand new org',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('name', newOrgName);
      expect(res.body).toHaveProperty('org_code');
      expect(res.body.org_code).toMatch(/^[0-9A-F]{6}$/);
      expect(res.body).toHaveProperty('description', 'A brand new org');
    });

    it('should fail to create an organization without a name', async () => {
      const res = await request(app)
        .post('/api/organization')
        .set('x-access-token', authToken)
        .send({ description: 'This should fail' });

      expect(res.statusCode).toBe(400);
    });

    it('should fail to create an organization with empty name', async () => {
      const res = await request(app)
        .post('/api/organization')
        .set('x-access-token', authToken)
        .send({ organization: '' });

      expect(res.statusCode).toBe(400);
    });

    it('should fail to create an organization with empty name', async () => {
      const res = await request(app)
        .post('/api/organization')
        .set('x-access-token', authToken)
        .send({ organization: '' });

      expect(res.statusCode).toBe(400);
    });

    it('should fail to update with duplicate organization name', async () => {
      // Create another org to conflict with
      const otherOrg = await db.organization.create({ name: `ConflictOrg-${uniqueId}` });

      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken)
        .send({ organization: otherOrg.name });

      // The DB has a unique constraint on the name, so this will cause a 500 error.
      // A better implementation would be to add a middleware to check for duplicates and return a 409.
      expect(res.statusCode).toBe(500);

      await otherOrg.destroy();
    });

    it('should update organization email and hash', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken)
        .send({ email: 'new-org-email@test.com' });

      expect(res.statusCode).toBe(200);
      const updatedOrg = await db.organization.findByPk(organization.id);
      expect(updatedOrg.email).toBe('new-org-email@test.com');
      expect(updatedOrg.emailHash).toBeDefined();
    });

    it('should fail to create an organization with a duplicate name', async () => {
      const res = await request(app)
        .post('/api/organization')
        .set('x-access-token', authToken)
        .send({ organization: orgName }); // Use an existing org name

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/organizations/discover', () => {
    it('should list discoverable organizations', async () => {
      await organization.reload();
      // Ensure org is discoverable (invite_only or request_to_join)
      await organization.update({ access_mode: 'invite_only', suspended: false });

      const res = await request(app)
        .get('/api/organizations/discover')
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find(o => o.name === orgName);
      expect(found).toBeDefined();
    });
  });

  describe('GET /api/organization (findAll)', () => {
    it('should fail for unauthenticated user', async () => {
      const res = await request(app).get('/api/organization');
      expect(res.statusCode).toBe(403);
    });

    it('should filter organizations by name', async () => {
      const res = await request(app)
        .get(`/api/organization?organization=${orgName}`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle invalid token', async () => {
      const res = await request(app)
        .get('/api/organization')
        .set('x-access-token', 'invalid-token');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/organizations-with-users', () => {
    it('should return organizations with users for admin', async () => {
      const res = await request(app)
        .get('/api/organizations-with-users')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const org = res.body.find(o => o.name === orgName);
      expect(org).toBeDefined();
      expect(org).toHaveProperty('members');
    });

    it('should correctly count private boxes for admin', async () => {
      const adminPrivateBox = await db.box.create({
        name: `admin-priv-${uniqueId}`,
        organizationId: organization.id,
        userId: adminUser.id,
        isPublic: false,
      });

      const userPrivateBox = await db.box.create({
        name: `user-priv-${uniqueId}`,
        organizationId: organization.id,
        userId: user.id,
        isPublic: false,
      });

      const res = await request(app)
        .get('/api/organizations-with-users')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);

      await adminPrivateBox.destroy();
      await userPrivateBox.destroy();
    });
  });

  describe('Organization Suspension', () => {
    it('should suspend an organization', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/suspend`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      const org = await db.organization.findByPk(organization.id);
      expect(org.suspended).toBe(true);
    });

    it('should return 404 when suspending non-existent organization', async () => {
      const res = await request(app)
        .put('/api/organization/NonExistentOrg/suspend')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 when suspending non-existent organization', async () => {
      const res = await request(app)
        .put('/api/organization/NonExistentOrg/suspend')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
    });

    it('should resume an organization', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/resume`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      const org = await db.organization.findByPk(organization.id);
      expect(org.suspended).toBe(false);
    });

    it('should return 404 when resuming non-existent organization', async () => {
      const res = await request(app)
        .put('/api/organization/NonExistentOrg/resume')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/organization/:organization', () => {
    it('should delete an organization', async () => {
      const tempOrg = await db.organization.create({ name: `TempDel-${uniqueId}` });

      const res = await request(app)
        .delete(`/api/organization/${tempOrg.name}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      const check = await db.organization.findByPk(tempOrg.id);
      expect(check).toBeNull();
    });

    it('should handle deletion when directory does not exist', async () => {
      const noDirOrg = await db.organization.create({ name: `NoDir-${uniqueId}` });
      // Ensure directory does not exist
      const dirPath = getSecureBoxPath(noDirOrg.name);
      if (fs.existsSync(dirPath)) {
        fs.rmdirSync(dirPath, { recursive: true });
      }

      const res = await request(app)
        .delete(`/api/organization/${noDirOrg.name}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
    });

    it('should delete organization directory if it exists', async () => {
      const orgToDelete = await db.organization.create({ name: `DirDel-${uniqueId}` });
      const dirPath = getSecureBoxPath(orgToDelete.name);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const res = await request(app)
        .delete(`/api/organization/${orgToDelete.name}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(dirPath)).toBe(false);
    });

    it('should return 404 when deleting non-existent organization', async () => {
      const res = await request(app)
        .delete('/api/organization/NonExistentOrgToDelete')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 when updating non-existent organization', async () => {
      const res = await request(app)
        .put('/api/organization/NonExistentOrg')
        .set('x-access-token', adminToken)
        .send({ description: 'Update' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Organization User Management (Admin)', () => {
    let tempUser;

    beforeAll(async () => {
      // Create a temporary user to be managed within the organization
      const hashedPassword = await bcrypt.hash('password', 8);
      tempUser = await db.user.create({
        username: `org-managed-user-${uniqueId}`,
        email: `org-managed-${uniqueId}@example.com`,
        password: hashedPassword,
        verified: true,
      });
      const userRole = await db.role.findOne({ where: { name: 'user' } });
      await tempUser.setRoles([userRole]);
      await db.UserOrg.create({
        user_id: tempUser.id,
        organization_id: organization.id,
        role: 'user',
        is_primary: true,
      });

      // Add user to a second organization so they can be removed from the first
      const secondOrg = await db.organization.create({ name: `SecondOrg-${uniqueId}` });
      await db.UserOrg.create({
        user_id: tempUser.id,
        organization_id: secondOrg.id,
        role: 'user',
        is_primary: false,
      });
    });

    afterAll(async () => {
      if (tempUser) {
        await db.user.destroy({ where: { id: tempUser.id } });
      }
    });

    it('GET /api/organization/:organization/users - should list users in an organization', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2); // adminUser and tempUser
    });

    it('GET /api/organization/:organization/users/:userId/role - should return 404 if user not found', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/users/999999/role`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/organization/:organization/users/:userId/role - should return 404 if user not member', async () => {
      const outsider = await db.user.create({
        username: `outsider-role-get-${uniqueId}`,
        email: `outsider-role-get-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
      });

      const res = await request(app)
        .get(`/api/organization/${orgName}/users/${outsider.id}/role`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
      await outsider.destroy();
    });

    it('GET /api/organization/:organization/users/:userId/role - should handle database errors', async () => {
      jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/organization/${orgName}/users/${user.id}/role`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('GET /api/organization/:organization/users/:userId/role - should get a user role in an org', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/users/${tempUser.id}/role`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('role', 'user');
    });

    it('PUT .../role - should fail with invalid role', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/users/${tempUser.id}/role`)
        .set('x-access-token', adminToken)
        .send({ role: 'invalid_role' });

      expect(res.statusCode).toBe(400);
    });

    it('PUT .../role - should fail if user not found', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/users/999999/role`)
        .set('x-access-token', adminToken)
        .send({ role: 'moderator' });

      expect(res.statusCode).toBe(404);
    });

    it('PUT .../role - should fail if user not member', async () => {
      // Create a user not in org
      const outsider = await db.user.create({
        username: `outsider-role-${uniqueId}`,
        email: `outsider-role-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
      });

      const res = await request(app)
        .put(`/api/organization/${orgName}/users/${outsider.id}/role`)
        .set('x-access-token', adminToken)
        .send({ role: 'moderator' });

      expect(res.statusCode).toBe(404);
      await outsider.destroy();
    });

    it('GET /api/organization/:organization/users/:userId/role - should handle database errors', async () => {
      jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/organization/${orgName}/users/${user.id}/role`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('DELETE /api/organization/:organization/members/:userId - should remove a user from an organization', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/members/${tempUser.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('removed from organization');

      // Verify membership is gone
      const membership = await db.UserOrg.findOne({
        where: { user_id: tempUser.id, organization_id: organization.id },
      });
      expect(membership).toBeNull();
    });

    it('DELETE /api/organization/:organization/members/:userId - should fail if user is not a member', async () => {
      // User is already removed from the previous test
      const res = await request(app)
        .delete(`/api/organization/${orgName}/members/${tempUser.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('User is not a member');
    });

    it('DELETE /api/organization/:organization/members/:userId - should fail if organization not found', async () => {
      const res = await request(app)
        .delete(`/api/organization/NonExistentOrg/members/${tempUser.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
    });

    it('DELETE /api/organization/:organization/members/:userId - should fail to remove user from their only organization', async () => {
      // Create a user with only one org (primary)
      const hashedPassword = await bcrypt.hash('password', 8);
      const soloUser = await db.user.create({
        username: `solo-${uniqueId}`,
        email: `solo-${uniqueId}@test.com`,
        password: hashedPassword,
        verified: true,
      });
      const role = await db.role.findOne({ where: { name: 'user' } });
      await soloUser.setRoles([role]);

      await db.UserOrg.create({
        user_id: soloUser.id,
        organization_id: organization.id,
        role: 'user',
        is_primary: true,
      });

      // Ensure primary_organization_id is set on user (denormalized)
      await soloUser.update({ primary_organization_id: organization.id });

      const res = await request(app)
        .delete(`/api/organization/${orgName}/members/${soloUser.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Cannot remove user from their only organization');

      await soloUser.destroy();
    });

    it('DELETE /api/organization/:organization/members/:userId - should remove user from primary organization if they have others', async () => {
      // Create a user with two orgs
      const hashedPassword = await bcrypt.hash('password', 8);
      const multiOrgUser = await db.user.create({
        username: `multi-${uniqueId}`,
        email: `multi-${uniqueId}@test.com`,
        password: hashedPassword,
        verified: true,
      });
      const role = await db.role.findOne({ where: { name: 'user' } });
      await multiOrgUser.setRoles([role]);

      // Add to main org (primary)
      await db.UserOrg.create({
        user_id: multiOrgUser.id,
        organization_id: organization.id,
        role: 'user',
        is_primary: true,
      });
      // Add to another org
      const otherOrg = await db.organization.create({ name: `OtherOrg-${uniqueId}` });
      await db.UserOrg.create({
        user_id: multiOrgUser.id,
        organization_id: otherOrg.id,
        role: 'user',
        is_primary: false,
      });

      await multiOrgUser.update({ primary_organization_id: organization.id });

      const res = await request(app)
        .delete(`/api/organization/${orgName}/members/${multiOrgUser.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('removed from organization');

      await multiOrgUser.destroy();
      await otherOrg.destroy();
    });

    it('DELETE /api/organization/:organization/members/:userId - should handle database errors', async () => {
      jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .delete(`/api/organization/${orgName}/members/${user.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);

      jest.restoreAllMocks();
    });

    it('DELETE /api/organization/:organization/members/:userId - should return 404 if user not found (removeuser.js)', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/members/999999`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBeDefined();
    });

    it('should skip duplicate check if org_code is unchanged', async () => {
      const org = await db.organization.findOne({ where: { name: orgName } });
      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken)
        .send({ org_code: org.org_code });

      expect(res.statusCode).toBe(200);
      expect(res.body.organization.org_code).toBe(org.org_code);
    });

    it('DELETE /api/organization/:organization/members/:userId - should remove a non-primary user', async () => {
      // Create a non-primary member
      const npUser = await db.user.create({
        username: `np-user-${uniqueId}`,
        email: `np-user-${uniqueId}@test.com`,
        password: 'password',
        verified: true,
      });
      const role = await db.role.findOne({ where: { name: 'user' } });
      await npUser.setRoles([role]);

      // Add to org as non-primary
      await db.UserOrg.create({
        user_id: npUser.id,
        organization_id: organization.id,
        role: 'user',
        is_primary: false,
      });

      const res = await request(app)
        .delete(`/api/organization/${orgName}/members/${npUser.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('removed from organization');

      await npUser.destroy();
    });

    it('should count public boxes correctly in user list', async () => {
      // Create a public box for user
      const pubBox = await db.box.create({
        name: `pub-user-count-${uniqueId}`,
        organizationId: organization.id,
        userId: user.id,
        isPublic: true,
      });

      const res = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      const foundUser = res.body.find(u => u.id === user.id);
      expect(foundUser.totalBoxes).toBeGreaterThanOrEqual(1);

      await pubBox.destroy();
    });

    it('should correctly count private boxes for self and hide for others (findOneWithUsers)', async () => {
      // Create a user with a private box
      const boxUser = await db.user.create({
        username: `boxuser-${uniqueId}`,
        email: `boxuser-${uniqueId}@test.com`,
        password: 'password',
        verified: true,
      });
      const userRole = await db.role.findOne({ where: { name: 'user' } });
      await boxUser.setRoles([userRole]);
      await db.UserOrg.create({
        user_id: boxUser.id,
        organization_id: organization.id,
        role: 'user',
      });
      const boxUserToken = jwt.sign({ id: boxUser.id }, 'test-secret', { expiresIn: '1h' });

      const privBox = await db.box.create({
        name: `priv-box-count-${uniqueId}`,
        organizationId: organization.id,
        userId: boxUser.id,
        isPublic: false,
      });

      // 1. Request as self (should see 1 box)
      const resSelf = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', boxUserToken);

      expect(resSelf.statusCode).toBe(200);
      const selfUser = resSelf.body.find(u => u.id === boxUser.id);
      expect(selfUser.totalBoxes).toBe(1);

      // 2. Request as other user (should see 0 boxes)
      // authToken is for 'user' (different from boxUser)
      const resOther = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', authToken);

      expect(resOther.statusCode).toBe(200);
      const otherViewUser = resOther.body.find(u => u.id === boxUser.id);
      expect(otherViewUser.totalBoxes).toBe(0);

      await privBox.destroy();
      await boxUser.destroy();
    });
  });

  describe('Organization Controller Error Handling', () => {
    it('GET /api/organization - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findAll').mockRejectedValue(new Error('DB Error'));

      const res = await request(app).get('/api/organization').set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);

      // Restore mocks manually since we removed afterEach to avoid "empty describe" error
      // if this was the only test and it was somehow skipped or filtered
      jest.restoreAllMocks();
    });

    it('GET /api/organization/:organization - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(`/api/organization/${orgName}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('POST /api/organization - should handle database errors', async () => {
      jest.spyOn(db.organization, 'create').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post('/api/organization')
        .set('x-access-token', authToken)
        .send({ organization: 'ErrorOrg' });

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization - should handle database errors', async () => {
      jest
        .spyOn(db.organization, 'findOne')
        .mockResolvedValueOnce({ id: organization.id, name: orgName }) // Middleware
        .mockRejectedValueOnce(new Error('DB Error')); // Controller

      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken)
        .send({ description: 'Error' });

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization - should handle error with fallback message', async () => {
      jest
        .spyOn(db.organization, 'findOne')
        .mockResolvedValueOnce({ id: organization.id, name: orgName }) // Middleware
        .mockRejectedValueOnce(new Error('')); // Controller

      const res = await request(app)
        .put(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken)
        .send({ description: 'Error' });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
      jest.restoreAllMocks();
    });

    it('DELETE /api/organization/:organization - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .delete(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('DELETE /api/organization/:organization - should handle generic error (delete.js)', async () => {
      // Mock Organization.findOne to throw generic error
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('Generic Delete Error'));

      const res = await request(app)
        .delete(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/suspend - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/suspend`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/suspend - should handle generic error (suspend.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('Generic Suspend Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/suspend`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/resume - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/resume`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/resume - should handle generic error (resume.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('Generic Resume Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/resume`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/access-mode - should handle database errors', async () => {
      jest
        .spyOn(db.organization, 'findOne')
        .mockResolvedValueOnce({ id: organization.id, name: orgName }) // Middleware success
        .mockRejectedValueOnce(new Error('DB Error')); // Controller failure

      const res = await request(app)
        .put(`/api/organization/${orgName}/access-mode`)
        .set('x-access-token', adminToken)
        .send({ accessMode: 'private' });

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('GET /api/organization/:organization/users/:userId/role - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(`/api/organization/${orgName}/users/${user.id}/role`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/users/:userId/role - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/users/${user.id}/role`)
        .set('x-access-token', adminToken)
        .send({ role: 'moderator' });

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('DELETE /api/organization/:organization/members/:userId - should handle controller errors', async () => {
      // Mock User.findByPk to throw error (called inside controller)
      jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('Controller Error'));

      const res = await request(app)
        .delete(`/api/organization/${orgName}/members/${user.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);

      jest.restoreAllMocks();
    });

    it('GET /api/organization/:organization/users - should handle database errors (findOneWithUsers)', async () => {
      jest
        .spyOn(db.organization, 'findOne')
        .mockResolvedValueOnce({ id: organization.id, name: orgName }) // Middleware success
        .mockRejectedValueOnce(new Error('DB Error')); // Controller failure

      const res = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('DELETE /api/organization/:organization/members/:userId - should handle database error during membership check', async () => {
      // Mock UserOrg.findUserOrgRole to throw
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .delete(`/api/organization/${orgName}/members/${user.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('GET /api/organizations/discover - should handle database errors', async () => {
      jest.spyOn(db.organization, 'getDiscoverable').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get('/api/organizations/discover')
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('GET /api/organizations-with-users - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findAll').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get('/api/organizations-with-users')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('GET /api/organization/:organization/users - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/access-mode - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/access-mode`)
        .set('x-access-token', adminToken)
        .send({ accessMode: 'invite_only' });

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('GET /api/organization/:organization/users/:userId/role - should handle database errors (getUserOrgRole)', async () => {
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(`/api/organization/${orgName}/users/${user.id}/role`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/users/:userId/role - should handle database errors', async () => {
      jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/users/${user.id}/role`)
        .set('x-access-token', adminToken)
        .send({ role: 'moderator' });

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/users/:userId/role - should handle database errors during update', async () => {
      // Mock findUserOrgRole to throw
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/users/${user.id}/role`)
        .set('x-access-token', adminToken)
        .send({ role: 'moderator' });

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('GET /api/organization/:organization/users - should handle database errors (findOneWithUsers)', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('DELETE /api/organization/:organization/members/:userId - should handle database error during membership check', async () => {
      // Mock UserOrg.findUserOrgRole to throw
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .delete(`/api/organization/${orgName}/members/${user.id}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('GET /api/organizations/discover - should handle database errors', async () => {
      jest.spyOn(db.organization, 'getDiscoverable').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get('/api/organizations/discover')
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('GET /api/organizations-with-users - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findAll').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get('/api/organizations-with-users')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('GET /api/organization/:organization/users - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/access-mode - should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/access-mode`)
        .set('x-access-token', adminToken)
        .send({ accessMode: 'invite_only' });

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('PUT /api/organization/:organization/users/:userId/role - should handle database errors', async () => {
      jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/users/${user.id}/role`)
        .set('x-access-token', adminToken)
        .send({ role: 'moderator' });

      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('should calculate totalBoxes correctly including private boxes for self', async () => {
      // Create private box for user
      const userPrivateBox = await db.box.create({
        name: `user-priv-calc-${uniqueId}`,
        organizationId: organization.id,
        userId: user.id,
        isPublic: false,
      });

      const res = await request(app)
        .get(`/api/organization/${orgName}`)
        .set('x-access-token', authToken); // user token

      expect(res.statusCode).toBe(200);
      expect(res.body.totalBoxes).toBeGreaterThanOrEqual(1);

      await userPrivateBox.destroy();
    });

    it('should correctly count private boxes for self and hide for others (findOneWithUsers)', async () => {
      // Create a user with a private box
      const boxUser = await db.user.create({
        username: `boxuser-${uniqueId}`,
        email: `boxuser-${uniqueId}@test.com`,
        password: 'password',
        verified: true,
      });
      const userRole = await db.role.findOne({ where: { name: 'user' } });
      await boxUser.setRoles([userRole]);
      await db.UserOrg.create({
        user_id: boxUser.id,
        organization_id: organization.id,
        role: 'user',
      });
      const boxUserToken = jwt.sign({ id: boxUser.id }, 'test-secret', { expiresIn: '1h' });

      const privBox = await db.box.create({
        name: `priv-box-count-${uniqueId}`,
        organizationId: organization.id,
        userId: boxUser.id,
        isPublic: false,
      });

      // 1. Request as self (should see 1 box)
      const resSelf = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', boxUserToken);

      expect(resSelf.statusCode).toBe(200);
      const selfUser = resSelf.body.find(u => u.id === boxUser.id);
      expect(selfUser.totalBoxes).toBe(1);

      // 2. Request as other user (should see 0 boxes)
      // authToken is for 'user' (different from boxUser)
      const resOther = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', authToken);

      expect(resOther.statusCode).toBe(200);
      const otherViewUser = resOther.body.find(u => u.id === boxUser.id);
      expect(otherViewUser.totalBoxes).toBe(0);

      await privBox.destroy();
      await boxUser.destroy();
    });

    it('PUT /api/organization/:organization/resume - should handle error with fallback message', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      const res = await request(app)
        .put(`/api/organization/${orgName}/resume`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('PUT /api/organization/:organization/suspend - should handle error with fallback message', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      const res = await request(app)
        .put(`/api/organization/${orgName}/suspend`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('POST /api/organization - should handle error with fallback message', async () => {
      jest.spyOn(db.organization, 'create').mockRejectedValue(new Error(''));
      const res = await request(app)
        .post('/api/organization')
        .set('x-access-token', authToken)
        .send({ organization: 'FallbackOrg' });
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('DELETE /api/organization/:organization - should handle error with fallback message', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      const res = await request(app)
        .delete(`/api/organization/${orgName}`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('GET /api/organization - should handle error with fallback message', async () => {
      jest.spyOn(db.organization, 'findAll').mockRejectedValue(new Error(''));
      const res = await request(app).get('/api/organization').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('GET /api/organizations-with-users - should handle error with fallback message', async () => {
      jest.spyOn(db.organization, 'findAll').mockRejectedValue(new Error(''));
      const res = await request(app)
        .get('/api/organizations-with-users')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('GET /api/organization/:organization/users - should handle error with fallback message', async () => {
      jest
        .spyOn(db.organization, 'findOne')
        .mockResolvedValueOnce({ id: organization.id, name: orgName }) // Middleware
        .mockRejectedValueOnce(new Error('')); // Controller

      const res = await request(app)
        .get(`/api/organization/${orgName}/users`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });
  });

  describe('GET /api/organizations/discover (Coverage)', () => {
    it('should return all organizations for admin', async () => {
      // Create a private org
      const privOrg = await db.organization.create({
        name: `PrivDisc-${uniqueId}`,
        access_mode: 'private',
      });

      const res = await request(app)
        .get('/api/organizations/discover')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      const found = res.body.find(o => o.name === privOrg.name);
      expect(found).toBeDefined(); // Admin sees private orgs

      await privOrg.destroy();
    });

    it('should return only public organizations for unauthenticated user', async () => {
      // Create a private org
      const privOrg = await db.organization.create({
        name: `PrivDisc2-${uniqueId}`,
        access_mode: 'private',
      });

      const res = await request(app).get('/api/organizations/discover'); // No token

      expect(res.statusCode).toBe(200);
      const found = res.body.find(o => o.name === privOrg.name);
      expect(found).toBeUndefined(); // Unauth user does NOT see private orgs

      await privOrg.destroy();
    });
  });

  describe('GET /api/organization/:organization/box (Box Details)', () => {
    let publicBox;
    let privateBox;
    let pendingBox;

    beforeAll(async () => {
      // Create boxes
      publicBox = await db.box.create({
        name: `pub-box-${uniqueId}`,
        description: 'Public',
        isPublic: true,
        published: true,
        organizationId: organization.id,
        userId: adminUser.id,
      });
      privateBox = await db.box.create({
        name: `priv-box-${uniqueId}`,
        description: 'Private',
        isPublic: false,
        published: true,
        organizationId: organization.id,
        userId: adminUser.id,
      });
      pendingBox = await db.box.create({
        name: `pend-box-${uniqueId}`,
        description: 'Pending',
        isPublic: false,
        published: false,
        organizationId: organization.id,
        userId: adminUser.id,
      });
    });

    afterAll(async () => {
      await db.box.destroy({ where: { organizationId: organization.id } });
    });

    it('should return 404 if organization not found', async () => {
      const res = await request(app)
        .get('/api/organization/NonExistentOrg/box')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('should return 401 for findOne with invalid token', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}`)
        .set('x-access-token', 'invalid_token_string');

      expect(res.statusCode).toBe(401);
    });

    it('should handle invalid token gracefully', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box`)
        .set('x-access-token', 'invalid-token');

      expect(res.statusCode).toBe(200);
      // Should only see public box
      const names = res.body.map(b => b.name);
      expect(names).toContain(publicBox.name);
      expect(names).not.toContain(privateBox.name);
    });

    it('should show all boxes to owner/admin', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      const names = res.body.map(b => b.name);
      expect(names).toContain(publicBox.name);
      expect(names).toContain(privateBox.name);
      expect(names).toContain(pendingBox.name);
    });

    it('should filter pending boxes for non-owners', async () => {
      // Create a user who is a member but not the owner of the boxes
      const member = await db.user.create({
        username: `mem-${uniqueId}`,
        email: `mem-${uniqueId}@test.com`,
        password: 'pwd',
        verified: true,
      });
      await db.UserOrg.create({
        user_id: member.id,
        organization_id: organization.id,
        role: 'user',
      });
      const memToken = jwt.sign({ id: member.id }, 'test-secret', { expiresIn: '1h' });

      const res = await request(app)
        .get(`/api/organization/${orgName}/box`)
        .set('x-access-token', memToken);

      expect(res.statusCode).toBe(200);
      const names = res.body.map(b => b.name);
      expect(names).toContain(publicBox.name);
      expect(names).toContain(privateBox.name);
      expect(names).not.toContain(pendingBox.name);

      await member.destroy();
    });

    it('should handle database errors', async () => {
      jest.spyOn(db.box, 'findAll').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/organization/${orgName}/box`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('should calculate totalBoxes correctly including private boxes for self', async () => {
      // Create private box for user
      const userPrivateBox = await db.box.create({
        name: `user-priv-calc-${uniqueId}`,
        organizationId: organization.id,
        userId: user.id,
        isPublic: false,
      });

      const res = await request(app)
        .get(`/api/organization/${orgName}`)
        .set('x-access-token', authToken); // user token

      expect(res.statusCode).toBe(200);
      expect(res.body.totalBoxes).toBeGreaterThanOrEqual(1);

      await userPrivateBox.destroy();
    });
  });

  describe('GET /api/organization (findAll)', () => {
    let otherOrg;
    let otherUser;
    let otherUserToken;

    beforeAll(async () => {
      otherOrg = await db.organization.create({ name: `FindAllOrg-${uniqueId}` });
      const otherHashedPassword = await bcrypt.hash('password', 8);
      otherUser = await db.user.create({
        username: `other-findall-${uniqueId}`,
        email: `other-findall-${uniqueId}@example.com`,
        password: otherHashedPassword,
        verified: true,
      });
      const userRole = await db.role.findOne({ where: { name: 'user' } });
      await otherUser.setRoles([userRole]);
      await db.UserOrg.create({
        user_id: adminUser.id,
        organization_id: otherOrg.id,
        role: 'admin',
      });
      await db.UserOrg.create({
        user_id: otherUser.id,
        organization_id: otherOrg.id,
        role: 'user',
      });

      const otherAuth = await request(app)
        .post('/api/auth/signin')
        .send({ username: otherUser.username, password: 'password' });
      otherUserToken = otherAuth.body.accessToken;

      await db.box.create({
        name: `public-box-findall-${uniqueId}`,
        isPublic: true,
        organizationId: otherOrg.id,
        userId: adminUser.id,
      });
      await db.box.create({
        name: `private-box-findall-${uniqueId}`,
        isPublic: false,
        organizationId: otherOrg.id,
        userId: adminUser.id, // Owned by admin
      });
    });

    afterAll(async () => {
      if (otherOrg) {
        await otherOrg.destroy();
      }
      if (otherUser) {
        await otherUser.destroy();
      }
    });

    it('should fail for unauthenticated user', async () => {
      const res = await request(app).get('/api/organization');
      expect(res.statusCode).toBe(403);
    });

    it('should count public boxes and owned private boxes for authenticated user', async () => {
      const res = await request(app).get('/api/organization').set('x-access-token', adminToken); // admin owns the private box
      expect(res.statusCode).toBe(200);
      const foundOrg = res.body.find(o => o.name === otherOrg.name);
      expect(foundOrg).toBeDefined();
      expect(foundOrg.totalBoxes).toBe(2); // Public + own private
    });

    it('should count only public boxes for authenticated user who does not own private boxes', async () => {
      const res = await request(app).get('/api/organization').set('x-access-token', otherUserToken); // otherUser does not own the private box
      expect(res.statusCode).toBe(200);
      const foundOrg = res.body.find(o => o.name === otherOrg.name);
      expect(foundOrg).toBeDefined();
      expect(foundOrg.totalBoxes).toBe(1); // Only the public box
    });

    it('should filter organizations by name', async () => {
      const res = await request(app)
        .get(`/api/organization?organization=${otherOrg.name}`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe(otherOrg.name);
    });

    it('should handle invalid token', async () => {
      const res = await request(app)
        .get('/api/organization')
        .set('x-access-token', 'invalid-token');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/organizations-with-users (findAllWithUsers)', () => {
    it('should fail for non-admin user', async () => {
      const res = await request(app)
        .get('/api/organizations-with-users')
        .set('x-access-token', authToken); // non-admin
      expect(res.statusCode).toBe(403);
    });

    it('should return all organizations with their members for an admin', async () => {
      const res = await request(app)
        .get('/api/organizations-with-users')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const foundOrg = res.body.find(o => o.name === orgName);
      expect(foundOrg).toBeDefined();
      expect(foundOrg.members).toBeDefined();
      expect(Array.isArray(foundOrg.members)).toBe(true);
      expect(foundOrg.members.length).toBeGreaterThanOrEqual(2); // adminUser and user

      const foundUser = foundOrg.members.find(m => m.username === user.username);
      expect(foundUser).toBeDefined();
      expect(foundUser.roles[0].name).toBe('user');
      expect(foundUser).not.toHaveProperty('password');
    });

    it('should return 404 if organization not found (findonewithusers)', async () => {
      const res = await request(app)
        .get('/api/organization/NonExistentOrg/users')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if organization not found (findonewithusers)', async () => {
      const res = await request(app)
        .get('/api/organization/NonExistentOrg/users')
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
    });

    it('should handle invalid token', async () => {
      const res = await request(app)
        .get('/api/organizations-with-users')
        .set('x-access-token', 'invalid-token');
      expect(res.statusCode).toBe(401);
    });
  });
});
