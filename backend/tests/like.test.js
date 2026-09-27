import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { escapeLike, containing, startingWith } from '../app/utils/like.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('LIKE patterns that match literally', () => {
  const uniqueId = Date.now().toString(36);
  const names = [
    `like_a-${uniqueId}`,
    `likeXa-${uniqueId}`,
    `like%b-${uniqueId}`,
    `likeYYb-${uniqueId}`,
    `like!c-${uniqueId}`,
  ];
  let adminToken;
  let admin;

  const named = value =>
    db.organization
      .findAll({ where: { name: { [db.Sequelize.Op.like]: value } }, order: [['name', 'ASC']] })
      .then(rows => rows.map(row => row.name));

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    await Promise.all(names.map(name => db.organization.create({ name })));
    admin = await db.user.create({
      username: `like-admin-${uniqueId}`,
      email: `like-admin-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await admin.setRoles([adminRole]);
    adminToken = jwt.sign({ id: admin.id }, 'test-secret', {
      expiresIn: '1h',
      ...TEST_JWT_CLAIMS,
    });
  });

  afterAll(async () => {
    await db.organization.destroy({ where: { name: names } });
    await admin.destroy();
  });

  it('should escape the two wildcards and the escape character', () => {
    expect(escapeLike('a_b%c!d')).toBe('a!_b!%c!!d');
    expect(escapeLike('plain')).toBe('plain');
  });

  it('should match an underscore only as an underscore', async () => {
    expect(await named(containing(`like_a-${uniqueId}`))).toEqual([`like_a-${uniqueId}`]);
  });

  it('should match a percent sign only as a percent sign', async () => {
    expect(await named(containing(`like%b-${uniqueId}`))).toEqual([`like%b-${uniqueId}`]);
  });

  it('should match the escape character only as itself', async () => {
    expect(await named(containing(`like!c-${uniqueId}`))).toEqual([`like!c-${uniqueId}`]);
  });

  it('should match a leading text and nothing that only resembles it', async () => {
    expect(await named(startingWith('like_'))).toEqual([`like_a-${uniqueId}`]);
  });

  it('should filter the organization list by a literal underscore', async () => {
    const res = await request(app)
      .get('/api/organization')
      .query({ organization: `like_a-${uniqueId}` })
      .set('x-access-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.map(organization => organization.name)).toEqual([`like_a-${uniqueId}`]);
  });

  it('should search for an underscore literally', async () => {
    const res = await request(app)
      .get('/api/search')
      .query({ q: `like_a-${uniqueId}`, kinds: 'organization' })
      .set('x-access-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.results.map(result => result.name)).toEqual([`like_a-${uniqueId}`]);
  });
});
