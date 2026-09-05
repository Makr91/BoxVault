import request from 'supertest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureBoxPath } from '../app/utils/paths.js';
import { getIsoStorageRoot } from '../app/controllers/iso/helpers.js';
import { generateDownloadToken } from '../app/utils/auth.js';
import { hashServiceAccountToken } from '../app/utils/serviceAccountAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configDir = path.join(__dirname, '../app/config');

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const binaryParser = (response, callback) => {
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

const updateConfig = (configName, mutate) => {
  const configPath = path.join(configDir, `${configName}.test.config.yaml`);
  const original = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(configPath, yaml.dump(config));
  return () => fs.writeFileSync(configPath, original);
};

describe('Box and ISO content validation and visibility', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `ContentOrg-${uniqueId}`;
  const otherOrgName = `ContentOther-${uniqueId}`;
  const privateName = `content-private-${uniqueId}`;
  const boxName = `cbox-${uniqueId}`;
  const artName = `art-dir-${uniqueId}`;
  const isoName = `ciso-${uniqueId}`;
  const privateIsoName = `ciso-private-${uniqueId}`;
  const rawKey = `content-key-${uniqueId}-${'d'.repeat(20)}`;
  let org;
  let otherOrg;
  let owner;
  let member;
  let ownerToken;
  let memberToken;
  let serviceAccount;
  let server;
  let baseUrl;

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
  const isoUrl = (name, suffix = '') => `/api/organization/${orgName}/iso/${name}${suffix}`;
  const isoFileUrl = (name, suffix) =>
    isoUrl(name, `/version/1.0.0/architecture/amd64/file/${suffix}`);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    server = createServer(app);
    await new Promise(resolve => {
      server.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    org = await db.organization.create({ name: orgName });
    otherOrg = await db.organization.create({ name: otherOrgName });
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

    await db.box.create({
      name: artName,
      description: 'artwork is a directory',
      isPublic: true,
      published: true,
      organizationId: org.id,
      userId: owner.id,
      artwork: 'artwork.svg',
      metadata: { providers: [`vbx-zz-${uniqueId}`] },
    });
    fs.mkdirSync(getSecureBoxPath(orgName, artName, 'artwork.svg'), { recursive: true });

    const privateIso = await db.iso.create({
      name: privateIsoName,
      description: 'private iso',
      isPublic: false,
      published: true,
      organizationId: org.id,
      userId: owner.id,
    });
    await db.isoVersions.create({ versionNumber: '1.0.0', isoId: privateIso.id });
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise(resolve => {
      server.close(resolve);
    });
    await serviceAccount.destroy();
    await db.iso.destroy({ where: { organizationId: org.id } });
    await db.box.destroy({ where: { organizationId: org.id } });
    await db.organization.destroy({ where: { id: [org.id, otherOrg.id] } });
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

    it('should reject version, provider and architecture names with consecutive periods', async () => {
      const version = await request(app)
        .post(boxUrl(`/${privateName}/version`))
        .set('x-access-token', ownerToken)
        .send({ versionNumber: 'a..b' });
      expect(version.statusCode).toBe(400);
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

    it('should list the organization boxes for a raw key and hide another organization', async () => {
      const res = await request(app).get(boxUrl()).set('Authorization', `Bearer ${rawKey}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.map(box => box.name)).toContain(privateName);
      const other = await request(app)
        .get(`/api/organization/${otherOrgName}/box`)
        .set('Authorization', `Bearer ${rawKey}`);
      expect(other.statusCode).toBe(200);
      expect(other.body).toEqual([]);
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
        const missing = await request(app)
          .get(`/api/organization/NoOrg-${uniqueId}/box`)
          .set('x-access-token', memberToken);
        expect(missing.statusCode).toBe(404);
      } finally {
        await member.update({ suspended: false });
      }
    });

    it('should answer 500 when the stored artwork cannot be streamed', async () => {
      const res = await request(app).get(boxUrl(`/${artName}/artwork`));
      expect(res.statusCode).toBe(500);
    });

    it('should honour the configured download link expiry', async () => {
      const restore = updateConfig('auth', config => {
        config.auth.jwt.download_link_expiry = { value: '2h' };
      });
      try {
        const res = await request(app)
          .post(
            boxUrl(
              `/${privateName}/version/1.0.0/provider/virtualbox/architecture/amd64/file/get-download-link`
            )
          )
          .set('x-access-token', memberToken);
        expect(res.statusCode).toBe(200);
        const token = new URL(res.body.downloadUrl).searchParams.get('token');
        const claims = jwt.verify(token, 'test-secret', TEST_JWT_CLAIMS);
        expect(claims.exp - claims.iat).toBe(2 * 60 * 60);
      } finally {
        restore();
      }
    });
  });

  describe('search kinds and metadata values', () => {
    it('should search every kind when the filter names none and match list metadata', async () => {
      const all = await request(app)
        .get('/api/search')
        .query({ q: `vbx-zz-${uniqueId}`, kinds: 'bogus' });
      expect(all.statusCode).toBe(200);
      expect(all.body.results).toEqual([
        expect.objectContaining({ name: artName, matched: 'metadata.providers' }),
      ]);
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
        .put(isoUrl(isoName))
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

  describe('ISO files', () => {
    const upload = (content, headers = {}) =>
      request(app)
        .post(isoFileUrl(privateIsoName, 'upload'))
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'application/octet-stream')
        .set(headers)
        .send(content);

    it('should create the storage root, store the file and replace it on a new checksum', async () => {
      fs.rmSync(getIsoStorageRoot(), { recursive: true, force: true });
      const first = await upload(Buffer.from(`first-${uniqueId}`), { 'x-file-name': 'a.iso' });
      expect(first.statusCode).toBe(201);
      const firstPath = path.join(getIsoStorageRoot(), first.body.storagePath);
      expect(fs.existsSync(firstPath)).toBe(true);

      const second = await upload(Buffer.from(`second-${uniqueId}`), { 'x-file-name': 'b.iso' });
      expect(second.statusCode).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.checksum).not.toBe(first.body.checksum);
      expect(fs.existsSync(firstPath)).toBe(false);
      expect(fs.existsSync(path.join(getIsoStorageRoot(), second.body.storagePath))).toBe(true);
    });

    it('should refuse a file over the size cap by length and by stream', async () => {
      const restore = updateConfig('app', config => {
        config.boxvault.box_max_file_size = { value: 0.000001 };
      });
      try {
        const declared = await upload(Buffer.alloc(2048, 1));
        expect(declared.statusCode).toBe(413);

        const body = Readable.from(
          (function* generate() {
            yield Buffer.alloc(1024, 2);
            yield Buffer.alloc(1024, 3);
          })()
        );
        const streamed = await fetch(`${baseUrl}${isoFileUrl(privateIsoName, 'upload')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'x-access-token': ownerToken },
          body,
          duplex: 'half',
        });
        expect(streamed.status).toBe(413);
      } finally {
        restore();
      }
    });

    it('should refuse a download token that names no user for a private ISO', async () => {
      const token = generateDownloadToken({
        organization: orgName,
        iso: privateIsoName,
        versionNumber: '1.0.0',
        architecture: 'amd64',
      });
      const res = await request(app).get(isoFileUrl(privateIsoName, 'download')).query({ token });
      expect(res.statusCode).toBe(403);
    });
  });
});
