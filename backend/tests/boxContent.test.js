import request from 'supertest';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureBoxPath } from '../app/utils/paths.js';
import { hashServiceAccountToken } from '../app/utils/serviceAccountAuth.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const binaryParser = (response, callback) => {
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Box and ISO content validation and visibility', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `ContentOrg-${uniqueId}`;
  const privateName = `content-private-${uniqueId}`;
  const boxName = `cbox-${uniqueId}`;
  const isoName = `ciso-${uniqueId}`;
  const rawKey = `content-key-${uniqueId}-${'d'.repeat(20)}`;
  let org;
  let owner;
  let member;
  let ownerToken;
  let memberToken;
  let serviceAccount;

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const createUser = async (label, orgRole) => {
    const account = await db.user.create({
      username: `${label}-${uniqueId}`,
      email: `${label}-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    await account.setRoles([role]);
    await db.UserOrg.create({ user_id: account.id, organization_id: org.id, role: orgRole });
    return account;
  };

  const boxUrl = (suffix = '') => `/api/organization/${orgName}/box${suffix}`;

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName });
    owner = await createUser('content-owner', 'owner');
    member = await createUser('content-member', 'member');
    ownerToken = signFor(owner);
    memberToken = signFor(member);
    serviceAccount = await db.service_account.create({
      username: `content-sa-${uniqueId}`,
      token: hashServiceAccountToken(rawKey),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      userId: owner.id,
      organization_id: org.id,
    });

    const privateBox = await db.box.create({
      name: privateName,
      description: 'private',
      isPublic: false,
      published: true,
      organizationId: org.id,
      userId: owner.id,
      artwork: 'artwork.png',
    });
    const version = await db.versions.create({ versionNumber: '1.0.0', boxId: privateBox.id });
    const provider = await db.providers.create({ name: 'virtualbox', versionId: version.id });
    await db.architectures.create({ name: 'amd64', providerId: provider.id });
    const dir = getSecureBoxPath(orgName, privateName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'artwork.png'), Buffer.from('png-bytes'));
  });

  afterAll(async () => {
    await serviceAccount.destroy();
    await db.iso.destroy({ where: { organizationId: org.id } });
    await db.box.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({ where: { id: [owner.id, member.id] } });
    fs.rmSync(getSecureBoxPath(orgName), { recursive: true, force: true });
  });

  describe('box content fields', () => {
    it('should reject a box name with consecutive periods', async () => {
      const res = await request(app)
        .post(boxUrl())
        .set('x-access-token', ownerToken)
        .send({ name: 'bad..box' });
      expect(res.statusCode).toBe(400);
    });

    it('should reject malformed content fields on create', async () => {
      const longShort = await request(app)
        .post(boxUrl())
        .set('x-access-token', ownerToken)
        .send({ name: boxName, shortDescription: 'x'.repeat(256) });
      expect(longShort.statusCode).toBe(400);
      const badReadme = await request(app)
        .post(boxUrl())
        .set('x-access-token', ownerToken)
        .send({ name: boxName, readme: 5 });
      expect(badReadme.statusCode).toBe(400);
    });

    it('should create the box with sanitized metadata and update its content fields', async () => {
      const created = await request(app)
        .post(boxUrl())
        .set('x-access-token', ownerToken)
        .send({
          name: boxName,
          description: 'content box',
          published: true,
          isPublic: true,
          shortDescription: 'short',
          readme: '# hi',
          metadata: { distro: 'debian', junk: true },
        });
      expect(created.statusCode).toBe(201);
      expect(created.body.metadata).toEqual({ distro: 'debian' });
      expect(created.body.shortDescription).toBe('short');

      const badUpdate = await request(app)
        .put(boxUrl(`/${boxName}`))
        .set('x-access-token', ownerToken)
        .send({ readme: 7 });
      expect(badUpdate.statusCode).toBe(400);

      const cleared = await request(app)
        .put(boxUrl(`/${boxName}`))
        .set('x-access-token', ownerToken)
        .send({ shortDescription: null, readme: null, metadata: null });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.body.shortDescription).toBeNull();
      expect(cleared.body.readme).toBeNull();
      expect(cleared.body.metadata).toBeNull();
    });

    it('should reject provider and architecture names with consecutive periods', async () => {
      const provider = await request(app)
        .post(boxUrl(`/${privateName}/version/1.0.0/provider`))
        .set('x-access-token', ownerToken)
        .send({ name: 'bad..provider' });
      expect(provider.statusCode).toBe(400);
      const architecture = await request(app)
        .post(boxUrl(`/${privateName}/version/1.0.0/provider/virtualbox/architecture`))
        .set('x-access-token', ownerToken)
        .send({ name: 'bad..arch' });
      expect(architecture.statusCode).toBe(400);
    });
  });

  describe('private box visibility', () => {
    const architectureUrl = boxUrl(
      `/${privateName}/version/1.0.0/provider/virtualbox/architecture/amd64`
    );

    it('should hide the architecture of a private box from anonymous callers', async () => {
      const anonymous = await request(app).get(architectureUrl);
      expect(anonymous.statusCode).toBe(403);
      const asMember = await request(app).get(architectureUrl).set('x-access-token', memberToken);
      expect(asMember.statusCode).toBe(200);
      expect(asMember.body.name).toBe('amd64');
    });

    it('should show the private box to a raw key and to a member on discover', async () => {
      const byKey = await request(app)
        .get('/api/discover')
        .set('Authorization', `Bearer ${rawKey}`);
      expect(byKey.statusCode).toBe(200);
      expect(byKey.body.map(box => box.name)).toContain(privateName);
      const byToken = await request(app).get('/api/discover').set('x-access-token', memberToken);
      expect(byToken.statusCode).toBe(200);
      expect(byToken.body.map(box => box.name)).toContain(privateName);
      const anonymous = await request(app).get('/api/discover');
      expect(anonymous.body.map(box => box.name)).not.toContain(privateName);
    });

    it('should list the organization boxes for a raw key', async () => {
      const res = await request(app).get(boxUrl()).set('Authorization', `Bearer ${rawKey}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.map(box => box.name)).toContain(privateName);
    });

    it('should still serve private artwork to a suspended member through the token', async () => {
      await member.update({ suspended: true });
      try {
        const res = await request(app)
          .get(boxUrl(`/${privateName}/artwork`))
          .set('x-access-token', memberToken)
          .buffer(true)
          .parse(binaryParser);
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('image/png');
      } finally {
        await member.update({ suspended: false });
      }
    });
  });

  describe('ISO content fields', () => {
    it('should reject malformed metadata on create and update', async () => {
      const bad = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', ownerToken)
        .send({ name: isoName, metadata: 'bad' });
      expect(bad.statusCode).toBe(400);

      const created = await request(app)
        .post(`/api/organization/${orgName}/iso`)
        .set('x-access-token', ownerToken)
        .send({ name: isoName, isPublic: true, metadata: { distro: 'ubuntu', junk: 1 } });
      expect(created.statusCode).toBe(201);
      expect(created.body.metadata).toEqual({ distro: 'ubuntu' });

      const badUpdate = await request(app)
        .put(`/api/organization/${orgName}/iso/${isoName}`)
        .set('x-access-token', ownerToken)
        .send({ metadata: [] });
      expect(badUpdate.statusCode).toBe(400);
    });

    it('should discover ISOs for a raw key', async () => {
      const res = await request(app)
        .get('/api/isos/discover')
        .set('Authorization', `Bearer ${rawKey}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.map(iso => iso.name)).toContain(isoName);
    });
  });
});
