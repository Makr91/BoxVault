const request = require('supertest');
const app = require('../server');
const db = require('../app/models');

describe('Provider API', () => {
  let authToken;
  const testBox = {
    name: 'test-provider-box',
    description: 'Test box for provider API testing',
    isPublic: true,
  };
  const testVersion = {
    version: '1.0.0',
    description: 'Test version for provider API testing',
  };

  beforeAll(async () => {
    // Connect to test database
    await db.sequelize.sync();

    // Get auth token
    const authResponse = await request(app).post('/api/auth/signin').send({
      username: 'SomeUser',
      password: 'SoomePass',
    });

    authToken = authResponse.body.accessToken;

    // Create test box
    await request(app)
      .post('/api/organization/STARTcloud/box')
      .set('x-access-token', authToken)
      .send(testBox);

    // Create test version
    await request(app)
      .post(`/api/organization/STARTcloud/box/${testBox.name}/version`)
      .set('x-access-token', authToken)
      .send(testVersion);
  });

  afterAll(async () => {
    // Clean up - delete test box (will cascade delete version and providers)
    await request(app)
      .delete(`/api/organization/STARTcloud/box/${testBox.name}`)
      .set('x-access-token', authToken);

    // Close database connection
    await db.sequelize.close();
  });

  describe('GET /api/organization/:organization/box/:boxId/version/:version/provider', () => {
    it('should return list of providers', async () => {
      const res = await request(app)
        .get(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('should fail with invalid version', async () => {
      const res = await request(app)
        .get(`/api/organization/STARTcloud/box/${testBox.name}/version/999.999.999/provider`)
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
            `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${newProvider.name}`
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider`
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(newProvider);

      // Try to create same provider again
      const res = await request(app)
        .post(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(newProvider);

      expect(res.statusCode).toBe(409);
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(provider);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(
            `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('name', provider.name);
      expect(res.body).toHaveProperty('description', provider.description);
    });

    it('should fail with invalid provider name', async () => {
      const res = await request(app)
        .get(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/invalid-provider`
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(provider);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(
            `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken)
        .send(updateData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('description', updateData.description);
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider`
        )
        .set('x-access-token', authToken)
        .send(provider);
    });

    it('should delete provider', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      // Verify provider is deleted
      const checkRes = await request(app)
        .get(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${provider.name}`
        )
        .set('x-access-token', authToken);

      expect(checkRes.statusCode).toBe(404);
    });
  });
});
