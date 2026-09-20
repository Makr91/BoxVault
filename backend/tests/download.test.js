import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureDownloadPath } from '../app/controllers/download/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('Download API', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `DownloadOrg_${uniqueId}`;
  const productName = 'domino-server';
  const productBase = `/api/organization/${orgName}/download/${productName}`;
  let org;
  let owner;
  let member;
  let other;
  let guest;
  let outsider;
  let ownerToken;
  let memberToken;
  let otherToken;
  let guestToken;
  let outsiderToken;

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

  const setProduct = values =>
    db.download.update(values, { where: { name: productName, organizationId: org.id } });

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await createUser('dl-owner', 'owner');
    member = await createUser('dl-member', 'member');
    other = await createUser('dl-other', 'member');
    guest = await createUser('dl-guest', 'guest');
    outsider = await createUser('dl-outsider', null);
    ownerToken = signFor(owner);
    memberToken = signFor(member);
    otherToken = signFor(other);
    guestToken = signFor(guest);
    outsiderToken = signFor(outsider);
  });

  afterAll(async () => {
    await db.download.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({
      where: { id: [owner.id, member.id, other.id, guest.id, outsider.id] },
    });
    fs.rmSync(getSecureDownloadPath(orgName), { recursive: true, force: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/organization/:organization/download', () => {
    it('should let any member create a product, unpublished, private and closed to guests by default', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken)
        .send({
          name: productName,
          description: 'HCL Domino server',
          family: 'HCL Domino',
          vendor: 'HCL',
          docs_url: 'https://help.hcl-software.com/domino',
          icon_url: 'https://www.hcl-software.com/domino.svg',
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe(productName);
      expect(res.body.published).toBe(false);
      expect(res.body.is_public).toBe(false);
      expect(res.body.guest_access).toBe(false);
      expect(res.body.family).toBe('HCL Domino');
      expect(res.body.vendor).toBe('HCL');
      expect(res.body.docs_url).toBe('https://help.hcl-software.com/domino');
      expect(res.body.icon_url).toBe('https://www.hcl-software.com/domino.svg');
      expect(res.body.user_id).toBe(member.id);
      expect(fs.existsSync(getSecureDownloadPath(orgName, productName))).toBe(true);
    });

    it('should reject a product name outside the slug pattern', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken)
        .send({ name: 'bad_name' });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/name', rule: 'pattern', params: { pattern: 'slug' } }),
      ]);
    });

    it('should reject a duplicate product name with 409', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken)
        .send({ name: productName });
      expect(res.statusCode).toBe(409);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/name', rule: 'unique', params: { scope: orgName } }),
      ]);
    });

    it('should refuse the reserved product name pending as taken', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken)
        .send({ name: 'pending' });
      expect(res.statusCode).toBe(409);
      expect(res.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/name',
          rule: 'unique',
          params: { scope: 'reserved' },
        }),
      ]);
      expect(await db.download.count({ where: { name: 'pending', organizationId: org.id } })).toBe(
        0
      );
    });

    it('should reject a docs_url that is not a URI', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken)
        .send({ name: 'bad-docs', docs_url: 'not a uri' });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/docs_url',
          rule: 'format',
          params: { format: 'uri' },
        }),
      ]);
    });

    it('should reject an icon_url that is not a URI', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken)
        .send({ name: 'bad-icon', icon_url: 'not a uri' });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({
          pointer: '/icon_url',
          rule: 'format',
          params: { format: 'uri' },
        }),
      ]);
    });

    it('should refuse a non-member', async () => {
      const res = await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', outsiderToken)
        .send({ name: 'outsider-product' });
      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for an unknown organization', async () => {
      const res = await request(app)
        .post(`/api/organization/NoOrg-${uniqueId}/download`)
        .set('x-access-token', memberToken)
        .send({ name: 'nowhere' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('visibility', () => {
    it('should show an unpublished product to its creator alone', async () => {
      const creator = await request(app)
        .get(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken);
      expect(creator.statusCode).toBe(200);
      expect(creator.body.some(entry => entry.name === productName)).toBe(true);

      const otherMember = await request(app)
        .get(`/api/organization/${orgName}/download`)
        .set('x-access-token', otherToken);
      expect(otherMember.body.some(entry => entry.name === productName)).toBe(false);

      const asOwner = await request(app).get(productBase).set('x-access-token', ownerToken);
      expect(asOwner.statusCode).toBe(403);

      const asOther = await request(app).get(productBase).set('x-access-token', otherToken);
      expect(asOther.statusCode).toBe(403);

      const anonymous = await request(app).get(productBase);
      expect(anonymous.statusCode).toBe(403);

      const asCreator = await request(app).get(productBase).set('x-access-token', memberToken);
      expect(asCreator.statusCode).toBe(200);
      expect(asCreator.body.name).toBe(productName);
      expect(Array.isArray(asCreator.body.releases)).toBe(true);
      expect(asCreator.body.download_count).toBe(0);
      expect(asCreator.body.icon_url).toBe('https://www.hcl-software.com/domino.svg');
      expect(asCreator.body.organization.name).toBe(orgName);
      const listedEntry = creator.body.find(entry => entry.name === productName);
      expect(listedEntry.icon_url).toBe('https://www.hcl-software.com/domino.svg');
      expect(listedEntry.download_count).toBe(0);
    });

    it('should show a published private product to every member and nobody else', async () => {
      await setProduct({ published: true, isPublic: false });

      const asOther = await request(app).get(productBase).set('x-access-token', otherToken);
      expect(asOther.statusCode).toBe(200);

      const asOwner = await request(app).get(productBase).set('x-access-token', ownerToken);
      expect(asOwner.statusCode).toBe(200);

      const listed = await request(app)
        .get(`/api/organization/${orgName}/download`)
        .set('x-access-token', otherToken);
      expect(listed.body.some(entry => entry.name === productName)).toBe(true);

      const asOutsider = await request(app).get(productBase).set('x-access-token', outsiderToken);
      expect(asOutsider.statusCode).toBe(403);

      const anonymous = await request(app).get(productBase);
      expect(anonymous.statusCode).toBe(403);

      const anonymousList = await request(app).get(`/api/organization/${orgName}/download`);
      expect(anonymousList.statusCode).toBe(200);
      expect(anonymousList.body.some(entry => entry.name === productName)).toBe(false);
    });

    it('should show a public published product to anyone', async () => {
      await setProduct({ published: true, isPublic: true });

      const anonymous = await request(app).get(productBase);
      expect(anonymous.statusCode).toBe(200);
      expect(anonymous.body.download_count).toBeNull();

      const anonymousList = await request(app).get(`/api/organization/${orgName}/download`);
      expect(anonymousList.body.some(entry => entry.name === productName)).toBe(true);
      expect(
        anonymousList.body.find(entry => entry.name === productName).download_count
      ).toBeNull();

      const asOutsider = await request(app).get(productBase).set('x-access-token', outsiderToken);
      expect(asOutsider.statusCode).toBe(200);
      expect(asOutsider.body.download_count).toBeNull();

      const asMember = await request(app).get(productBase).set('x-access-token', otherToken);
      expect(asMember.body.download_count).toBe(0);

      const discovered = await request(app).get('/api/downloads/discover');
      expect(discovered.statusCode).toBe(200);
      expect(discovered.body.some(entry => entry.name === productName)).toBe(true);
      discovered.body.forEach(entry => expect(Array.isArray(entry.releases)).toBe(true));
      expect(discovered.body.find(entry => entry.name === productName).download_count).toBeNull();

      const discoveredAsMember = await request(app)
        .get('/api/downloads/discover')
        .set('x-access-token', otherToken);
      expect(discoveredAsMember.body.find(entry => entry.name === productName).download_count).toBe(
        0
      );
    });

    it('should hide a public unpublished product from everyone but its creator', async () => {
      await setProduct({ published: false, isPublic: true });

      const anonymous = await request(app).get(`/api/organization/${orgName}/download`);
      expect(anonymous.body.some(entry => entry.name === productName)).toBe(false);

      const discovered = await request(app)
        .get('/api/downloads/discover')
        .set('x-access-token', otherToken);
      expect(discovered.body.some(entry => entry.name === productName)).toBe(false);

      const asCreator = await request(app)
        .get('/api/downloads/discover')
        .set('x-access-token', memberToken);
      expect(asCreator.body.some(entry => entry.name === productName)).toBe(true);

      await setProduct({ published: true, isPublic: false });
    });

    it('should return 404 for an unknown organization or product', async () => {
      const noOrg = await request(app).get(`/api/organization/NoOrg-${uniqueId}/download`);
      expect(noOrg.statusCode).toBe(404);
      const noProduct = await request(app)
        .get(`/api/organization/${orgName}/download/no-such-product`)
        .set('x-access-token', memberToken);
      expect(noProduct.statusCode).toBe(404);
    });

    it('should handle DB errors in findAll, findOne and discover', async () => {
      jest.spyOn(db.download, 'findAll').mockRejectedValue(new Error('DB Error'));
      const list = await request(app)
        .get(`/api/organization/${orgName}/download`)
        .set('x-access-token', memberToken);
      expect(list.statusCode).toBe(500);
      const discovered = await request(app).get('/api/downloads/discover');
      expect(discovered.statusCode).toBe(500);
      expect(discovered.body.type).toBe('https://auth.startcloud.com/probs/internal');
      jest.restoreAllMocks();
      jest.spyOn(db.download, 'findOne').mockRejectedValue(new Error('DB Error'));
      const one = await request(app).get(productBase).set('x-access-token', memberToken);
      expect(one.statusCode).toBe(500);
    });
  });

  describe('guest membership', () => {
    it('should read the published private product flagged for guests without counts', async () => {
      await setProduct({ guestAccess: true });

      const listed = await request(app)
        .get(`/api/organization/${orgName}/download`)
        .set('x-access-token', guestToken);
      expect(listed.statusCode).toBe(200);
      const entry = listed.body.find(candidate => candidate.name === productName);
      expect(entry).toBeDefined();
      expect(entry.guest_access).toBe(true);
      expect(entry.download_count).toBeNull();

      const one = await request(app).get(productBase).set('x-access-token', guestToken);
      expect(one.statusCode).toBe(200);
      expect(one.body.download_count).toBeNull();

      const discovered = await request(app)
        .get('/api/downloads/discover')
        .set('x-access-token', guestToken);
      expect(discovered.statusCode).toBe(200);
      expect(discovered.body.find(candidate => candidate.name === productName).download_count).toBe(
        null
      );

      const asMember = await request(app).get(productBase).set('x-access-token', otherToken);
      expect(asMember.body.download_count).toBe(0);
    });

    it('should be hidden while the flag is off and shown again by allow_guests', async () => {
      await setProduct({ guestAccess: false });

      const listed = await request(app)
        .get(`/api/organization/${orgName}/download`)
        .set('x-access-token', guestToken);
      expect(listed.statusCode).toBe(200);
      expect(listed.body.some(candidate => candidate.name === productName)).toBe(false);
      const one = await request(app).get(productBase).set('x-access-token', guestToken);
      expect(one.statusCode).toBe(403);
      const releases = await request(app)
        .get(`${productBase}/release`)
        .set('x-access-token', guestToken);
      expect(releases.statusCode).toBe(403);
      const watched = await request(app)
        .post(`${productBase}/watch`)
        .set('x-access-token', guestToken);
      expect(watched.statusCode).toBe(403);
      const discovered = await request(app)
        .get('/api/downloads/discover')
        .set('x-access-token', guestToken);
      expect(discovered.body.some(candidate => candidate.name === productName)).toBe(false);

      const allowed = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', ownerToken)
        .send({ action: 'allow_guests', names: [productName] });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      const again = await request(app).get(productBase).set('x-access-token', guestToken);
      expect(again.statusCode).toBe(200);
      expect(again.body.guest_access).toBe(true);

      const denied = await request(app)
        .put(productBase)
        .set('x-access-token', memberToken)
        .send({ guest_access: false });
      expect(denied.statusCode).toBe(200);
      expect(denied.body.guest_access).toBe(false);
      const gone = await request(app).get(productBase).set('x-access-token', guestToken);
      expect(gone.statusCode).toBe(403);

      await setProduct({ guestAccess: true });
    });

    it('should show a guest the unpublished product it uploaded itself', async () => {
      const own = await db.download.create({
        name: 'guest-own',
        published: false,
        isPublic: false,
        userId: guest.id,
        organizationId: org.id,
      });
      const listed = await request(app)
        .get(`/api/organization/${orgName}/download`)
        .set('x-access-token', guestToken);
      expect(listed.body.some(candidate => candidate.name === 'guest-own')).toBe(true);
      const one = await request(app)
        .get(`/api/organization/${orgName}/download/guest-own`)
        .set('x-access-token', guestToken);
      expect(one.statusCode).toBe(200);
      expect(one.body.download_count).toBeNull();
      const asOther = await request(app)
        .get(`/api/organization/${orgName}/download/guest-own`)
        .set('x-access-token', otherToken);
      expect(asOther.statusCode).toBe(403);
      await own.destroy();
    });

    it('should be refused every product write', async () => {
      const created = await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', guestToken)
        .send({ name: 'guest-product' });
      expect(created.statusCode).toBe(403);
      expect(created.body.type).toBe('https://auth.startcloud.com/probs/forbidden');
      expect(created.body.title).toBe(
        'A guest of this organization may read and download, never change anything!'
      );

      const updated = await request(app)
        .put(productBase)
        .set('x-access-token', guestToken)
        .send({ description: 'hijack' });
      expect(updated.statusCode).toBe(403);

      const deleted = await request(app).delete(productBase).set('x-access-token', guestToken);
      expect(deleted.statusCode).toBe(403);

      const bulk = await request(app)
        .post(`/api/organization/${orgName}/download/bulk`)
        .set('x-access-token', guestToken)
        .send({ action: 'unpublish', names: [productName] });
      expect(bulk.statusCode).toBe(403);

      const release = await request(app)
        .post(`${productBase}/release`)
        .set('x-access-token', guestToken)
        .send({ version_number: '1.0.0' });
      expect(release.statusCode).toBe(403);

      const dropped = await request(app)
        .post(`${productBase}/file/upload`)
        .set('x-access-token', guestToken)
        .set('Content-Type', 'application/octet-stream')
        .set('x-file-name', 'Domino_1.0.0_Linux.tar')
        .send(Buffer.from('guest bytes'));
      expect(dropped.statusCode).toBe(403);

      expect(
        await db.download.count({ where: { name: 'guest-product', organizationId: org.id } })
      ).toBe(0);
    });

    it('should watch and unwatch the product', async () => {
      const watched = await request(app)
        .post(`${productBase}/watch`)
        .set('x-access-token', guestToken);
      expect(watched.statusCode).toBe(201);
      const unwatched = await request(app)
        .delete(`${productBase}/watch`)
        .set('x-access-token', guestToken);
      expect(unwatched.statusCode).toBe(200);
    });
  });

  describe('PUT /api/organization/:organization/download/:name', () => {
    it('should refuse a member who neither owns the product nor administers the organization', async () => {
      const res = await request(app)
        .put(productBase)
        .set('x-access-token', otherToken)
        .send({ description: 'hijack' });
      expect(res.statusCode).toBe(403);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/forbidden');
    });

    it('should let the owner update the record and an organization owner publish it', async () => {
      const res = await request(app).put(productBase).set('x-access-token', memberToken).send({
        description: 'Updated',
        vendor: 'HCL Software',
        notes_url: 'https://x.example',
        icon_url: 'https://x.example/icon.png',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.description).toBe('Updated');
      expect(res.body.vendor).toBe('HCL Software');
      expect(res.body.notes_url).toBe('https://x.example');
      expect(res.body.icon_url).toBe('https://x.example/icon.png');

      await setProduct({ published: false });
      const published = await request(app)
        .put(productBase)
        .set('x-access-token', ownerToken)
        .send({ published: true });
      expect(published.statusCode).toBe(200);
      expect(published.body.published).toBe(true);
    });

    it('should clear a link sent as an empty string, the edit form with blank fields', async () => {
      await setProduct({
        docsUrl: 'https://x.example/docs',
        notesUrl: 'https://x.example/notes',
        iconUrl: 'https://x.example/icon.png',
      });
      const res = await request(app).put(productBase).set('x-access-token', memberToken).send({
        name: productName,
        description: '',
        is_public: false,
        guest_access: false,
        family: '',
        vendor: '',
        icon_url: '',
        docs_url: '',
        notes_url: null,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.icon_url).toBeNull();
      expect(res.body.docs_url).toBeNull();
      expect(res.body.notes_url).toBeNull();
      expect(res.body.description).toBe('');
    });

    it('should rename the product and move its directory', async () => {
      await request(app)
        .post(`/api/organization/${orgName}/download`)
        .set('x-access-token', ownerToken)
        .send({ name: 'rename-me' })
        .expect(201);

      const res = await request(app)
        .put(`/api/organization/${orgName}/download/rename-me`)
        .set('x-access-token', ownerToken)
        .send({ name: 'renamed-product', is_public: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('renamed-product');
      expect(res.body.is_public).toBe(true);
      expect(fs.existsSync(getSecureDownloadPath(orgName, 'renamed-product'))).toBe(true);
      expect(fs.existsSync(getSecureDownloadPath(orgName, 'rename-me'))).toBe(false);

      const conflict = await request(app)
        .put(`/api/organization/${orgName}/download/renamed-product`)
        .set('x-access-token', ownerToken)
        .send({ name: productName });
      expect(conflict.statusCode).toBe(409);

      await db.download.destroy({ where: { name: 'renamed-product', organizationId: org.id } });
    });

    it('should update with an empty body and answer 404 for an unknown product', async () => {
      const res = await request(app).put(productBase).set('x-access-token', memberToken).send();
      expect(res.statusCode).toBe(200);
      const missing = await request(app)
        .put(`/api/organization/${orgName}/download/no-such-product`)
        .set('x-access-token', memberToken)
        .send({ description: 'x' });
      expect(missing.statusCode).toBe(404);
    });

    it('should handle a DB error during update', async () => {
      jest.spyOn(db.download, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .put(productBase)
        .set('x-access-token', memberToken)
        .send({ description: 'x' });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('DELETE /api/organization/:organization/download/:name', () => {
    it('should refuse a member who does not own the product', async () => {
      const res = await request(app).delete(productBase).set('x-access-token', otherToken);
      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for an unknown product', async () => {
      const res = await request(app)
        .delete(`/api/organization/${orgName}/download/no-such-product`)
        .set('x-access-token', memberToken);
      expect(res.statusCode).toBe(404);
    });

    it('should handle a DB error during delete', async () => {
      jest.spyOn(db.download, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app).delete(productBase).set('x-access-token', memberToken);
      expect(res.statusCode).toBe(500);
    });

    it('should let the owner delete the product with its directory', async () => {
      const res = await request(app).delete(productBase).set('x-access-token', memberToken);
      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(getSecureDownloadPath(orgName, productName))).toBe(false);
      expect(
        await db.download.count({ where: { name: productName, organizationId: org.id } })
      ).toBe(0);
    });
  });

  describe('DELETE /api/organization/:organization/download', () => {
    it('should no longer exist, the bulk route taking its place', async () => {
      await db.download.create({ name: 'remove-a', organizationId: org.id, userId: owner.id });

      const res = await request(app)
        .delete(`/api/organization/${orgName}/download`)
        .set('x-access-token', ownerToken);
      expect(res.statusCode).toBe(404);
      expect(await db.download.count({ where: { organizationId: org.id } })).toBe(1);
    });
  });
});
