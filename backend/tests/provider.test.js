import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../server.js';
import db from '../app/models/index.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { create } from '../app/controllers/provider/create.js';
import { update } from '../app/controllers/provider/update.js';
import { delete as deleteProviderController } from '../app/controllers/provider/delete.js';
import { findOne } from '../app/controllers/provider/findone.js';
import { findAllByVersion } from '../app/controllers/provider/findallbyversion.js';
import { deleteAllByVersion } from '../app/controllers/provider/deleteallbyversion.js';

describe('Provider API', () => {
  let authToken;
  const uniqueId = Date.now().toString(36);
  const orgName = `ProviderOrg_${uniqueId}`;
  const userName = `ProviderUser_${uniqueId}`;
  const boxName = `provider-box-${uniqueId}`;

  let regularUser;
  let regularToken;
  let outsiderToken;

  const testBox = {
    name: boxName,
    description: 'Test box for provider API testing',
    isPublic: true,
  };
  const testVersion = {
    version: '1.0.0',
    description: 'Test version for provider API testing',
  };

  beforeAll(async () => {
    // Setup User
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    const hashedPassword = await bcrypt.hash('SoomePass', 8);
    const user = await db.user.create({
      username: userName,
      email: `provider_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });

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

    authToken = authResponse.body.accessToken;

    // Setup Regular User (Member, but not Admin)
    regularUser = await db.user.create({
      username: `RegUser_${uniqueId}`,
      email: `reg_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    await regularUser.setRoles([userRole]);
    await db.UserOrg.create({
      user_id: regularUser.id,
      organization_id: org.id,
      role: 'user', // Standard user role
    });
    regularToken = jwt.sign({ id: regularUser.id }, 'test-secret', { expiresIn: '1h' });

    // Setup Outsider User (Not a member)
    const outsiderUser = await db.user.create({
      username: `Outsider_${uniqueId}`,
      email: `out_${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    outsiderToken = jwt.sign({ id: outsiderUser.id }, 'test-secret', { expiresIn: '1h' });

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
  });

  afterAll(async () => {
    // Clean up - delete test box (will cascade delete version and providers)
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
    if (regularUser) {
      await regularUser.destroy();
    }
    await db.user.destroy({ where: { username: `Outsider_${uniqueId}` } });
  });

  describe('GET /api/organization/:organization/box/:boxId/version/:version/provider', () => {
    it('should return list of providers', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('should fail with invalid version', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version/999.999.999/provider`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if organization not found', async () => {
      const res = await request(app)
        .get(
          `/api/organization/NonExistentOrg/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if box not found', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/NonExistentBox/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if version not found', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${testBox.name}/version/9.9.9/provider`)
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/organization/:organization/box/:boxId/version/:version/provider', () => {
    const newProvider = {
      name: 'test-provider',
      description: 'Test provider',
    };

    afterEach(async () => {
      // Clean up - delete test provider if it exists
      try {
        await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${newProvider.name}`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
        // Ignore errors during cleanup
      }
    });

    it('should create new provider', async () => {
      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(newProvider);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('name', newProvider.name);
      expect(res.body).toHaveProperty('description', newProvider.description);
    });

    it('should fail creating duplicate provider', async () => {
      // First create the provider
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(newProvider);

      // Try to create same provider again
      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(newProvider);

      expect(res.statusCode).toBe(409);
    });

    it('should fail if user does not have permission (regular user)', async () => {
      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', regularToken)
        .send({ name: 'unauthorized-provider' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/organization/:organization/box/:boxId/version/:version/provider/:provider', () => {
    const provider = {
      name: 'test-provider',
      description: 'Test provider',
    };

    beforeEach(async () => {
      // Create test provider
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(provider);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
        // Ignore errors during cleanup
      }
    });

    it('should return provider details', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('name', provider.name);
      expect(res.body).toHaveProperty('description', provider.description);
    });

    it('should fail with invalid provider name', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/invalid-provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if organization not found', async () => {
      const res = await request(app)
        .get(
          `/api/organization/NonExistentOrg/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if box not found', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/NonExistentBox/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/organization/:organization/box/:boxId/version/:version/provider/:provider', () => {
    const provider = {
      name: 'test-provider',
      description: 'Initial description',
    };

    beforeEach(async () => {
      // Create test provider
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(provider);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(
            `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        void err;
        // Ignore errors during cleanup
      }
    });

    it('should update provider details', async () => {
      const updateData = {
        description: 'Updated description',
      };

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken)
        .send(updateData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('description', updateData.description);
    });

    it('should fail to update non-existent provider', async () => {
      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/non-existent-provider`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Updated description' });

      expect(res.statusCode).toBe(404);
    });

    it('should fail if user does not have permission', async () => {
      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', regularToken)
        .send({ description: 'Hacked description' });

      expect(res.statusCode).toBe(403);
    });

    it('should rename provider directory when name is updated', async () => {
      const newName = 'renamed-provider';
      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken)
        .send({ name: newName });

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe(newName);

      // Cleanup handled by afterEach, but we need to ensure the new name is used for cleanup if we were persisting state
      // Since afterEach uses the original 'provider' object, we might need to manually clean up the renamed one or update the provider object
      // For this test suite structure, the afterEach tries to delete 'test-provider'.
      // We should manually delete 'renamed-provider' here to keep it clean.
      await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${newName}`
        )
        .set('x-access-token', authToken);
    });
  });

  describe('DELETE /api/organization/:organization/box/:boxId/version/:version/provider/:provider', () => {
    const provider = {
      name: 'test-provider',
      description: 'Provider to delete',
    };

    beforeEach(async () => {
      // Create test provider
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(provider);
    });

    it('should delete provider', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      // Verify provider is deleted
      const checkRes = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken);

      expect(checkRes.statusCode).toBe(404);
    });

    it('should fail to delete non-existent provider', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/non-existent-provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });

    it('should fail if user does not have permission', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', regularToken);

      expect(res.statusCode).toBe(403);
    });

    it('should delete provider and its architectures (cascade check)', async () => {
      // 1. Create Architecture for the provider
      // We need the provider ID first.
      const prov = await db.providers.findOne({ where: { name: provider.name } });
      await db.architectures.create({
        name: 'amd64',
        providerId: prov.id,
      });

      // 2. Delete Provider
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      // 3. Verify Architecture is gone
      const arch = await db.architectures.findOne({ where: { providerId: prov.id } });
      expect(arch).toBeNull();
    });
  });

  describe('DELETE /api/organization/:organization/box/:boxId/version/:version/provider', () => {
    it('should delete all providers for a version', async () => {
      // Create a provider to delete
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send({ name: 'provider-to-delete', description: 'To delete' });

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      // Verify deletion
      const listRes = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);

      expect(listRes.body.length).toBe(0);
    });

    it('should fail if user does not have permission', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', regularToken);

      expect(res.statusCode).toBe(403);
    });

    it('should return 404 if organization not found', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/NonExistentOrg/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/organization/.../provider (Error Cases)', () => {
    it('should return 404 if version not found', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${testBox.name}/version/9.9.9/provider`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Version 9.9.9 not found');
    });
  });

  describe('Private Box Access Control', () => {
    let privateBox;

    beforeAll(async () => {
      const org = await db.organization.findOne({ where: { name: orgName } });
      const user = await db.user.findOne({ where: { username: userName } });

      privateBox = await db.box.create({
        name: `priv-prov-box-${uniqueId}`,
        description: 'Private box',
        isPublic: false,
        organizationId: org.id,
        userId: user.id,
      });

      const version = await db.versions.create({
        versionNumber: '1.0.0',
        boxId: privateBox.id,
      });

      await db.providers.create({
        name: 'virtualbox',
        versionId: version.id,
      });
    });

    afterAll(async () => {
      if (privateBox) {
        await privateBox.destroy();
      }
    });

    it('should deny access to private box providers without token', async () => {
      const res = await request(app).get(
        `/api/organization/${orgName}/box/${privateBox.name}/version/1.0.0/provider`
      );

      expect(res.statusCode).toBe(403);
    });

    it('should deny access to private box providers for non-member', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${privateBox.name}/version/1.0.0/provider`)
        .set('x-access-token', outsiderToken);

      expect(res.statusCode).toBe(403);
    });

    it('should allow access to private box providers for member', async () => {
      const res = await request(app)
        .get(`/api/organization/${orgName}/box/${privateBox.name}/version/1.0.0/provider`)
        .set('x-access-token', regularToken);

      expect(res.statusCode).toBe(200);
    });

    it('should allow access to specific private box provider for member', async () => {
      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${privateBox.name}/version/1.0.0/provider/virtualbox`
        )
        .set('x-access-token', regularToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('name', 'virtualbox');
    });
  });

  describe('Provider Controller Error Handling', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should handle database errors during creation', async () => {
      jest.spyOn(db.providers, 'create').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send({ name: 'error-provider' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during update', async () => {
      // Ensure provider exists first so we don't get 404
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send({ name: 'test-provider', description: 'To be updated' });

      jest.spyOn(db.providers, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/test-provider`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during deletion', async () => {
      // Ensure provider exists first
      await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send({ name: 'test-provider', description: 'To be deleted' });

      jest.spyOn(db.providers, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/test-provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during findOne', async () => {
      jest.spyOn(db.providers, 'findOne').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/test-provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during creation with fallback message', async () => {
      jest.spyOn(db.providers, 'create').mockRejectedValue(new Error(''));

      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send({ name: 'error-provider-2' });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('should return 404 if organization not found during creation', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send({ name: 'test-provider' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Organization');
    });

    it('should return 404 if box not found during creation', async () => {
      jest.spyOn(db.box, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send({ name: 'test-provider' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Box');
    });

    it('should return 404 if version not found during creation', async () => {
      jest.spyOn(db.versions, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .post(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send({ name: 'test-provider' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Version');
    });

    it('should return 404 if provider not found during update', async () => {
      jest.spyOn(db.providers, 'update').mockResolvedValue([0]);

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/test-provider`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Provider');
    });

    it('should handle database errors during update with fallback message', async () => {
      // Mock Provider.update to throw
      jest.spyOn(db.providers, 'update').mockRejectedValue(new Error(''));

      const res = await request(app)
        .put(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/test-provider`
        )
        .set('x-access-token', authToken)
        .send({ description: 'Updated' });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('should return 404 if provider not found during deletion', async () => {
      jest.spyOn(db.providers, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/test-provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Provider');
    });

    it('should handle database errors during deletion with fallback message', async () => {
      // Mock findOne to return a provider so we proceed to destroy
      jest.spyOn(db.providers, 'findOne').mockResolvedValue({
        destroy: jest.fn().mockRejectedValue(new Error('')),
      });

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/test-provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('should log error if fs.rm fails during deletion', async () => {
      // Mock findOne to return a provider
      jest.spyOn(db.providers, 'findOne').mockResolvedValue({
        destroy: jest.fn().mockResolvedValue(true),
        name: 'test-provider',
        id: 1, // Required for Architecture.findAll
      });

      // Mock fs.rm to fail
      const rmSpy = jest.spyOn(fs, 'rm').mockImplementation((path, options, callback) => {
        void path;
        void options;
        callback(new Error('FS Error'));
      });

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/test-provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      rmSpy.mockRestore();
    });

    it('should return 404 if provider not found during findOne', async () => {
      jest.spyOn(db.providers, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/test-provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain('Provider');
    });

    it('should handle database errors during findOne with fallback message', async () => {
      jest.spyOn(db.providers, 'findOne').mockRejectedValue(new Error(''));

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider/test-provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('should handle database errors during findAllByVersion', async () => {
      jest.spyOn(db.providers, 'findAll').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during findAllByVersion with fallback message', async () => {
      jest.spyOn(db.providers, 'findAll').mockRejectedValue(new Error(''));

      const res = await request(app)
        .get(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('should handle database errors during deleteAllByVersion', async () => {
      jest.spyOn(db.providers, 'destroy').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors during deleteAllByVersion with fallback message', async () => {
      jest.spyOn(db.providers, 'destroy').mockRejectedValue(new Error(''));

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBeDefined();
    });

    it('should return 404 if no providers found to delete in deleteAllByVersion', async () => {
      // Mock destroy to return 0 rows affected
      jest.spyOn(db.providers, 'destroy').mockResolvedValue(0);
      // Mock findAll to return empty array (or just rely on destroy return value if controller uses it)
      // Assuming controller checks return value of destroy or does a findAll first.
      // If controller does findAll first:
      jest.spyOn(db.providers, 'findAll').mockResolvedValue([]);

      const res = await request(app)
        .delete(
          `/api/organization/${orgName}/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Provider Controller Unit Tests (Coverage)', () => {
    let req;
    let res;

    beforeEach(() => {
      req = {
        params: {
          organization: orgName,
          boxId: boxName,
          versionNumber: '1.0.0',
          providerName: 'test-provider',
        },
        body: {
          name: 'test-provider',
        },
        userId: 1,
        __: key => key,
        headers: {},
      };
      res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    // create.js coverage
    it('create should handle existing directory (create.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({ id: 1, userId: 1 });
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockResolvedValue({ role: 'admin' });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.providers, 'create').mockResolvedValue({ id: 1, name: 'test-provider' });

      // Mock existsSync to return true (directory exists)
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      await create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mkdirSpy).not.toHaveBeenCalled(); // Should skip mkdir if exists
    });

    // delete.js coverage
    it('delete should return 404 if organization not found (delete.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(null);
      await deleteProviderController(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('delete should return 404 if box not found (delete.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue(null);
      await deleteProviderController(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('delete should return 404 if version not found (delete.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({ id: 1, userId: 1 });
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockResolvedValue({ role: 'admin' });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue(null);
      await deleteProviderController(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('delete should log error if fs.rm fails (delete.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({ id: 1, userId: 1 });
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockResolvedValue({ role: 'admin' });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.providers, 'findOne').mockResolvedValue({ id: 1, destroy: jest.fn() });
      jest.spyOn(db.architectures, 'findAll').mockResolvedValue([]);

      // Mock fs.rm to call callback with error
      jest.spyOn(fs, 'rm').mockImplementation((path, options, cb) => {
        void path;
        void options;
        cb(new Error('FS Error'));
      });

      await deleteProviderController(req, res);

      expect(res.send).toHaveBeenCalled(); // Should succeed despite FS error
    });

    // update.js coverage
    it('update should return 404 if version not found (update.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({ id: 1, userId: 1 });
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockResolvedValue({ role: 'admin' });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue(null);

      await update(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('update should clean up old directory if it exists after rename (update.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({ id: 1, userId: 1 });
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockResolvedValue({ role: 'admin' });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.providers, 'update').mockResolvedValue([1]);
      jest.spyOn(db.providers, 'findOne').mockResolvedValue({ name: 'new-name' });

      req.body.name = 'new-name';

      // Mock fs calls
      jest.spyOn(fs, 'existsSync').mockReturnValue(true); // old path exists
      jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
      const rmdirSpy = jest.spyOn(fs, 'rmdirSync').mockImplementation(() => {});

      await update(req, res);

      expect(rmdirSpy).toHaveBeenCalled();
    });

    // findone.js coverage
    it('findOne should return 404 if organization not found (findone.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(null);
      await findOne(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('findOne should return 404 if provider not found (findone.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({
        id: 1,
        isPublic: true,
        versions: [{ versionNumber: '1.0.0', providers: [] }],
      });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.providers, 'findOne').mockResolvedValue(null); // Provider not found

      await findOne(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('findOne should return 403 if private box and no user (findone.js)', async () => {
      req.userId = null;
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({
        id: 1,
        isPublic: false,
        versions: [{ versionNumber: '1.0.0', providers: [{ name: 'test-provider' }] }],
      });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue({ id: 1 });

      await findOne(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('findOne should return 403 if private box and user not member (findone.js)', async () => {
      req.userId = 1;
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({
        id: 1,
        isPublic: false,
        versions: [{ versionNumber: '1.0.0', providers: [{ name: 'test-provider' }] }],
      });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockResolvedValue(null);

      await findOne(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('findOne should return 404 if private box, member, but provider not found (findone.js)', async () => {
      const token = jwt.sign({ id: 1 }, 'test-secret', { expiresIn: '1h' });
      req.headers['x-access-token'] = token;
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({
        id: 1,
        isPublic: false,
        versions: [{ versionNumber: '1.0.0', providers: [] }],
      });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockResolvedValue({ role: 'user' });
      jest.spyOn(db.providers, 'findOne').mockResolvedValue(null);

      await findOne(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('delete should log error if fs.rm fails for architecture (delete.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({ id: 1, userId: 1 });
      jest.spyOn(db.UserOrg, 'findUserOrgRole').mockResolvedValue({ role: 'admin' });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.providers, 'findOne').mockResolvedValue({ id: 1, destroy: jest.fn() });
      // Return one architecture to enter the loop
      jest
        .spyOn(db.architectures, 'findAll')
        .mockResolvedValue([{ id: 1, name: 'arch1', destroy: jest.fn() }]);

      // Mock fs.rm to call callback with error
      jest.spyOn(fs, 'rm').mockImplementation((path, options, cb) => {
        void path;
        void options;
        cb(new Error('FS Error'));
      });

      await deleteProviderController(req, res);

      expect(res.send).toHaveBeenCalled();
    });

    it('delete should handle generic error (delete.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('Generic Error'));
      await deleteProviderController(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('deleteAllByVersion should return 404 if box not found (deleteallbyversion.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue(null);
      await deleteAllByVersion(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('findAllByVersion should return 404 if organization not found (findallbyversion.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(null);
      await findAllByVersion(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('update should return 404 if organization not found (update.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue(null);
      await update(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('update should return 404 if box not found (update.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue(null);
      await update(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('delete should handle generic error without message (delete.js)', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue({});
      await deleteProviderController(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('findOne should return 404 if version not found (explicit coverage)', async () => {
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.box, 'findOne').mockResolvedValue({ id: 1 });
      jest.spyOn(db.versions, 'findOne').mockResolvedValue(null);

      await findOne(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('versions.versionNotFoundInBox'),
        })
      );
    });
  });
});
