const request = require('supertest');
const app = require('../server');
const db = require('../app/models');

describe('Architecture API', () => {
  let authToken;
  const testBox = {
    name: 'test-arch-box',
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

    // Create test provider
    await request(app)
      .post(
        `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider`
      )
      .set('x-access-token', authToken)
      .send(testProvider);
  });

  afterAll(async () => {
    // Clean up - delete test box (will cascade delete version, provider, and architectures)
    await request(app)
      .delete(`/api/organization/STARTcloud/box/${testBox.name}`)
      .set('x-access-token', authToken);

    // Close database connection
    await db.sequelize.close();
  });

  describe('GET /api/organization/:organization/box/:boxId/version/:version/provider/:provider/architecture', () => {
    it('should return list of architectures', async () => {
      const res = await request(app)
        .get(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('should fail with invalid provider', async () => {
      const res = await request(app)
        .get(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/invalid-provider/architecture`
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
            `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${newArchitecture.name}`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        // Ignore errors during cleanup
      }
    });

    it('should create new architecture', async () => {
      const res = await request(app)
        .post(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(newArchitecture);

      // Try to create same architecture again
      const res = await request(app)
        .post(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(newArchitecture);

      expect(res.statusCode).toBe(409);
    });

    it('should validate architecture name', async () => {
      const invalidArch = {
        name: 'invalid-arch',
        description: 'Invalid architecture name',
        defaultBox: true,
      };

      const res = await request(app)
        .post(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(architecture);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(
            `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
          )
          .set('x-access-token', authToken);
      } catch (err) {
        // Ignore errors during cleanup
      }
    });

    it('should return architecture details', async () => {
      const res = await request(app)
        .get(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/invalid-arch`
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(architecture);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(
            `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
          )
          .set('x-access-token', authToken);
      } catch (err) {
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
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
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture`
        )
        .set('x-access-token', authToken)
        .send(architecture);
    });

    it('should delete architecture', async () => {
      const res = await request(app)
        .delete(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
        )
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      // Verify architecture is deleted
      const checkRes = await request(app)
        .get(
          `/api/organization/STARTcloud/box/${testBox.name}/version/${testVersion.version}/provider/${testProvider.name}/architecture/${architecture.name}`
        )
        .set('x-access-token', authToken);

      expect(checkRes.statusCode).toBe(404);
    });
  });
});
