import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { Readable } from 'stream';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureBoxPath } from '../app/utils/paths.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const binaryParser = (response, callback) => {
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Box watches, badges and artwork', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `WatchOrg-${uniqueId}`;
  const publicBoxName = `watch-public-${uniqueId}`;
  const privateBoxName = `watch-private-${uniqueId}`;
  let org;
  let owner;
  let member;
  let outsider;
  let ownerToken;
  let memberToken;
  let outsiderToken;
  let publicBox;
  let privateBox;
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
    if (orgRole) {
      await db.UserOrg.create({ user_id: account.id, organization_id: org.id, role: orgRole });
    }
    return account;
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    server = createServer(app);
    await new Promise(resolve => {
      server.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await createUser('watch-owner', 'owner');
    member = await createUser('watch-member', 'member');
    outsider = await createUser('watch-outsider', null);
    ownerToken = signFor(owner);
    memberToken = signFor(member);
    outsiderToken = signFor(outsider);

    publicBox = await db.box.create({
      name: publicBoxName,
      description: 'Public box',
      shortDescription: 'Short and public',
      isPublic: true,
      published: true,
      organizationId: org.id,
      userId: owner.id,
    });
    privateBox = await db.box.create({
      name: privateBoxName,
      description: 'Private box',
      isPublic: false,
      published: true,
      organizationId: org.id,
      userId: outsider.id,
    });
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise(resolve => {
      server.close(resolve);
    });
    await db.box.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await owner.destroy();
    await member.destroy();
    await outsider.destroy();
    fs.rmSync(getSecureBoxPath(orgName), { recursive: true, force: true });
  });

  describe('watching boxes', () => {
    it('should create a watch, keep it idempotent and list it', async () => {
      const created = await request(app)
        .post(`/api/organization/${orgName}/box/${publicBoxName}/watch`)
        .set('x-access-token', memberToken);
      expect(created.statusCode).toBe(201);
      expect(created.body).toEqual({ watched: true });

      const again = await request(app)
        .post(`/api/organization/${orgName}/box/${publicBoxName}/watch`)
        .set('x-access-token', memberToken);
      expect(again.statusCode).toBe(200);

      const listed = await request(app).get('/api/user/watches').set('x-access-token', memberToken);
      expect(listed.statusCode).toBe(200);
      expect(listed.body).toEqual([
        {
          boxId: publicBox.id,
          name: publicBoxName,
          shortDescription: 'Short and public',
          organization: orgName,
          logo: null,
        },
      ]);
    });

    it('should remove a watch', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/box/${publicBoxName}/watch`)
        .set('x-access-token', memberToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ watched: false });

      const listed = await request(app).get('/api/user/watches').set('x-access-token', memberToken);
      expect(listed.body).toEqual([]);
    });

    it('should answer 404 for an unknown organization or box', async () => {
      const noOrg = await request(app)
        .post(`/api/organization/NoSuchOrg-${uniqueId}/box/${publicBoxName}/watch`)
        .set('x-access-token', memberToken);
      expect(noOrg.statusCode).toBe(404);
      const noBox = await request(app)
        .post(`/api/organization/${orgName}/box/no-such-box/watch`)
        .set('x-access-token', memberToken);
      expect(noBox.statusCode).toBe(404);
      const unwatchNoOrg = await request(app)
        .delete(`/api/organization/NoSuchOrg-${uniqueId}/box/${publicBoxName}/watch`)
        .set('x-access-token', memberToken);
      expect(unwatchNoOrg.statusCode).toBe(404);
      const unwatchNoBox = await request(app)
        .delete(`/api/organization/${orgName}/box/no-such-box/watch`)
        .set('x-access-token', memberToken);
      expect(unwatchNoBox.statusCode).toBe(404);
    });

    it('should let a member and the creator watch a private box but not a stranger', async () => {
      const asMember = await request(app)
        .post(`/api/organization/${orgName}/box/${privateBoxName}/watch`)
        .set('x-access-token', memberToken);
      expect(asMember.statusCode).toBe(201);

      const asCreator = await request(app)
        .post(`/api/organization/${orgName}/box/${privateBoxName}/watch`)
        .set('x-access-token', outsiderToken);
      expect(asCreator.statusCode).toBe(201);

      const stranger = await createUser('watch-stranger', null);
      const asStranger = await request(app)
        .post(`/api/organization/${orgName}/box/${privateBoxName}/watch`)
        .set('x-access-token', signFor(stranger));
      expect(asStranger.statusCode).toBe(403);
      await stranger.destroy();

      await db.boxWatcher.destroy({ where: { box_id: privateBox.id } });
    });
  });

  describe('GET /badge/:organization/:name.svg', () => {
    it('should answer 404 for an unknown organization, a private box or a box without versions', async () => {
      const noOrg = await request(app).get(`/badge/NoSuchOrg-${uniqueId}/${publicBoxName}.svg`);
      expect(noOrg.statusCode).toBe(404);
      expect(noOrg.text).toBe('Not Found');
      const privateRes = await request(app).get(`/badge/${orgName}/${privateBoxName}.svg`);
      expect(privateRes.statusCode).toBe(404);
      const noVersion = await request(app).get(`/badge/${orgName}/${publicBoxName}.svg`);
      expect(noVersion.statusCode).toBe(404);
    });

    it('should render the latest version and the deprecated state', async () => {
      const version = await db.versions.create({ versionNumber: '2.0.0', boxId: publicBox.id });
      const res = await request(app)
        .get(`/api/badge/${orgName}/${publicBoxName}.svg`)
        .buffer(true)
        .parse(binaryParser);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('image/svg+xml');
      expect(res.headers['cache-control']).toBe('max-age=300');
      expect(res.body.toString()).toContain('boxvault: 2.0.0');

      await version.update({ deprecated: true, deprecationReason: 'old' });
      const deprecated = await request(app)
        .get(`/badge/${orgName}/${publicBoxName}.svg`)
        .buffer(true)
        .parse(binaryParser);
      expect(deprecated.statusCode).toBe(200);
      expect(deprecated.body.toString()).toContain('deprecated');
      expect(deprecated.body.toString()).toContain('#c0392b');
      await version.destroy();
    });
  });

  describe('box artwork', () => {
    const artworkUrl = `/api/organization/${orgName}/box/${publicBoxName}/artwork`;

    it('should refuse an unsupported content type', async () => {
      const res = await request(app)
        .post(artworkUrl)
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'text/plain')
        .send('nope');
      expect(res.statusCode).toBe(415);
    });

    it('should refuse an artwork larger than the size cap by content length', async () => {
      const res = await request(app)
        .post(artworkUrl)
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'image/png')
        .set('Content-Length', String(6 * 1024 * 1024))
        .send(Buffer.alloc(16));
      expect(res.statusCode).toBe(413);
    });

    it('should refuse a chunked body that grows past the size cap', async () => {
      const chunk = Buffer.alloc(1024 * 1024, 1);
      const body = Readable.from(
        (function* generate() {
          for (let index = 0; index < 6; index += 1) {
            yield chunk;
          }
        })()
      );
      const response = await fetch(`${baseUrl}${artworkUrl}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', 'x-access-token': ownerToken },
        body,
        duplex: 'half',
      });
      expect(response.status).toBe(413);
    });

    it('should answer 404 for a box the organization does not have', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/box/no-such-box/artwork`)
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('png'));
      expect(res.statusCode).toBe(404);
    });

    it('should refuse a member who neither owns the box nor administers the organization', async () => {
      const res = await request(app)
        .post(artworkUrl)
        .set('x-access-token', memberToken)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('png'));
      expect(res.statusCode).toBe(403);
    });

    it('should store the artwork, replace it on a type change and serve it', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
      const uploaded = await request(app)
        .post(artworkUrl)
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'image/svg+xml; charset=utf-8')
        .send(svg);
      expect(uploaded.statusCode).toBe(200);
      expect(uploaded.body.artwork).toBe('artwork.svg');
      const svgPath = getSecureBoxPath(orgName, publicBoxName, 'artwork.svg');
      expect(fs.readFileSync(svgPath)).toEqual(svg);

      const served = await request(app).get(artworkUrl).buffer(true).parse(binaryParser);
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toContain('image/svg+xml');
      expect(Buffer.compare(served.body, svg)).toBe(0);

      const png = Buffer.from('not really a png');
      const replaced = await request(app)
        .post(artworkUrl)
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'image/png')
        .send(png);
      expect(replaced.statusCode).toBe(200);
      expect(replaced.body.artwork).toBe('artwork.png');
      await new Promise(resolve => {
        setTimeout(resolve, 50);
      });
      expect(fs.existsSync(svgPath)).toBe(false);
      expect(fs.readFileSync(getSecureBoxPath(orgName, publicBoxName, 'artwork.png'))).toEqual(png);
    });

    it('should answer 404 when the box has no artwork or the file is gone', async () => {
      const none = await request(app).get(
        `/api/organization/${orgName}/box/${privateBoxName}/artwork`
      );
      expect(none.statusCode).toBe(403);

      const stored = await db.box.findByPk(publicBox.id);
      await stored.update({ artwork: 'artwork.jpg' });
      const missing = await request(app).get(artworkUrl);
      expect(missing.statusCode).toBe(404);
      await stored.update({ artwork: null });
      const cleared = await request(app).get(artworkUrl);
      expect(cleared.statusCode).toBe(404);
      await stored.update({ artwork: 'artwork.png' });
    });

    it('should answer 404 for an unknown organization or box', async () => {
      const noOrg = await request(app).get(
        `/api/organization/NoSuchOrg-${uniqueId}/box/${publicBoxName}/artwork`
      );
      expect(noOrg.statusCode).toBe(404);
      const noBox = await request(app).get(`/api/organization/${orgName}/box/no-such-box/artwork`);
      expect(noBox.statusCode).toBe(404);
    });

    it('should gate private artwork on membership or ownership', async () => {
      const privateUrl = `/api/organization/${orgName}/box/${privateBoxName}/artwork`;
      const stored = await db.box.findByPk(privateBox.id);
      const png = Buffer.from('private png');
      const dir = getSecureBoxPath(orgName, privateBoxName);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'artwork.png'), png);
      await stored.update({ artwork: 'artwork.png' });

      const anonymous = await request(app).get(privateUrl);
      expect(anonymous.statusCode).toBe(403);
      const invalid = await request(app).get(privateUrl).set('x-access-token', 'not.a.token');
      expect(invalid.statusCode).toBe(403);

      const stranger = await createUser('artwork-stranger', null);
      const asStranger = await request(app)
        .get(privateUrl)
        .set('x-access-token', signFor(stranger));
      expect(asStranger.statusCode).toBe(403);
      await stranger.destroy();

      const asMember = await request(app)
        .get(privateUrl)
        .set('x-access-token', memberToken)
        .buffer(true)
        .parse(binaryParser);
      expect(asMember.statusCode).toBe(200);
      expect(asMember.headers['content-type']).toContain('image/png');

      const asCreator = await request(app)
        .get(privateUrl)
        .set('x-access-token', outsiderToken)
        .buffer(true)
        .parse(binaryParser);
      expect(asCreator.statusCode).toBe(200);
      expect(Buffer.compare(asCreator.body, png)).toBe(0);
    });
  });
});
