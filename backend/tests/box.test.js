const request = require('supertest');
const app = require('../server');
const db = require('../app/models');

describe('Box API', () => {
  let authToken;

  beforeAll(async () => {
    // Connect to test database
    await db.sequelize.sync();

    // Get auth token for subsequent requests
    const authResponse = await request(app)
      .post('/api/auth/signin')
      .send({
        username: 'SomeUser',
        password: 'SoomePass'
      });

    authToken = authResponse.body.accessToken;
  });

  afterAll(async () => {
    // Close database connection
    await db.sequelize.close();
  });

  describe('GET /api/organization/:organization/box', () => {
    it('should return list of boxes', async () => {
      const res = await request(app)
        .get('/api/organization/STARTcloud/box')
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBeTruthy();
      expect(res.body.length).toBeGreaterThan(0);
      
      // Verify box structure
      const box = res.body[0];
      expect(box).toHaveProperty('name');
      expect(box).toHaveProperty('description');
      expect(box).toHaveProperty('versions');
    });

    it('should fail with invalid organization', async () => {
      const res = await request(app)
        .get('/api/organization/invalid-org/box')
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/organization/:organization/box/:name', () => {
    it('should return specific box details', async () => {
      const res = await request(app)
        .get('/api/organization/STARTcloud/box/debian12-server')
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('name', 'debian12-server');
      expect(res.body).toHaveProperty('versions');
      expect(Array.isArray(res.body.versions)).toBeTruthy();
    });

    it('should fail with invalid box name', async () => {
      const res = await request(app)
        .get('/api/organization/STARTcloud/box/invalid-box')
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/organization/:organization/box', () => {
    const newBox = {
      name: 'test-box',
      description: 'Test box for API testing',
      isPrivate: true
    };

    afterEach(async () => {
      // Clean up - delete test box if it exists
      try {
        await request(app)
          .delete(`/api/organization/STARTcloud/box/${newBox.name}`)
          .set('x-access-token', authToken);
      } catch (err) {
        // Ignore errors during cleanup
      }
    });

    it('should create new box', async () => {
      const res = await request(app)
        .post('/api/organization/STARTcloud/box')
        .set('x-access-token', authToken)
        .send(newBox);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('name', newBox.name);
      expect(res.body).toHaveProperty('description', newBox.description);
    });

    it('should fail creating duplicate box', async () => {
      // First create the box
      await request(app)
        .post('/api/organization/STARTcloud/box')
        .set('x-access-token', authToken)
        .send(newBox);

      // Try to create same box again
      const res = await request(app)
        .post('/api/organization/STARTcloud/box')
        .set('x-access-token', authToken)
        .send(newBox);

      expect(res.statusCode).toBe(409);
    });
  });

  describe('PUT /api/organization/:organization/box/:name', () => {
    const boxName = 'test-box-update';
    const initialBox = {
      name: boxName,
      description: 'Initial description',
      isPrivate: true
    };

    beforeEach(async () => {
      // Create test box before each test
      await request(app)
        .post('/api/organization/STARTcloud/box')
        .set('x-access-token', authToken)
        .send(initialBox);
    });

    afterEach(async () => {
      // Clean up - delete test box
      try {
        await request(app)
          .delete(`/api/organization/STARTcloud/box/${boxName}`)
          .set('x-access-token', authToken);
      } catch (err) {
        // Ignore errors during cleanup
      }
    });

    it('should update box details', async () => {
      const updateData = {
        description: 'Updated description',
        isPrivate: false
      };

      const res = await request(app)
        .put(`/api/organization/STARTcloud/box/${boxName}`)
        .set('x-access-token', authToken)
        .send(updateData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('description', updateData.description);
      expect(res.body).toHaveProperty('isPrivate', updateData.isPrivate);
    });
  });

  describe('DELETE /api/organization/:organization/box/:name', () => {
    const boxName = 'test-box-delete';
    const testBox = {
      name: boxName,
      description: 'Box to delete',
      isPrivate: true
    };

    beforeEach(async () => {
      // Create test box before each test
      await request(app)
        .post('/api/organization/STARTcloud/box')
        .set('x-access-token', authToken)
        .send(testBox);
    });

    it('should delete box', async () => {
      const res = await request(app)
        .delete(`/api/organization/STARTcloud/box/${boxName}`)
        .set('x-access-token', authToken);

      expect(res.statusCode).toBe(200);

      // Verify box is deleted
      const checkRes = await request(app)
        .get(`/api/organization/STARTcloud/box/${boxName}`)
        .set('x-access-token', authToken);

      expect(checkRes.statusCode).toBe(404);
    });
  });
});
