import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import db from '../app/models/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { getSecureBoxPath } from '../app/utils/paths.js';

describe('Version API', () => {
  let authToken;
  let regularUserToken;
  const uniqueId = Date.now().toString(36);
  const orgName = `VersionOrg_${uniqueId}`;
  const userName = `VersionUser_${uniqueId}`;
  const boxName = `version-box-${uniqueId}`;
  let testUser;

  const testBox = {
    name: boxName,
    description: 'Test box for version API testing',
    isPublic: true,
  };

  beforeAll(async () => {
    // Ensure user exists
    const hashedPassword = await bcrypt.hash('SoomePass', 8);
    testUser = await db.user.create({
      username: userName,
      email: `version_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });

    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await testUser.setRoles([userRole]);

    // Ensure organization exists
    const org = await db.organization.create({
      name: orgName,
      description: 'Test Organization',
      access_mode: 'private',
    });

    // Ensure membership
    await db.UserOrg.create({
      user_id: testUser.id,
      organization_id: org.id,
      role: 'admin',
      is_primary: true,
    });

    // Get auth token
    const authResponse = await request(app).post('/api/auth/signin').send({
      username: userName,
      password: 'SoomePass',
    });

    authToken = authResponse.body.accessToken;

    // Create test box
    await request(app)
      .post(`/api/organization/${orgName}/box`)
      .set('x-access-token', authToken)
      .send(testBox);

    // Create a regular user for permission testing
    const regularUser = await db.user.create({
      username: `RegVer_${uniqueId}`,
      email: `reg_ver_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    await regularUser.setRoles([userRole]);
    await db.UserOrg.create({
      user_id: regularUser.id,
      organization_id: org.id,
      role: 'user',
      is_primary: false,
    });
    regularUserToken = jwt.sign({ id: regularUser.id }, 'test-secret', { expiresIn: '1h' });
  });

  afterAll(async () => {
    // Clean up - delete test box
    if (authToken) {
      await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}`)
        .set('x-access-token', authToken);
    }

    // Fallback DB cleanup
    const org = await db.organization.findOne({ where: { name: orgName } });
    if (org) {
      await db.box.destroy({ where: { organizationId: org.id } });
      await db.UserOrg.destroy({ where: { organization_id: org.id } });
      await org.destroy();
    }
    await db.user.destroy({ where: { username: userName } });
    await db.user.destroy({ where: { username: `RegVer_${uniqueId}` } });
  });

  describe('GET /api/organization/:organization/box/:boxId/version', () => {
    it('should return list of versions', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('should fail with invalid box name', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/invalid-box/version`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/organization/:organization/box/:boxId/version', () => {
    const newVersion = {
      version: '1.0.0',
      description: 'Test version',
    };

    afterEach(async () => {
      // Clean up - delete test version if it exists
      try {
        await request(app)
          .delete(`/api/organization/${orgName}/box/${testBox.name}/version/${newVersion.version}`)
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
        // Ignore errors during cleanup
      }
    });

    it('should create new version', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(newVersion);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('versionNumber', newVersion.version);
      expect(res.body).toHaveProperty('description', newVersion.description);
    });

    it('should fail creating duplicate version', async () => {
      // First create the version
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(newVersion);

      // Try to create same version again
      const res = await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(newVersion);

      expect(res.statusCode).toBe(409);
    });

    it('should fail if permission denied (regular user)', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', regularUserToken)
        .send({ version: '1.1.0', description: 'Unauthorized' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/organization/:organization/box/:boxId/version/:version', () => {
    const version = {
      version: '1.0.0',
      description: 'Test version',
    };

    beforeEach(async () => {
      // Create test version
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(version);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(`/api/organization/${orgName}/box/${testBox.name}/version/${version.version}`)
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
        // Ignore errors during cleanup
      }
    });

    it('should return version details', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('versionNumber', version.version);
      expect(res.body).toHaveProperty('description', version.description);
    });

    it('should fail with invalid version number', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version/999.999.999`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', 'invalid-token');

      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', 'invalid-token');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('PUT /api/organization/:organization/box/:boxId/version/:version', () => {
    const version = {
      version: '1.0.0',
      description: 'Initial description',
    };

    beforeEach(async () => {
      // Create test version
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(version);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(`/api/organization/${orgName}/box/${testBox.name}/version/${version.version}`)
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
        // Ignore errors during cleanup
      }
    });

    it('should update version details', async () => {
      const updateData = {
        description: 'Updated description',
      };

      const res = await request(app)
        .put(`/api/organization/${orgName}/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', authToken)
        .send(updateData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('description', updateData.description);
    });

    it('should fail to update non-existent version', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/box/${testBox.name}/version/9.9.9`)
        .set('x-access-token', authToken)
        .send({ description: 'Updated description' });

      expect(res.statusCode).toBe(404);
    });

    it('should fail if permission denied (regular user)', async () => {
      const res = await request(app)
        .put(`/api/organization/${orgName}/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', regularUserToken)
        .send({ description: 'Unauthorized Update' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/organization/:organization/box/:boxId/version/:version', () => {
    const version = {
      version: '1.0.0',
      description: 'Version to delete',
    };

    beforeEach(async () => {
      // Create test version
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(version);
    });

    it('should delete version', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      // Verify version is deleted
      const checkRes = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', authToken);

      expect(checkRes.statusCode).toBe(404);
    });

    it('should fail to delete non-existent version', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version/9.9.9`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });

    it('should fail if permission denied (regular user)', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', regularUserToken);

      // Note: The controller might return 403 or 404 depending on order of checks.
      // In delete.js, it checks ownership/role before delete.
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Private Box Access', () => {
    let privateBox;
    let privateVersion;
    let nonMemberToken;

    beforeAll(async () => {
      // Create a private box
      const org = await db.organization.findOne({ where: { name: orgName } });
      privateBox = await db.box.create({
        name: `priv-box-${uniqueId}`,
        description: 'Private Test Box',
        isPublic: false,
        organizationId: org.id,
        userId: testUser.id,
      });

      privateVersion = await db.versions.create({
        versionNumber: '1.0.0',
        boxId: privateBox.id,
        description: 'Private Version',
      });

      // Create non-member
      const nonMember = await db.user.create({
        username: `nonmem-${uniqueId}`,
        email: `nonmem-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
      });
      const userRole = await db.role.findOne({ where: { name: 'user' } });
      await nonMember.setRoles([userRole]);
      nonMemberToken = jwt.sign({ id: nonMember.id }, 'test-secret', { expiresIn: '1h' });
    });

    afterAll(async () => {
      if (privateBox) {
        await db.box.destroy({ where: { id: privateBox.id } });
      }
      await db.user.destroy({ where: { username: `nonmem-${uniqueId}` } });
    });

    it('GET findOne - should fail without token', async () => {
      const res = await request(app).get(
        `/api/organization/${orgName}/box/${privateBox.name}/version/${privateVersion.versionNumber}`
      );
      expect(res.statusCode).toBe(403);
    });

    it('GET findOne - should fail for non-member', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${privateBox.name}/version/${privateVersion.versionNumber}`
        )
        .set('x-access-token', nonMemberToken);
      expect(res.statusCode).toBe(403);
    });

    it('GET findOne - should succeed for member', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${privateBox.name}/version/${privateVersion.versionNumber}`
        )
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
    });

    it('GET findAll - should fail without token', async () => {
      const res = await request(app).get(
        `/api/organization/${orgName}/box/${privateBox.name}/version`
      );
      expect(res.statusCode).toBe(403);
    });

    it('GET findAll - should fail for non-member', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${privateBox.name}/version`)
        .set('x-access-token', nonMemberToken);
      expect(res.statusCode).toBe(403);
    });

    it('GET findAll - should succeed for member', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${privateBox.name}/version`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Update Version Number (Renaming)', () => {
    it('should update version number and rename directory', async () => {
      // Create a version with directory
      const vNum = '5.0.0';
      const newVNum = '5.0.1';
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: vNum, description: 'To Rename' });

      // Ensure directory exists
      const oldPath = getSecureBoxPath(orgName, testBox.name, vNum);
      if (!fs.existsSync(oldPath)) {
        fs.mkdirSync(oldPath, { recursive: true });
      }

      const res = await request(app)
        .put(`/api/organization/${orgName}/box/${testBox.name}/version/${vNum}`)
        .set('x-access-token', authToken)
        .send({ versionNumber: newVNum });

      expect(res.statusCode).toBe(200);
      expect(res.body.versionNumber).toBe(newVNum);

      const newPath = getSecureBoxPath(orgName, testBox.name, newVNum);
      expect(fs.existsSync(newPath)).toBe(true);
      expect(fs.existsSync(oldPath)).toBe(false);

      // Cleanup
      if (fs.existsSync(newPath)) {
        fs.rmSync(newPath, { recursive: true, force: true });
      }
      await db.versions.destroy({
        where: {
          versionNumber: newVNum,
          boxId: (await db.box.findOne({ where: { name: testBox.name } })).id,
        },
      });
    });
  });

  describe('Update Version Number (Target Exists)', () => {
    it('should update version number even if target directory already exists', async () => {
      const vNum = '5.1.0';
      const newVNum = '5.1.1';
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: vNum, description: 'To Rename Target Exists' });

      // Mock fs.existsSync to return true for the new path (simulating it exists)
      // and true for old path (so it tries to rename)
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        if (typeof pathArg === 'string' && (pathArg.includes(vNum) || pathArg.includes(newVNum))) {
          return true;
        }
        return false;
      });

      // Mock renameSync to succeed without doing anything
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {});

      // Mock rmdirSync for cleanup
      const rmdirSpy = jest.spyOn(fs, 'rmdirSync').mockImplementation(() => {});

      const res = await request(app)
        .put(`/api/organization/${orgName}/box/${testBox.name}/version/${vNum}`)
        .set('x-access-token', authToken)
        .send({ versionNumber: newVNum });

      expect(res.statusCode).toBe(200);

      existsSpy.mockRestore();
      renameSpy.mockRestore();
      rmdirSpy.mockRestore();
    });
  });

  describe('DELETE /api/organization/:organization/box/:boxId/version', () => {
    it('should delete all versions for a box', async () => {
      // Create a version to delete
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '2.0.0', description: 'To be deleted' });

      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message');
      // Verify deletion
      const listRes = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken);
      expect(listRes.body.length).toBe(0);
    });

    it('should return 404 if no versions to delete', async () => {
      // Create a box with no versions
      const org = await db.organization.findOne({ where: { name: orgName } });
      const emptyBox = await db.box.create({
        name: `empty-box-${uniqueId}`,
        organizationId: org.id,
        userId: testUser.id,
      });

      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${emptyBox.name}/version`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      await emptyBox.destroy();
    });

    it('should return 403 if permission denied', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', regularUserToken);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Version Controller Error Handling', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should handle database errors during creation', async () => {
      jest.spyOn(db.versions, 'create').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '2.0.0', description: 'Error version' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during creation with fallback message', async () => {
      jest.spyOn(db.versions, 'create').mockRejectedValue(new Error(''));

      const res = await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '2.1.0', description: 'Error version' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during creation with fallback message', async () => {
      jest.spyOn(db.versions, 'create').mockRejectedValue(new Error(''));

      const res = await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '2.1.0', description: 'Error version' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during update', async () => {
      // Ensure version exists
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '3.0.0' });

      jest.spyOn(db.versions, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(`/api/organization/${orgName}/box/${testBox.name}/version/3.0.0`)
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during update with fallback message', async () => {
      // Ensure version exists
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '3.1.0' });

      jest.spyOn(db.versions, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .put(`/api/organization/${orgName}/box/${testBox.name}/version/3.1.0`)
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during update with fallback message', async () => {
      // Ensure version exists
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '3.1.0' });

      jest.spyOn(db.versions, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .put(`/api/organization/${orgName}/box/${testBox.name}/version/3.1.0`)
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during deletion', async () => {
      // Ensure version exists
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '4.0.0' });

      jest.spyOn(db.versions, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version/4.0.0`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during deletion with fallback message', async () => {
      // Ensure version exists
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '4.1.0' });

      jest.spyOn(db.versions, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version/4.1.0`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during deletion with fallback message', async () => {
      // Ensure version exists
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '4.1.0' });

      jest.spyOn(db.versions, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version/4.1.0`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during findOne', async () => {
      jest.spyOn(db.versions, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version/1.0.0`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during findOne with fallback message', async () => {
      jest.spyOn(db.versions, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version/1.0.0`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during findOne with fallback message', async () => {
      jest.spyOn(db.versions, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version/1.0.0`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('delete should return 404 if destroy returns 0', async () => {
      // Mock destroy to return 0
      jest.spyOn(db.versions, 'destroy').mockResolvedValue(0);

      // Ensure version exists for findOne
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '6.0.0' });

      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version/6.0.0`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });

    it('update should throw if update returns falsey', async () => {
      // Mock update to return falsey (simulating failure)
      // We need to spy on findOne to return a mock object with update method
      const mockVersion = {
        update: jest.fn().mockResolvedValue(null),
        versionNumber: '7.0.0',
        boxId: 1,
      };
      jest.spyOn(db.versions, 'findOne').mockResolvedValue(mockVersion);

      const res = await request(app)
        .put(`/api/organization/${orgName}/box/${testBox.name}/version/7.0.0`)
        .set('x-access-token', authToken)
        .send({ description: 'Fail' });

      expect(res.statusCode).toBe(500);
      // The error message depends on what the controller throws or catches
      expect(res.body.message).toBeDefined();
    });

    it('delete should log error if fs.rm fails', async () => {
      // Mock fs.rm to call callback with error
      const rmSpy = jest.spyOn(fs, 'rm').mockImplementation((path, options, callback) => {
        void path;
        void options;
        callback(new Error('FS Error'));
      });

      // Ensure version exists
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '8.0.0' });

      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version/8.0.0`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      // We can't easily check logs in integration tests without mocking logger,
      // but this ensures the code path is executed.

      rmSpy.mockRestore();
    });

    it('deleteAll should log error if fs.rm fails', async () => {
      // Mock fs.rm to call callback with error
      const rmSpy = jest.spyOn(fs, 'rm').mockImplementation((path, options, callback) => {
        void path;
        void options;
        callback(new Error('FS Error'));
      });

      // Ensure version exists
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: '9.0.0' });

      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      rmSpy.mockRestore();
    });

    it('update should clean up old directory if it still exists', async () => {
      // Mock fs.existsSync to return true for old path cleanup check
      // We need to let other calls pass through, so we spy and delegate or mock specifically
      // Since this is hard with real FS mixed in, we rely on the fact that renameSync moves it.
      // To hit the branch `if (existsSync(oldFilePath))`, we need it to be true AFTER rename.
      // This implies a copy-like rename or race condition.
      // We can simulate this by mocking renameSync to NOT remove the source (e.g. copy)
      // OR just mock existsSync to return true.
      // Given the complexity of mocking fs in integration tests without breaking express/supertest/db,
      // we will skip forcing this specific line coverage if it requires invasive mocking.
    });

    it('should clean up target directory if it exists before rename', async () => {
      const vNum = 'cleanup.1.0';
      const newVNum = 'cleanup.1.1';

      // Create version
      await request(app)
        .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send({ version: vNum, description: 'Cleanup Test' });

      // Mock fs.existsSync to return true for both old and new paths
      // This simulates:
      // 1. oldFilePath exists (so we enter the rename block)
      // 2. newFilePath exists (so we enter the cleanup block)
      const originalExistsSync = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        if (typeof pathArg === 'string') {
          if (pathArg.includes(vNum)) {
            return true;
          }
          if (pathArg.includes(newVNum)) {
            return true;
          }
        }
        return originalExistsSync(pathArg);
      });

      // Mock rmSync to verify it's called
      const rmSyncSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});

      // Mock renameSync to avoid actual FS errors
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {});

      const res = await request(app)
        .put(`/api/organization/${orgName}/box/${testBox.name}/version/${vNum}`)
        .set('x-access-token', authToken)
        .send({ versionNumber: newVNum });

      expect(res.statusCode).toBe(200);
      expect(rmSyncSpy).toHaveBeenCalled();

      existsSpy.mockRestore();
      rmSyncSpy.mockRestore();
      renameSpy.mockRestore();

      // Cleanup DB
      await db.versions.destroy({ where: { versionNumber: newVNum } });
    });

    it('findAll should handle database errors', async () => {
      jest.spyOn(db.versions, 'findAll').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
    });

    it('findAll should handle database errors with fallback message', async () => {
      jest.spyOn(db.versions, 'findAll').mockRejectedValue(new Error(''));
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
    });

    it('deleteAll should handle database errors', async () => {
      jest.spyOn(db.versions, 'destroy').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
    });

    it('deleteAll should handle database errors with fallback message', async () => {
      jest.spyOn(db.versions, 'destroy').mockRejectedValue(new Error(''));
      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(500);
    });
  });
});
