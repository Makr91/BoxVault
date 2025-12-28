const request = require('supertest');
const app = require('../server');
const db = require('../app/models');

describe('Authentication API', () => {
  beforeAll(async () => {
    // Connect to test database
    await db.sequelize.sync();
  });

  afterAll(async () => {
    // Close database connection
    await db.sequelize.close();
  });

  describe('POST /api/auth/signin', () => {
    it('should authenticate user and return token', async () => {
      const res = await request(app).post('/api/auth/signin').send({
        username: 'SomeUser',
        password: 'SoomePass',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('username', 'SomeUser');
    });

    it('should fail with invalid credentials', async () => {
      const res = await request(app).post('/api/auth/signin').send({
        username: 'SomeUser',
        password: 'wrongpassword',
      });

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('message', 'Invalid Password!');
    });
  });
});
