const request = require('supertest');
const app = require('../server');
const db = require('../app/models');

describe('Version API', () => {
  let authToken;
  const testBox = {
    name: 'test-version-box',
    description: 'Test box for version API testing',
    isPublic: true,
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
  });

  afterAll(async () => {
    // Clean up - delete test box
    await request(app)
      .delete(`/api/organization/STARTcloud/box/${testBox.name}`)
      .set('x-access-token', authToken);

    // Close database connection
    await db.sequelize.close();
  });

  describe('GET /api/organization/:organization/box/:boxId/version', () => {
    it('should return list of versions', async () => {
      const res = await request(app)
        .get(`/api/organization/STARTcloud/box/${testBox.name}/version`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('should fail with invalid box name', async () => {
      const res = await request(app)
        .get('/api/organization/STARTcloud/box/invalid-box/version')
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
          .delete(`/api/organization/STARTcloud/box/${testBox.name}/version/${newVersion.version}`)
          .set('x-access-token', authToken);
      } catch (err) {
        // Ignore errors during cleanup
      }
    });

    it('should create new version', async () => {
      const res = await request(app)
        .post(`/api/organization/STARTcloud/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(newVersion);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('versionNumber', newVersion.version);
      expect(res.body).toHaveProperty('description', newVersion.description);
    });

    it('should fail creating duplicate version', async () => {
      // First create the version
      await request(app)
        .post(`/api/organization/STARTcloud/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(newVersion);

      // Try to create same version again
      const res = await request(app)
        .post(`/api/organization/STARTcloud/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(newVersion);

      expect(res.statusCode).toBe(409);
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
        .post(`/api/organization/STARTcloud/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(version);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(`/api/organization/STARTcloud/box/${testBox.name}/version/${version.version}`)
          .set('x-access-token', authToken);
      } catch (err) {
        // Ignore errors during cleanup
      }
    });

    it('should return version details', async () => {
      const res = await request(app)
        .get(`/api/organization/STARTcloud/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('versionNumber', version.version);
      expect(res.body).toHaveProperty('description', version.description);
    });

    it('should fail with invalid version number', async () => {
      const res = await request(app)
        .get(`/api/organization/STARTcloud/box/${testBox.name}/version/999.999.999`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
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
        .post(`/api/organization/STARTcloud/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(version);
    });

    afterEach(async () => {
      // Clean up
      try {
        await request(app)
          .delete(`/api/organization/STARTcloud/box/${testBox.name}/version/${version.version}`)
          .set('x-access-token', authToken);
      } catch (err) {
        // Ignore errors during cleanup
      }
    });

    it('should update version details', async () => {
      const updateData = {
        description: 'Updated description',
      };

      const res = await request(app)
        .put(`/api/organization/STARTcloud/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', authToken)
        .send(updateData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('description', updateData.description);
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
        .post(`/api/organization/STARTcloud/box/${testBox.name}/version`)
        .set('x-access-token', authToken)
        .send(version);
    });

    it('should delete version', async () => {
      const res = await request(app)
        .delete(`/api/organization/STARTcloud/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      // Verify version is deleted
      const checkRes = await request(app)
        .get(`/api/organization/STARTcloud/box/${testBox.name}/version/${version.version}`)
        .set('x-access-token', authToken);

      expect(checkRes.statusCode).toBe(404);
    });
  });
});
