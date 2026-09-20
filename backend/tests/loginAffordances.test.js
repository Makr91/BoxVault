import request from 'supertest';
import fs from 'fs';
import yaml from 'js-yaml';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getConfigPath, reloadConfig } from '../app/utils/config-loader.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const updateConfig = async (configName, mutate) => {
  const configPath = getConfigPath(configName);
  const original = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(configPath, yaml.dump(config));
  await reloadConfig();
  return async () => {
    fs.writeFileSync(configPath, original);
    await reloadConfig();
  };
};

describe('Sign-in affordances and case-only renames', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `AffordOrg_${uniqueId}`;
  let org;
  let owner;
  let ownerToken;

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await db.user.create({
      username: `afford-owner-${uniqueId}`,
      email: `afford-owner-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    await owner.setRoles([role]);
    await db.UserOrg.create({ user_id: owner.id, organization_id: org.id, role: 'owner' });
    ownerToken = jwt.sign({ id: owner.id }, 'test-secret', {
      expiresIn: '1h',
      ...TEST_JWT_CLAIMS,
    });
  });

  afterAll(async () => {
    await db.download.destroy({ where: { organizationId: org.id } });
    await db.box.destroy({ where: { organizationId: org.id } });
    await db.UserOrg.destroy({ where: { organization_id: org.id } });
    await org.destroy();
    await owner.destroy();
  });

  it('should answer the three sign-in affordances and refuse a signup while creation is off', async () => {
    const open = await request(app).get('/api/auth/methods');
    expect(open.statusCode).toBe(200);
    expect(open.body.password_reset_enabled).toBe(true);
    expect(open.body.sign_in_link_enabled).toBe(true);
    expect(open.body.local_registration_enabled).toBe(true);

    const restore = await updateConfig('auth', config => {
      config.auth.local = {
        ...(config.auth.local || {}),
        local_allow_password_reset: false,
        local_allow_sign_in_link: false,
        local_allow_registration: false,
      };
    });
    try {
      const closed = await request(app).get('/api/auth/methods');
      expect(closed.body.password_reset_enabled).toBe(false);
      expect(closed.body.sign_in_link_enabled).toBe(false);
      expect(closed.body.local_registration_enabled).toBe(false);

      const refused = await request(app)
        .post('/api/auth/signup')
        .send({
          username: `afford-new-${uniqueId}`,
          email: `afford-new-${uniqueId}@example.com`,
          password: 'Secret123!',
        });
      expect(refused.statusCode).toBe(403);
    } finally {
      await restore();
    }
  });

  it('should let one site close the affordances the rest of the host still offers', async () => {
    const hostname = 'face.test';
    const restore = await updateConfig('app', config => {
      config.sites = config.sites || {};
      config.sites[hostname] = {
        ...(config.sites[hostname] || {}),
        registration: false,
        password_reset: false,
        sign_in_link: false,
      };
    });
    try {
      const site = await request(app).get('/api/auth/methods').set('Host', hostname);
      expect(site.statusCode).toBe(200);
      expect(site.body.password_reset_enabled).toBe(false);
      expect(site.body.sign_in_link_enabled).toBe(false);
      expect(site.body.local_registration_enabled).toBe(false);

      const refused = await request(app)
        .post('/api/auth/signup')
        .set('Host', hostname)
        .send({
          username: `afford-site-${uniqueId}`,
          email: `afford-site-${uniqueId}@example.com`,
          password: 'Secret123!',
        });
      expect(refused.statusCode).toBe(403);

      const elsewhere = await request(app).get('/api/auth/methods');
      expect(elsewhere.body.password_reset_enabled).toBe(true);
      expect(elsewhere.body.sign_in_link_enabled).toBe(true);
    } finally {
      await restore();
    }
  });

  it('should rename a product to the same name in another case and still refuse a real clash', async () => {
    const name = `afford-notes-${uniqueId}`;
    await db.download.create({
      name,
      description: 'rename',
      organizationId: org.id,
      userId: owner.id,
    });
    const renamed = await request(app)
      .put(`/api/organization/${orgName}/download/${name}`)
      .set('x-access-token', ownerToken)
      .send({ name: name.toUpperCase() });
    expect(renamed.body).toMatchObject({ name: name.toUpperCase() });
    expect(renamed.statusCode).toBe(200);

    const taken = `afford-other-${uniqueId}`;
    await db.download.create({
      name: taken,
      description: 'rename',
      organizationId: org.id,
      userId: owner.id,
    });
    const clash = await request(app)
      .put(`/api/organization/${orgName}/download/${taken}`)
      .set('x-access-token', ownerToken)
      .send({ name: name.toUpperCase() });
    expect(clash.statusCode).toBe(409);
  });

  it('should rename a box and one of its versions to the same name in another case', async () => {
    const boxName = `afford-box-${uniqueId}`;
    const box = await db.box.create({
      name: boxName,
      description: 'rename',
      organizationId: org.id,
      userId: owner.id,
      isPublic: true,
      guestAccess: true,
      published: true,
    });
    await db.versions.create({ versionNumber: 'v1.0.0a', boxId: box.id });

    const renamedBox = await request(app)
      .put(`/api/organization/${orgName}/box/${boxName}`)
      .set('x-access-token', ownerToken)
      .send({ name: boxName.toUpperCase() });
    expect(renamedBox.body).toMatchObject({ name: boxName.toUpperCase() });
    expect(renamedBox.statusCode).toBe(200);

    const renamedVersion = await request(app)
      .put(`/api/organization/${orgName}/box/${boxName.toUpperCase()}/version/v1.0.0a`)
      .set('x-access-token', ownerToken)
      .send({ version_number: 'V1.0.0A' });
    expect(renamedVersion.statusCode).toBe(200);
    expect(renamedVersion.body.version_number).toBe('V1.0.0A');
  });
});
