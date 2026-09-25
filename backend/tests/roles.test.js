import request from 'supertest';
import { jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import app from '../server.js';
import db from '../app/models/index.js';

describe('Global roles API', () => {
  const uniqueId = Date.now().toString(36);
  let adminToken;
  let userToken;
  let adminUser;
  let plainUser;

  const signIn = username =>
    request(app)
      .post('/api/auth/signin')
      .send({ username, password: 'aSecurePassword123' })
      .then(res => res.body.access_token);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    const hashedPassword = await bcrypt.hash('aSecurePassword123', 8);
    adminUser = await db.user.create({
      username: `roles-admin-${uniqueId}`,
      email: `roles-admin-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    plainUser = await db.user.create({
      username: `roles-user-${uniqueId}`,
      email: `roles-user-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await adminUser.setRoles([adminRole]);
    await plainUser.setRoles([userRole]);
    adminToken = await signIn(adminUser.username);
    userToken = await signIn(plainUser.username);
  });

  afterAll(async () => {
    await db.user.destroy({ where: { email: { [db.Sequelize.Op.like]: `%${uniqueId}%` } } });
  });

  it('should list the role names to an admin', async () => {
    const res = await request(app).get('/api/roles').set('x-access-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ roles: ['user', 'admin'] });
  });

  it('should refuse the list and the reads and writes to a plain user', async () => {
    expect((await request(app).get('/api/roles').set('x-access-token', userToken)).statusCode).toBe(
      403
    );
    expect(
      (await request(app).get(`/api/users/${adminUser.id}/roles`).set('x-access-token', userToken))
        .statusCode
    ).toBe(403);
    const write = await request(app)
      .put(`/api/users/${plainUser.id}/roles`)
      .set('x-access-token', userToken)
      .send({ roles: ['admin'] });
    expect(write.statusCode).toBe(403);
    expect((await request(app).get('/api/roles')).statusCode).toBe(403);
  });

  it("should answer one user's roles", async () => {
    const res = await request(app)
      .get(`/api/users/${plainUser.id}/roles`)
      .set('x-access-token', adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ roles: ['user'] });
  });

  it('should answer 404 for an unknown user', async () => {
    const read = await request(app)
      .get('/api/users/999999/roles')
      .set('x-access-token', adminToken);
    expect(read.statusCode).toBe(404);
    const write = await request(app)
      .put('/api/users/999999/roles')
      .set('x-access-token', adminToken)
      .send({ roles: ['user'] });
    expect(write.statusCode).toBe(404);
  });

  it('should refuse an empty or missing set by rule', async () => {
    const empty = await request(app)
      .put(`/api/users/${plainUser.id}/roles`)
      .set('x-access-token', adminToken)
      .send({ roles: [] });
    expect(empty.statusCode).toBe(422);
    expect(empty.body.errors[0]).toMatchObject({ pointer: '/roles', rule: 'minItems' });
    const missing = await request(app)
      .put(`/api/users/${plainUser.id}/roles`)
      .set('x-access-token', adminToken)
      .send({});
    expect(missing.statusCode).toBe(422);
    expect(missing.body.errors[0]).toMatchObject({ pointer: '/roles', rule: 'required' });
    const notList = await request(app)
      .put(`/api/users/${plainUser.id}/roles`)
      .set('x-access-token', adminToken)
      .send({ roles: 'admin' });
    expect(notList.statusCode).toBe(422);
    expect(notList.body.errors[0]).toMatchObject({ pointer: '/roles', rule: 'type' });
  });

  it('should refuse a role name the table does not hold', async () => {
    const res = await request(app)
      .put(`/api/users/${plainUser.id}/roles`)
      .set('x-access-token', adminToken)
      .send({ roles: ['user', 'superuser'] });
    expect(res.statusCode).toBe(422);
    expect(res.body.errors).toEqual([
      expect.objectContaining({
        pointer: '/roles/1',
        rule: 'enum',
        params: { enum: 'user, admin' },
      }),
    ]);
    expect((await plainUser.getRoles()).map(role => role.name)).toEqual(['user']);
  });

  it('should replace the whole set, deduplicated, and answer it in table order', async () => {
    const res = await request(app)
      .put(`/api/users/${plainUser.id}/roles`)
      .set('x-access-token', adminToken)
      .send({ roles: ['admin', 'user', 'admin'] });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      message: 'Global roles updated successfully!',
      roles: ['user', 'admin'],
    });
    expect((await plainUser.getRoles()).map(role => role.name).sort()).toEqual(['admin', 'user']);

    const back = await request(app)
      .put(`/api/users/${plainUser.id}/roles`)
      .set('x-access-token', adminToken)
      .send({ roles: ['user'] });
    expect(back.statusCode).toBe(200);
    expect(back.body.roles).toEqual(['user']);
    expect((await plainUser.getRoles()).map(role => role.name)).toEqual(['user']);
  });

  it('should keep the admin role on the last administrator', async () => {
    const count = jest.spyOn(db.user, 'count').mockResolvedValueOnce(1);
    try {
      const res = await request(app)
        .put(`/api/users/${adminUser.id}/roles`)
        .set('x-access-token', adminToken)
        .send({ roles: ['user'] });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/roles',
          rule: 'lastAdmin',
          detail:
            'This account is the last administrator. Make another account an administrator first.',
        }),
      ]);
      expect((await adminUser.getRoles()).map(role => role.name)).toEqual(['admin']);
    } finally {
      count.mockRestore();
    }

    const promote = await request(app)
      .put(`/api/users/${plainUser.id}/roles`)
      .set('x-access-token', adminToken)
      .send({ roles: ['admin'] });
    expect(promote.statusCode).toBe(200);
    const demote = await request(app)
      .put(`/api/users/${adminUser.id}/roles`)
      .set('x-access-token', adminToken)
      .send({ roles: ['user'] });
    expect(demote.statusCode).toBe(200);
    expect(demote.body.roles).toEqual(['user']);
    expect((await adminUser.getRoles()).map(role => role.name)).toEqual(['user']);
  });

  it('should answer 500 when the roles table fails', async () => {
    const failing = jest.spyOn(db.role, 'findAll').mockRejectedValueOnce(new Error('down'));
    try {
      const res = await request(app).get('/api/roles').set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
    } finally {
      failing.mockRestore();
    }
  });
});
