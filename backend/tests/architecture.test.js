import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import db from '../app/models/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { getSecureBoxPath } from '../app/utils/paths.js';

describe('Architecture API', () => {
  let authToken;
  let regularUserToken;
  const uniqueId = Date.now().toString(36);
  const orgName = `ArchOrg_${uniqueId}`;
  const userName = `ArchUser_${uniqueId}`;
  const boxName = `arch-box-${uniqueId}`;

  const testBox = {
    name: boxName,
    description: 'Test box for architecture API testing',
    isPublic: true,
  };
  const testVersion = {
    version: '1.0.0',
    description: 'Test version for architecture API testing',
  };
  const testProvider = {
    name: 'test-provider',
    description: 'Test provider for architecture API testing',
  };

  beforeAll(async () => {
    // Setup User
    const hashedPassword = await bcrypt.hash('SoomePass', 8);
    const user = await db.user.create({
      username: userName,
      email: `arch_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });

    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await user.setRoles([userRole]);

    // Setup Org
    const org = await db.organization.create({
      name: orgName,
      description: 'Test Organization',
      access_mode: 'private',
    });

    // Setup Membership
    await db.UserOrg.create({
      user_id: user.id,
      organization_id: org.id,
      role: 'admin',
      is_primary: true,
    });

    // Get auth token
    const authResponse = await request(app).post('/api/auth/signin').send({
      username: userName,
      password: 'SoomePass',
    });

    // Setup Regular User (for permission testing)
    const regularUser = await db.user.create({
      username: `RegArch_${uniqueId}`,
      email: `reg_arch_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const regRole = await db.role.findOne({ where: { name: 'user' } });
    await regularUser.setRoles([regRole]);
    await db.UserOrg.create({
      user_id: regularUser.id,
      organization_id: org.id,
      role: 'user',
      is_primary: false,
    });
    const regAuth = await request(app)
      .post('/api/auth/signin')
      .send({ username: regularUser.username, password: 'SoomePass' });
    regularUserToken = regAuth.body.accessToken;

    authToken = authResponse.body.accessToken;

    // Create test box
    await request(app)
      .post(`/api/organization/${orgName}/box`)
      .set('x-access-token', authToken)
      .send(testBox);

    // Create test version
    await request(app)
      .post(`/api/organization/${orgName}/box/${testBox.name}/version`)
      .set('x-access-token', authToken)
      .send(testVersion);

    // Create test provider
    await request(app)
      .post(
        `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
      )
      .set('x-access-token', authToken)
      .send(testProvider);
  });

  afterAll(async () => {
    // Clean up - delete test box (will cascade delete version, provider, and architectures)
    if (authToken) {
      await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}`)
        .set('x-access-token', authToken);
    }

    // Fallback cleanup
    const org = await db.organization.findOne({ where: { name: orgName } });
    if (org) {
      await db.box.destroy({ where: { organizationId: org.id } });
      await db.UserOrg.destroy({ where: { organization_id: org.id } });
      await org.destroy();
    }
    await db.user.destroy({ where: { username: userName } });
    await db.user.destroy({ where: { username: `RegArch_${uniqueId}` } });
  });

  describe('GET /api/organization/:organization/box/:boxId/version/:version/provider/:provider/architecture', () => {
    it('should return list of architectures', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('should fail with invalid provider', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/invalid-provider/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/organization/:organization/box/:boxId/version/:version/provider/:provider/architecture', () => {
    const newArchitecture = {
      name: 'amd64',
      description: 'Test architecture',
      defaultBox: true,
    };

    afterEach(async () => {
      // Clean up - delete test architecture if it exists
      try {
        await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${newArchitecture.name}`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
        // Ignore errors during cleanup
      }
    });

    it('should create new architecture', async () => {
      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(newArchitecture);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('name', newArchitecture.name);
      expect(res.body).toHaveProperty('description', newArchitecture.description);
      expect(res.body).toHaveProperty('defaultBox', newArchitecture.defaultBox);
    });

    it('should fail creating duplicate architecture', async () => {
      // First create the architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(newArchitecture);

      // Try to create same architecture again
      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(newArchitecture);

      expect(res.statusCode).toBe(409);
    });

    it('should validate architecture name', async () => {
      const invalidArch = {
        name: 'invalid!arch',
        description: 'Invalid architecture name',
        defaultBox: true,
      };

      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(invalidArch);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/organization/:organization/box/:boxId/version/:version/provider/:provider/architecture/:architecture', () => {
    const architecture = {
      name: 'amd64',
      description: 'Test architecture',
      defaultBox: true,
    };

    beforeEach(async () => {
      // Create test architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(architecture);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
        // Ignore errors during cleanup
      }
    });

    it('should return architecture details', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('name', architecture.name);
      expect(res.body).toHaveProperty('description', architecture.description);
      expect(res.body).toHaveProperty('defaultBox', architecture.defaultBox);
    });

    it('should fail with invalid architecture name', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/invalid-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/organization/:organization/box/:boxId/version/:version/provider/:provider/architecture/:architecture', () => {
    const architecture = {
      name: 'amd64',
      description: 'Initial description',
      defaultBox: true,
    };

    beforeEach(async () => {
      // Create test architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(architecture);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
        // Ignore errors during cleanup
      }
    });

    it('should update architecture details', async () => {
      const updateData = {
        description: 'Updated description',
        defaultBox: false,
      };

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
        )
        .set('x-access-token', authToken)
        .send(updateData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('description', updateData.description);
      expect(res.body).toHaveProperty('defaultBox', updateData.defaultBox);
    });
  });

  describe('DELETE /api/organization/:organization/box/:boxId/version/:version/provider/:provider/architecture/:architecture', () => {
    const architecture = {
      name: 'amd64',
      description: 'Architecture to delete',
      defaultBox: true,
    };

    beforeEach(async () => {
      // Create test architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(architecture);
    });

    it('should delete architecture', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      // Verify architecture is deleted
      const checkRes = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
        )
        .set('x-access-token', authToken);

      expect(checkRes.statusCode).toBe(404);
    });
  });

  describe('Architecture Logic & Bulk Operations', () => {
    it('should set previous default architecture to false when new default is created', async () => {
      // Create first default architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'arch-1', defaultBox: true });

      // Create second default architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'arch-2', defaultBox: true });

      // Check first architecture
      const arch1 = await db.architectures.findOne({ where: { name: 'arch-1' } });
      expect(arch1.defaultBox).toBe(false);

      // Check second architecture
      const arch2 = await db.architectures.findOne({ where: { name: 'arch-2' } });
      expect(arch2.defaultBox).toBe(true);
    });

    it('should delete all architectures for a provider', async () => {
      // Ensure we have some architectures (arch-1 and arch-2 from previous test)
      // Add one more to be sure
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'arch-to-delete-1' });

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      const count = await db.architectures.count({
        include: [
          {
            model: db.providers,
            as: 'provider',
            where: { name: testProvider.name },
          },
        ],
      });
      expect(count).toBe(0);
    });
  });

  describe('DELETE .../architecture (Bulk Error Cases)', () => {
    it('should return 404 if provider not found', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/NonExistentProvider/architecture`
        )
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE .../architecture (Bulk Error Cases)', () => {
    it('should return 404 if provider not found', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/NonExistentProvider/architecture`
        )
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Architecture Edge Cases', () => {
    const archName = 'edge-arch';

    describe('POST Create', () => {
      it('should return 404 if organization not found', async () => {
        const res = await request(app)
          .post(
            `/api/organization/NonExistentOrg/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
          )
          .set('x-access-token', authToken)
          .send({ name: archName });
        expect(res.statusCode).toBe(404);
      });

      it('should return 404 if box not found', async () => {
        const res = await request(app)
          .post(
            `/api/organization/${orgName}/box/NonExistentBox/version/${testVersion.version}/provider/${testProvider.name}/architecture`
          )
          .set('x-access-token', authToken)
          .send({ name: archName });
        expect(res.statusCode).toBe(404);
      });

      it('should return 403 if permission denied (regular user)', async () => {
        // Ensure box is private
        await db.box.update({ isPublic: false }, { where: { name: testBox.name } });
        const res = await request(app)
          .post(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
          )
          .set('x-access-token', regularUserToken)
          .send({ name: archName });
        expect(res.statusCode).toBe(403);
      });

      it('should return 404 if version not found', async () => {
        const res = await request(app)
          .post(
            `/api/organization/${orgName}/box/${testBox.name}/version/9.9.9/provider/${testProvider.name}/architecture`
          )
          .set('x-access-token', authToken)
          .send({ name: archName });
        expect(res.statusCode).toBe(404);
      });

      it('should return 404 if provider not found', async () => {
        const res = await request(app)
          .post(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/NonExistentProvider/architecture`
          )
          .set('x-access-token', authToken)
          .send({ name: archName });
        expect(res.statusCode).toBe(404);
      });
    });

    describe('DELETE', () => {
      beforeAll(async () => {
        // Create an architecture to try deleting
        await request(app)
          .post(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
          )
          .set('x-access-token', authToken)
          .send({ name: archName });
      });

      it('should return 403 if permission denied', async () => {
        const res = await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${archName}`
          )
          .set('x-access-token', regularUserToken);
        expect(res.statusCode).toBe(403);
      });

      it('should return 404 if architecture not found', async () => {
        const res = await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/non-existent-arch`
          )
          .set('x-access-token', authToken);
        expect(res.statusCode).toBe(404);
      });
    });

    describe('PUT Update', () => {
      it('should return 403 if permission denied', async () => {
        const res = await request(app)
          .put(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${archName}`
          )
          .set('x-access-token', regularUserToken)
          .send({ description: 'Updated' });
        expect(res.statusCode).toBe(403);
      });
    });

    describe('GET FindOne', () => {
      it('should return 403 if permission denied (private box, regular user)', async () => {
        // Ensure box is private
        await db.box.update({ isPublic: false }, { where: { name: testBox.name } });

        // Regular user IS a member, so they SHOULD have access to private box.
        // To test 403, we need a non-member.
        const nonMemberToken = jwt.sign({ id: 999999 }, 'test-secret', { expiresIn: '1h' });

        const res = await request(app)
          .get(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${archName}`
          )
          .set('x-access-token', nonMemberToken);

        expect(res.statusCode).toBe(403);
      });
    });
  });

  describe('Architecture Controller Error Handling', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should handle database errors during creation', async () => {
      jest.spyOn(db.architectures, 'create').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'error-arch' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during creation with fallback message', async () => {
      jest.spyOn(db.architectures, 'create').mockRejectedValue(new Error(''));

      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'error-fallback-arch' });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('should handle database errors during update', async () => {
      // Ensure architecture exists first
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'update-error-arch' });

      jest.spyOn(db.architectures, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/update-error-arch`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during deletion', async () => {
      // Ensure architecture exists first
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'delete-error-arch' });

      jest.spyOn(db.architectures, 'findOne').mockRejectedValue(new Error('DB Error'));
      jest.spyOn(db.architectures, 'destroy').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/delete-error-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during findOne', async () => {
      jest.spyOn(db.architectures, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/any-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during deletion with fallback message', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/test-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during update with fallback message', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/test-arch`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during findOne with fallback message', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/test-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });
  });

  describe('CREATE - Additional Edge Cases', () => {
    afterEach(async () => {
      try {
        await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
      }
    });

    it('should return 404 if version not found (create.js line 113)', async () => {
      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/99.99.99/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'test-arch' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Version');
    });

    it('should return 404 if provider not found (create.js line 134)', async () => {
      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/NonExistentProvider/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'test-arch' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Provider');
    });
  });

  describe('DELETE - Additional Edge Cases', () => {
    it('should return 404 if box not found (delete.js line 85)', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/NonExistentBox/version/${testVersion.version}/provider/${testProvider.name}/architecture/test-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Box');
    });

    it('should return 404 if provider not found (delete.js line 116)', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/NonExistentProvider/architecture/test-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Provider');
    });
  });

  describe('FINDONE - Access Control & Array Find Edge Cases', () => {
    beforeAll(async () => {
      // Create test architecture for findOne tests
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'findone-arch', description: 'FindOne test' });
    });

    afterAll(async () => {
      try {
        await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/findone-arch`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
      }
    });

    it('GET findOne - should succeed for member accessing private box (findone.js line 179)', async () => {
      // Make box private
      await db.box.update({ isPublic: false }, { where: { name: testBox.name } });

      // Request existing architecture as member
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/findone-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('findone-arch');

      // Restore to public
      await db.box.update({ isPublic: true }, { where: { name: testBox.name } });
    });

    it('should return 404 if version not found in box.versions array (findone.js line 106)', async () => {
      // Mock box.findOne to return a box with empty versions array
      const mockBox = {
        id: 1,
        name: testBox.name,
        isPublic: true,
        versions: [], // Empty array - version won't be found
      };
      jest.spyOn(db.box, 'findOne').mockResolvedValue(mockBox);

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/findone-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Version');
    });

    it('should return 404 if provider not found in version.providers array (findone.js line 132)', async () => {
      // Mock box.findOne to return a box with version but empty providers
      const mockBox = {
        id: 1,
        name: testBox.name,
        isPublic: true,
        versions: [
          {
            versionNumber: testVersion.version,
            providers: [], // Empty array - provider won't be found
          },
        ],
      };
      jest.spyOn(db.box, 'findOne').mockResolvedValue(mockBox);

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/findone-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Provider');
    });

    it('should return 404 if architecture not found for public box (findone.js line 139)', async () => {
      await db.box.update({ isPublic: true }, { where: { name: testBox.name } });

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/non-existent-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      // Architecture lookup happens after provider check, so this path is reached
      expect(res.body.message).toBeDefined();
    });

    it('should return 404 if architecture not found for member (findone.js line 146)', async () => {
      await db.box.update({ isPublic: false }, { where: { name: testBox.name } });

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/non-existent-arch`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      // Architecture lookup happens after provider check
      expect(res.body.message).toBeDefined();
    });
  });

  describe('UPDATE - File System & Additional Edge Cases', () => {
    beforeEach(async () => {
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'update-fs-arch', description: 'Update test' });
    });

    afterEach(async () => {
      try {
        await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
      }
    });

    it('should return 404 if box not found (update.js line 130)', async () => {
      // Mock box lookup to return null
      jest.spyOn(db.box, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/NonExistentBox/version/${testVersion.version}/provider/${testProvider.name}/architecture/update-fs-arch`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Box');

      jest.restoreAllMocks();
    });

    it('should return 404 if version not found (update.js line 161)', async () => {
      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/99.99.99/provider/${testProvider.name}/architecture/update-fs-arch`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Version');
    });

    it('should return 404 if provider not found (update.js line 171)', async () => {
      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/NonExistentProvider/architecture/update-fs-arch`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Provider');
    });

    it('should update only description without name (update.js line 195)', async () => {
      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/update-fs-arch`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Only description updated' });

      expect(res.statusCode).toBe(200);
      expect(res.body.description).toBe('Only description updated');
      expect(res.body.name).toBe('update-fs-arch'); // Name unchanged
    });

    it('should throw error if architecture not found after update (update.js line 215)', async () => {
      // Mock update to return [0] (no rows updated)
      jest.spyOn(db.architectures, 'update').mockResolvedValue([0]);

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/update-fs-arch`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Should fail' });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('Architecture');
    });
  });

  describe('DELETEALL - Entity Not Found Cases', () => {
    it('should return 404 if box not found (deleteall.js line 85)', async () => {
      // Mock box lookup to return null
      jest.spyOn(db.box, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/NonExistentBox/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Box');

      jest.restoreAllMocks();
    });

    it('should return 404 if version not found (deleteall.js line 106)', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/99.99.99/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Version');
    });

    it('should return 404 if no architectures to delete (deleteall.js lines 143-147)', async () => {
      // Ensure no architectures exist
      await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      // Try to delete again
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('No architectures found to delete');
    });

    it('should return 403 if permission denied (deleteall.js line 95)', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', regularUserToken);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('FINDALL - Private Box Access & Array Find Edge Cases', () => {
    beforeAll(async () => {
      // Create architecture for these tests
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'findall-arch' });
    });

    afterAll(async () => {
      try {
        await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
      }
    });

    it('should return 404 if box not found (findall.js line 92)', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/NonExistentBox/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Box');
    });

    it('should return 404 if version not found in box.versions array (findall.js line 125)', async () => {
      // Mock box.findOne to return box with empty versions
      const mockBox = {
        id: 1,
        name: testBox.name,
        isPublic: true,
        versions: [],
      };
      jest.spyOn(db.box, 'findOne').mockResolvedValue(mockBox);

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Version');

      jest.restoreAllMocks();
    });

    it('should return 404 if provider not found in version.providers array (findall.js line 132)', async () => {
      // Mock box.findOne to return box with version but no providers
      const mockBox = {
        id: 1,
        name: testBox.name,
        isPublic: true,
        versions: [
          {
            versionNumber: testVersion.version,
            providers: [],
          },
        ],
      };
      jest.spyOn(db.box, 'findOne').mockResolvedValue(mockBox);

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Provider');

      jest.restoreAllMocks();
    });

    it('should return 403 for private box with authenticated non-member (findall.js lines 149-151)', async () => {
      // Make box private
      await db.box.update({ isPublic: false }, { where: { name: testBox.name } });

      // Create non-member user
      const nonMember = await db.user.create({
        username: `nonmem-findall-${uniqueId}`,
        email: `nonmem-findall-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
      });
      const userRole = await db.role.findOne({ where: { name: 'user' } });
      await nonMember.setRoles([userRole]);
      const nonMemberToken = jwt.sign({ id: nonMember.id }, 'test-secret', { expiresIn: '1h' });

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', nonMemberToken);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('Unauthorized');

      await nonMember.destroy();
      await db.box.update({ isPublic: true }, { where: { name: testBox.name } });
    });

    it('should handle database errors during findAll with fallback message (findall.js lines 159-161)', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);

      jest.restoreAllMocks();
    });
  });

  describe('Service Account Access', () => {
    let serviceAccount;
    let serviceAccountToken;

    beforeAll(async () => {
      const org = await db.organization.findOne({ where: { name: orgName } });
      const user = await db.user.findOne({ where: { username: userName } });

      serviceAccount = await db.service_account.create({
        username: `sa-arch-${uniqueId}`,
        token: `sa-token-arch-${uniqueId}`,
        organization_id: org.id,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      serviceAccountToken = jwt.sign({ id: user.id, isServiceAccount: true }, 'test-secret', {
        expiresIn: '1h',
      });
    });

    afterAll(async () => {
      if (serviceAccount) {
        await db.service_account.destroy({ where: { id: serviceAccount.id } });
      }
    });

    it('should allow service account to access architecture (findone.js line 106)', async () => {
      // Create test architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'sa-arch' });

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/sa-arch`
        )
        .set('x-access-token', serviceAccountToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('sa-arch');

      // Cleanup
      await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/sa-arch`
        )
        .set('x-access-token', authToken);
    });
  });

  describe('UPDATE - Directory Rename Operations', () => {
    it('should rename directory when architecture name changes (update.js lines 187-195)', async () => {
      const oldName = 'rename-old';
      const newName = 'rename-new';

      // Create architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: oldName });

      // Ensure directory exists
      const oldPath = getSecureBoxPath(
        orgName,
        testBox.name,
        testVersion.version,
        testProvider.name,
        oldName
      );
      if (!fs.existsSync(oldPath)) {
        fs.mkdirSync(oldPath, { recursive: true });
      }

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${oldName}`
        )
        .set('x-access-token', authToken)
        .send({ name: newName });

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe(newName);

      const newPath = getSecureBoxPath(
        orgName,
        testBox.name,
        testVersion.version,
        testProvider.name,
        newName
      );
      expect(fs.existsSync(newPath)).toBe(true);
      expect(fs.existsSync(oldPath)).toBe(false);

      // Cleanup
      if (fs.existsSync(newPath)) {
        fs.rmSync(newPath, { recursive: true, force: true });
      }
      await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${newName}`
        )
        .set('x-access-token', authToken);
    });

    it('should handle target directory exists before rename (update.js line 190)', async () => {
      const oldName = 'target-exists-old';
      const newName = 'target-exists-new';

      // Create architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: oldName });

      // Mock fs operations to simulate target exists
      const originalExistsSync = fs.existsSync;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        if (typeof pathArg === 'string') {
          if (pathArg.includes(oldName)) {
            return true;
          }
          if (pathArg.includes(newName)) {
            return true;
          }
        }
        return originalExistsSync(pathArg);
      });

      const rmSyncSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
      const rmdirSpy = jest.spyOn(fs, 'rmdirSync').mockImplementation(() => {});

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${oldName}`
        )
        .set('x-access-token', authToken)
        .send({ name: newName });

      expect(res.statusCode).toBe(200);
      expect(rmSyncSpy).toHaveBeenCalled(); // Target cleanup
      expect(renameSpy).toHaveBeenCalled();

      existsSpy.mockRestore();
      rmSyncSpy.mockRestore();
      renameSpy.mockRestore();
      rmdirSpy.mockRestore();

      // Cleanup
      await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${newName}`
        )
        .set('x-access-token', authToken);
    });

    it('should update architecture without name change (skips rename logic)', async () => {
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'no-rename', description: 'Original' });

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/no-rename`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Updated Description Only' }); // No name change

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('no-rename');
      expect(res.body.description).toBe('Updated Description Only');

      await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/no-rename`
        )
        .set('x-access-token', authToken);
    });
  });

  describe('Remaining Coverage Edge Cases', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should handle permission denied with non-owner non-moderator (create.js line 103)', async () => {
      // Create a user who is NOT owner and NOT moderator/admin
      const outsider = await db.user.create({
        username: `outsider-create-${uniqueId}`,
        email: `outsider-create-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
      });
      const userRole = await db.role.findOne({ where: { name: 'user' } });
      await outsider.setRoles([userRole]);
      // Don't add to organization - test permission for non-member attempting to create

      const outsiderToken = jwt.sign({ id: outsider.id }, 'test-secret', { expiresIn: '1h' });

      // Mock UserOrg.findUserOrgRole to return null (non-member)
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockResolvedValue(null);

      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', outsiderToken)
        .send({ name: 'perm-test-arch' });

      expect(res.statusCode).toBe(403);

      await outsider.destroy();
    });

    it('should handle update with only defaultBox field (update.js line 195)', async () => {
      // Create architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'defaultbox-test', defaultBox: false });

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/defaultbox-test`
        )
        .set('x-access-token', authToken)
        .send({ defaultBox: true }); // Only defaultBox, no name or description

      expect(res.statusCode).toBe(200);
      expect(res.body.defaultBox).toBe(true);

      // Cleanup
      await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/defaultbox-test`
        )
        .set('x-access-token', authToken);
    });

    it('should handle DELETEALL with error fallback message (deleteall.js line 147)', async () => {
      jest.spyOn(db.architectures, 'destroy').mockRejectedValue(new Error(''));

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('should handle FINDALL organization not found (findall.js lines 91-95)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .get(
          `/api/organization/NonExistentOrg/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Organization');
    });

    it('should handle FINDALL with box not found via mocking (findall.js line 92)', async () => {
      jest.spyOn(db.box, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/NonExistentBox/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Box');
    });

    it('should handle FINDALL error fallback (findall.js lines 158-162)', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('should handle DELETE with box not found via organization mock (delete.js line 85)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .delete(
          `/api/organization/NonExistentOrg/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/test`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });

    it('should handle DELETE with provider not found more directly (delete.js line 116)', async () => {
      jest.spyOn(db.providers, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/NonExistentProvider/architecture/test`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });

    it('should handle DELETEALL box not found via organization mock (deleteall.js line 85)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .delete(
          `/api/organization/NonExistentOrg/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });

    it('should handle UPDATE box not found via organization mock (update.js line 130)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .put(
          `/api/organization/NonExistentOrg/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/test`
        )
        .set('x-access-token', authToken)
        .send({ description: 'test' });

      expect(res.statusCode).toBe(404);
    });

    it('should handle FINDONE error with no message (findone.js lines 176-179)', async () => {
      jest.spyOn(db.box, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/test`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle CREATE error with no message (create.js line 144)', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'error-test' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle CREATE organization not found (create.js lines 102-106)', async () => {
      const res = await request(app)
        .post(
          `/api/organization/NonExistentOrgDirect/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'test-arch' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Organization');
    });

    it('should handle CREATE box not found (create.js lines 112-116)', async () => {
      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/NonExistentBoxDirect/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'test-arch' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Box');
    });

    it('should handle FINDONE organization not found (findone.js lines 105-109)', async () => {
      const res = await request(app)
        .get(
          `/api/organization/NonExistentOrgDirect/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/test`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Organization');
    });

    it('should handle FINDONE box not found (findone.js lines 131-135)', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/NonExistentBoxDirect/version/${testVersion.version}/provider/${testProvider.name}/architecture/test`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Box');
    });

    it('should handle FINDONE architecture not found final check (findone.js lines 176-179)', async () => {
      // Create a scenario where we pass all checks but architecture doesn't exist
      await db.box.update({ isPublic: false }, { where: { name: testBox.name } });

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/definitely-not-exists`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Architecture');

      await db.box.update({ isPublic: true }, { where: { name: testBox.name } });
    });

    it('should allow member to access private box architectures (findall.js line 150)', async () => {
      // Make box private
      await db.box.update({ isPublic: false }, { where: { name: testBox.name } });

      // Ensure at least one architecture exists
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: 'member-access-arch' });

      // Request as authenticated member (authToken is for admin who is member)
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      // Cleanup
      await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      await db.box.update({ isPublic: true }, { where: { name: testBox.name } });
    });

    it('should handle FINDALL private box without token (findall.js lines 158-162)', async () => {
      // Make box private
      await db.box.update({ isPublic: false }, { where: { name: testBox.name } });

      const res = await request(app).get(
        `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
      );
      // No token provided

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('Access denied');

      // Restore to public
      await db.box.update({ isPublic: true }, { where: { name: testBox.name } });
    });

    it('should handle DELETE version not found (delete.js lines 115-119)', async () => {
      jest.spyOn(db.versions, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/99.99.99/provider/${testProvider.name}/architecture/test`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Version');
    });

    it('should clean up old directory after rename if it still exists (update.js line 183)', async () => {
      const oldName = 'cleanup-old';
      const newName = 'cleanup-new';

      // Create architecture
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send({ name: oldName });

      // Mock fs to simulate old directory still existing after rename
      const originalExistsSync = fs.existsSync;
      let callCount = 0;
      const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(pathArg => {
        callCount++;
        if (typeof pathArg === 'string') {
          // First call for newFilePath check (line 179)
          if (callCount === 1 && pathArg.includes(newName)) {
            return false;
          }
          // Second call for oldFilePath check (line 181)
          if (callCount === 2 && pathArg.includes(oldName)) {
            return true;
          }
          // Third call for newFilePath exists (line 183) - return false to skip rmSync
          if (callCount === 3 && pathArg.includes(newName)) {
            return false;
          }
          // Fourth call for oldFilePath cleanup check (line 189)
          if (callCount === 4 && pathArg.includes(oldName)) {
            return true;
          }
        }
        return originalExistsSync(pathArg);
      });

      const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
      const rmdirSpy = jest.spyOn(fs, 'rmdirSync').mockImplementation(() => {});

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${oldName}`
        )
        .set('x-access-token', authToken)
        .send({ name: newName });

      expect(res.statusCode).toBe(200);
      expect(rmdirSpy).toHaveBeenCalled(); // Cleanup of old directory

      existsSpy.mockRestore();
      mkdirSpy.mockRestore();
      renameSpy.mockRestore();
      rmdirSpy.mockRestore();

      // Cleanup
      await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${newName}`
        )
        .set('x-access-token', authToken);
    });
  });
});
