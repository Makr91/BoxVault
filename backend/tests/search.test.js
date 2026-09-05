import request from 'supertest';
import { createHash } from 'crypto';
import app from '../server.js';
import db from '../app/models/index.js';
import jwt from 'jsonwebtoken';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const ROW_KEYS = [
  'kind',
  'collection',
  'org',
  'name',
  'version',
  'provider',
  'architecture',
  'title',
  'subtitle',
  'matched',
];

describe('Search API', () => {
  let memberToken;
  let adminToken;
  let member;
  let admin;
  let org;
  let publicBox;
  let privateBox;
  let version;
  let provider;
  let architecture;
  let file;
  const uniqueId = Date.now();
  const orgName = `SearchOrg_${uniqueId}`;
  const memberName = `searchmember_${uniqueId}`;
  const publicBoxName = `search-public-${uniqueId}`;
  const privateBoxName = `search-private-${uniqueId}`;
  const fileName = `search-artifact-${uniqueId}.box`;
  const checksum = createHash('sha256').update(`search-${uniqueId}`).digest('hex');

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);

    org = await db.organization.create({ name: orgName, access_mode: 'private' });

    member = await db.user.create({
      username: memberName,
      email: `${memberName}@example.com`,
      password: 'password',
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await member.setRoles([userRole]);
    await db.UserOrg.create({ user_id: member.id, organization_id: org.id, role: 'member' });
    memberToken = signFor(member);

    admin = await db.user.create({
      username: `searchadmin_${uniqueId}`,
      email: `searchadmin_${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await admin.setRoles([adminRole]);
    await db.UserOrg.create({ user_id: admin.id, organization_id: org.id, role: 'owner' });
    adminToken = signFor(admin);

    publicBox = await db.box.create({
      name: publicBoxName,
      description: 'A public box',
      published: true,
      isPublic: true,
      userId: member.id,
      organizationId: org.id,
      metadata: { distro: `zebradistro${uniqueId}`, password: `hunter${uniqueId}secret` },
    });
    privateBox = await db.box.create({
      name: privateBoxName,
      description: 'A private box',
      published: true,
      isPublic: false,
      userId: member.id,
      organizationId: org.id,
    });
    version = await db.versions.create({ versionNumber: '1.0.0', boxId: publicBox.id });
    provider = await db.providers.create({ name: 'virtualbox', versionId: version.id });
    architecture = await db.architectures.create({ name: 'amd64', providerId: provider.id });
    file = await db.files.create({
      fileName,
      checksum,
      checksumType: 'SHA256',
      fileSize: 10,
      architectureId: architecture.id,
    });
  });

  afterAll(async () => {
    await file.destroy();
    await architecture.destroy();
    await provider.destroy();
    await version.destroy();
    await privateBox.destroy();
    await publicBox.destroy();
    await org.destroy();
    await member.destroy();
    await admin.destroy();
  });

  describe('GET /api/search', () => {
    it('should reject a query shorter than 2 characters', async () => {
      const res = await request(app).get('/api/search').query({ q: ' a ' });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBeDefined();
    });

    it('should answer only public items to an anonymous caller', async () => {
      const res = await request(app).get('/api/search').query({ q: 'search-p' });
      expect(res.statusCode).toBe(200);
      expect(res.body.query).toBe('search-p');
      const names = res.body.results.map(row => row.name);
      expect(names).toContain(publicBoxName);
      expect(names).not.toContain(privateBoxName);
      const hit = res.body.results.find(row => row.name === publicBoxName);
      expect(hit).toEqual({
        kind: 'item',
        collection: 'boxes',
        org: orgName,
        name: publicBoxName,
        version: '',
        provider: '',
        architecture: '',
        title: publicBoxName,
        subtitle: `${orgName} · boxes`,
        matched: 'name',
      });
      expect(res.body.results.some(row => row.kind === 'organization')).toBe(false);
      expect(res.body.results.some(row => row.kind === 'user')).toBe(false);
    });

    it('should match whitelisted metadata keys and never the password', async () => {
      const distro = await request(app)
        .get('/api/search')
        .query({ q: `zebradistro${uniqueId}` });
      expect(distro.statusCode).toBe(200);
      const hit = distro.body.results.find(row => row.name === publicBoxName);
      expect(hit).toBeDefined();
      expect(hit.matched).toBe('metadata.distro');
      expect(JSON.stringify(distro.body)).not.toContain(`hunter${uniqueId}secret`);

      const password = await request(app)
        .get('/api/search')
        .query({ q: `hunter${uniqueId}secret` });
      expect(password.statusCode).toBe(200);
      expect(password.body.results).toEqual([]);
    });

    it('should answer private rows of the own organization to a member', async () => {
      const res = await request(app)
        .get('/api/search')
        .query({ q: 'search-p' })
        .set('x-access-token', memberToken);
      expect(res.statusCode).toBe(200);
      const names = res.body.results.map(row => row.name);
      expect(names).toContain(publicBoxName);
      expect(names).toContain(privateBoxName);

      const orgs = await request(app)
        .get('/api/search')
        .query({ q: orgName, kinds: 'organization' })
        .set('x-access-token', memberToken);
      expect(orgs.statusCode).toBe(200);
      expect(orgs.body.results).toEqual([
        {
          kind: 'organization',
          collection: null,
          org: orgName,
          name: orgName,
          version: '',
          provider: '',
          architecture: '',
          title: orgName,
          subtitle: '',
          matched: 'name',
        },
      ]);
    });

    it('should never answer users to a plain member', async () => {
      const res = await request(app)
        .get('/api/search')
        .query({ q: memberName })
        .set('x-access-token', memberToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.results.some(row => row.kind === 'user')).toBe(false);
    });

    it('should answer users to a global admin without password or suspended fields', async () => {
      const res = await request(app)
        .get('/api/search')
        .query({ q: memberName, kinds: 'user' })
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(200);
      const hit = res.body.results.find(row => row.name === memberName);
      expect(hit).toBeDefined();
      expect(hit.kind).toBe('user');
      expect(hit.title).toBe(memberName);
      expect(hit.matched).toBe('username');
      expect(Object.keys(hit).sort()).toEqual([...ROW_KEYS].sort());
    });

    it('should match an artifact by checksum prefix', async () => {
      const res = await request(app)
        .get('/api/search')
        .query({ q: checksum.slice(0, 12) });
      expect(res.statusCode).toBe(200);
      const hit = res.body.results.find(row => row.kind === 'artifact');
      expect(hit).toEqual({
        kind: 'artifact',
        collection: 'boxes',
        org: orgName,
        name: publicBoxName,
        version: '1.0.0',
        provider: 'virtualbox',
        architecture: 'amd64',
        title: fileName,
        subtitle: `${orgName} · boxes · ${publicBoxName} · 1.0.0 · virtualbox · amd64`,
        matched: 'checksum',
      });
    });

    it('should not match a checksum prefix shorter than 6 characters', async () => {
      const res = await request(app)
        .get('/api/search')
        .query({ q: checksum.slice(0, 5) });
      expect(res.statusCode).toBe(200);
      expect(res.body.results.some(row => row.title === fileName)).toBe(false);
    });

    it('should cap the results per kind and report the overflow', async () => {
      const res = await request(app)
        .get('/api/search')
        .query({ q: 'search-p', limit: 1, kinds: 'item' })
        .set('x-access-token', memberToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.truncated).toEqual({ item: 1 });
    });
  });
});
