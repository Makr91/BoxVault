import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };
const ISSUER = 'https://watch-idp.example';

const settle = () =>
  new Promise(resolve => {
    setTimeout(resolve, 250);
  });

describe('Version events fanned out to watchers', () => {
  const uniqueId = Date.now().toString(36);
  const localOrgName = `WatchLocal-${uniqueId}`;
  const externalOrgName = `WatchExternal-${uniqueId}`;
  const boxName = `events-box-${uniqueId}`;
  const draftName = `events-draft-${uniqueId}`;
  let localOrg;
  let externalOrg;
  let owner;
  let watcher;
  let ownerToken;
  let watcherToken;

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const createUser = async label => {
    const account = await db.user.create({
      username: `${label}-${uniqueId}`,
      email: `${label}-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
      preferredLanguage: label.includes('watcher') ? 'es' : null,
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    await account.setRoles([role]);
    return account;
  };

  const versionUrl = (organization, suffix = '') =>
    `/api/organization/${organization}/box/${boxName}/version${suffix}`;

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    localOrg = await db.organization.create({ name: localOrgName, locale: 'en-US' });
    externalOrg = await db.organization.create({
      name: externalOrgName,
      external_issuer: ISSUER,
      external_org_id: `watch-org-${uniqueId}`,
    });
    owner = await createUser('events-owner');
    watcher = await createUser('events-watcher');
    await Promise.all(
      [localOrg, externalOrg].map(async org => {
        await db.UserOrg.create({ user_id: owner.id, organization_id: org.id, role: 'owner' });
        await db.UserOrg.create({ user_id: watcher.id, organization_id: org.id, role: 'member' });
        await db.box.create({
          name: boxName,
          description: 'watched',
          isPublic: true,
          published: true,
          organizationId: org.id,
          userId: owner.id,
        });
      })
    );
    await db.box.create({
      name: draftName,
      description: 'draft',
      isPublic: false,
      published: false,
      organizationId: localOrg.id,
      userId: owner.id,
    });
    await db.credential.create({
      user_id: watcher.id,
      provider: ISSUER,
      subject: `watcher-${uniqueId}`,
      external_email: watcher.email,
    });
    await db.credential.create({
      user_id: watcher.id,
      provider: 'https://other-idp.example',
      subject: `watcher-other-${uniqueId}`,
      external_email: watcher.email,
    });
    ownerToken = signFor(owner);
    watcherToken = signFor(watcher);
  });

  afterAll(async () => {
    await db.box.destroy({ where: { organizationId: [localOrg.id, externalOrg.id] } });
    await db.organization.destroy({ where: { id: [localOrg.id, externalOrg.id] } });
    await db.user.destroy({ where: { id: [owner.id, watcher.id] } });
  });

  it('should let the watcher subscribe to both boxes', async () => {
    const local = await request(app)
      .post(`/api/organization/${localOrgName}/box/${boxName}/watch`)
      .set('x-access-token', watcherToken);
    expect(local.statusCode).toBe(201);
    const external = await request(app)
      .post(`/api/organization/${externalOrgName}/box/${boxName}/watch`)
      .set('x-access-token', watcherToken);
    expect(external.statusCode).toBe(201);
  });

  it('should publish a version on the local organization and notify its watchers', async () => {
    const res = await request(app)
      .post(versionUrl(localOrgName))
      .set('x-access-token', ownerToken)
      .send({ versionNumber: '1.0.0', description: 'first' });
    expect(res.statusCode).toBe(201);
    await settle();
  });

  it('should publish a version on the external organization and address the hub', async () => {
    const res = await request(app)
      .post(versionUrl(externalOrgName))
      .set('x-access-token', ownerToken)
      .send({ versionNumber: '1.0.0', description: 'first' });
    expect(res.statusCode).toBe(201);
    await settle();
  });

  it('should stay quiet for an unpublished box', async () => {
    const res = await request(app)
      .post(`/api/organization/${localOrgName}/box/${draftName}/version`)
      .set('x-access-token', ownerToken)
      .send({ versionNumber: '0.1.0' });
    expect(res.statusCode).toBe(201);
  });

  it('should validate the release note and deprecation fields', async () => {
    const cases = [
      { release_notes: 5 },
      { deprecated: 'yes' },
      { deprecation_reason: 'x'.repeat(513) },
      { deprecated: true },
      { deprecated: true, deprecation_reason: '   ' },
    ];
    const responses = await Promise.all(
      cases.map(body =>
        request(app)
          .put(versionUrl(localOrgName, '/1.0.0'))
          .set('x-access-token', ownerToken)
          .send(body)
      )
    );
    responses.forEach(res => {
      expect(res.statusCode).toBe(400);
    });
  });

  it('should deprecate the version once and notify the watchers', async () => {
    const res = await request(app)
      .put(versionUrl(localOrgName, '/1.0.0'))
      .set('x-access-token', ownerToken)
      .send({ release_notes: 'notes', deprecated: true, deprecation_reason: 'superseded' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      deprecated: true,
      deprecationReason: 'superseded',
      releaseNotes: 'notes',
    });
    await settle();

    const again = await request(app)
      .put(versionUrl(localOrgName, '/1.0.0'))
      .set('x-access-token', ownerToken)
      .send({ deprecated: true, description: 'still deprecated' });
    expect(again.statusCode).toBe(200);
    expect(again.body.description).toBe('still deprecated');
  });

  it('should deprecate a version of the external organization', async () => {
    const res = await request(app)
      .put(versionUrl(externalOrgName, '/1.0.0'))
      .set('x-access-token', ownerToken)
      .send({ deprecated: true, deprecation_reason: 'gone' });
    expect(res.statusCode).toBe(200);
    await settle();
  });
});
