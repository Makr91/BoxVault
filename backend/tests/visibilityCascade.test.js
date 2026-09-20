import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const OPEN = { isPublic: true, guestAccess: true, published: true };

describe('Visibility cascade down the trees', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `CascadeOrg_${uniqueId}`;
  let org;
  let owner;
  let ownerToken;

  const words = row => ({
    isPublic: row.isPublic,
    guestAccess: row.guestAccess,
    published: row.published,
  });

  const post = (url, body) => request(app).post(url).set('x-access-token', ownerToken).send(body);
  const put = (url, body) => request(app).put(url).set('x-access-token', ownerToken).send(body);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await db.user.create({
      username: `cascade-owner-${uniqueId}`,
      email: `cascade-owner-${uniqueId}@example.com`,
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
    await db.iso.destroy({ where: { organizationId: org.id } });
    await db.box.destroy({ where: { organizationId: org.id } });
    await db.UserOrg.destroy({ where: { organization_id: org.id } });
    await org.destroy();
    await owner.destroy();
  });

  describe('boxes', () => {
    const boxName = `cb-${uniqueId}`;
    const boxUrl = `/api/organization/${orgName}/box/${boxName}`;
    let tree;

    const rows = async () => ({
      version: await db.versions.findByPk(tree.version.id),
      provider: await db.providers.findByPk(tree.provider.id),
      architecture: await db.architectures.findByPk(tree.architecture.id),
      file: await db.files.findByPk(tree.file.id),
    });

    const setAll = async values => {
      await tree.box.update(values);
      await tree.version.update(values);
      await tree.provider.update(values);
      await tree.architecture.update(values);
      await tree.file.update(values);
    };

    beforeAll(async () => {
      const box = await db.box.create({
        name: boxName,
        description: 'cascade',
        organizationId: org.id,
        userId: owner.id,
        ...OPEN,
      });
      const version = await db.versions.create({ versionNumber: '1.0.0', boxId: box.id, ...OPEN });
      const provider = await db.providers.create({
        name: 'virtualbox',
        versionId: version.id,
        ...OPEN,
      });
      const architecture = await db.architectures.create({
        name: 'amd64',
        providerId: provider.id,
        ...OPEN,
      });
      const file = await db.files.create({
        fileName: 'vagrant.box',
        fileSize: 10,
        architectureId: architecture.id,
        ...OPEN,
      });
      tree = { box, version, provider, architecture, file };
    });

    it('should close every row beneath on a closing update of the box', async () => {
      const res = await put(boxUrl, { is_public: false, guest_access: false });
      expect(res.statusCode).toBe(200);
      const beneath = await rows();
      Object.values(beneath).forEach(row => {
        expect(words(row)).toEqual({ isPublic: false, guestAccess: false, published: true });
      });
    });

    it('should leave the rows beneath as they are on a plain opening update', async () => {
      const res = await put(boxUrl, { is_public: true, guest_access: true });
      expect(res.statusCode).toBe(200);
      const beneath = await rows();
      Object.values(beneath).forEach(row => {
        expect(words(row)).toEqual({ isPublic: false, guestAccess: false, published: true });
      });
    });

    it('should lift every row beneath on a recursive opening update', async () => {
      const res = await put(boxUrl, { is_public: true, guest_access: true, recursive: true });
      expect(res.statusCode).toBe(200);
      const beneath = await rows();
      Object.values(beneath).forEach(row => expect(words(row)).toEqual(OPEN));
    });

    it('should cascade the bulk verbs from every level', async () => {
      const unpublished = await post(`/api/organization/${orgName}/box/bulk`, {
        action: 'unpublish',
        names: [boxName],
      });
      expect(unpublished.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      let beneath = await rows();
      Object.values(beneath).forEach(row => expect(row.published).toBe(false));

      const plain = await post(`/api/organization/${orgName}/box/bulk`, {
        action: 'publish',
        names: [boxName],
      });
      expect(plain.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      beneath = await rows();
      Object.values(beneath).forEach(row => expect(row.published).toBe(false));

      const recursive = await post(`/api/organization/${orgName}/box/bulk`, {
        action: 'publish',
        names: [boxName],
        recursive: true,
      });
      expect(recursive.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      beneath = await rows();
      Object.values(beneath).forEach(row => expect(row.published).toBe(true));

      const version = await post(`${boxUrl}/version/bulk`, {
        action: 'make_private',
        names: ['1.0.0'],
      });
      expect(version.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      beneath = await rows();
      expect(beneath.version.isPublic).toBe(false);
      expect(beneath.provider.isPublic).toBe(false);
      expect(beneath.architecture.isPublic).toBe(false);
      expect(beneath.file.isPublic).toBe(false);
      expect((await db.box.findByPk(tree.box.id)).isPublic).toBe(true);

      const lifted = await post(`${boxUrl}/version/bulk`, {
        action: 'make_public',
        names: ['1.0.0'],
        recursive: true,
      });
      expect(lifted.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      beneath = await rows();
      Object.values(beneath).forEach(row => expect(row.isPublic).toBe(true));

      const provider = await post(`${boxUrl}/version/1.0.0/provider/bulk`, {
        action: 'deny_guests',
        names: ['virtualbox'],
      });
      expect(provider.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      beneath = await rows();
      expect(beneath.version.guestAccess).toBe(true);
      expect(beneath.provider.guestAccess).toBe(false);
      expect(beneath.architecture.guestAccess).toBe(false);
      expect(beneath.file.guestAccess).toBe(false);

      const architecture = await post(
        `${boxUrl}/version/1.0.0/provider/virtualbox/architecture/bulk`,
        { action: 'allow_guests', names: ['amd64'], recursive: true }
      );
      expect(architecture.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      beneath = await rows();
      expect(beneath.architecture.guestAccess).toBe(true);
      expect(beneath.file.guestAccess).toBe(true);
      await setAll(OPEN);
    });

    it('should cascade the single updates of version, provider and architecture', async () => {
      const providerUrl = `${boxUrl}/version/1.0.0/provider/virtualbox`;
      const version = await put(`${boxUrl}/version/1.0.0`, { guest_access: false });
      expect(version.statusCode).toBe(200);
      let beneath = await rows();
      expect(beneath.provider.guestAccess).toBe(false);
      expect(beneath.file.guestAccess).toBe(false);

      const lifted = await put(`${boxUrl}/version/1.0.0`, {
        guest_access: true,
        recursive: true,
      });
      expect(lifted.statusCode).toBe(200);
      beneath = await rows();
      expect(beneath.provider.guestAccess).toBe(true);
      expect(beneath.file.guestAccess).toBe(true);

      const provider = await put(providerUrl, { published: false });
      expect(provider.statusCode).toBe(200);
      beneath = await rows();
      expect(beneath.architecture.published).toBe(false);
      expect(beneath.file.published).toBe(false);

      const architecture = await put(`${providerUrl}/architecture/amd64`, {
        published: true,
        recursive: true,
      });
      expect(architecture.statusCode).toBe(422);
      expect(architecture.body.errors).toEqual([
        expect.objectContaining({ pointer: '/published', rule: 'withinParent' }),
      ]);

      const republished = await put(providerUrl, { published: true, recursive: true });
      expect(republished.statusCode).toBe(200);
      beneath = await rows();
      expect(beneath.architecture.published).toBe(true);
      expect(beneath.file.published).toBe(true);

      const closedFile = await put(`${providerUrl}/architecture/amd64`, { is_public: false });
      expect(closedFile.statusCode).toBe(200);
      beneath = await rows();
      expect(beneath.file.isPublic).toBe(false);
      expect(beneath.provider.isPublic).toBe(true);
      await setAll(OPEN);
    });

    it('should refuse a recursive word that is not a boolean', async () => {
      const res = await put(boxUrl, { is_public: true, recursive: 'yes' });
      expect(res.statusCode).toBe(422);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/recursive', rule: 'type' }),
      ]);
      const bulk = await post(`/api/organization/${orgName}/box/bulk`, {
        action: 'publish',
        names: [boxName],
        recursive: 1,
      });
      expect(bulk.statusCode).toBe(422);
      expect(bulk.body.errors).toEqual([
        expect.objectContaining({ pointer: '/recursive', rule: 'type' }),
      ]);
    });
  });

  describe('ISOs', () => {
    const isoName = `ci-${uniqueId}`;
    const isoUrl = `/api/organization/${orgName}/iso/${isoName}`;
    let iso;
    let version;
    let file;

    beforeAll(async () => {
      iso = await db.iso.create({
        name: isoName,
        description: 'cascade',
        organizationId: org.id,
        userId: owner.id,
        ...OPEN,
      });
      version = await db.isoVersions.create({ versionNumber: '1.0.0', isoId: iso.id, ...OPEN });
      file = await db.isoFiles.create({
        architecture: 'amd64',
        fileName: 'image.iso',
        fileSize: 10,
        storagePath: `iso/cascade-${uniqueId}.iso`,
        isoVersionId: version.id,
        ...OPEN,
      });
    });

    it('should close and lift the version and file from the ISO', async () => {
      const closed = await put(isoUrl, { is_public: false });
      expect(closed.statusCode).toBe(200);
      expect((await db.isoVersions.findByPk(version.id)).isPublic).toBe(false);
      expect((await db.isoFiles.findByPk(file.id)).isPublic).toBe(false);

      const plain = await put(isoUrl, { is_public: true });
      expect(plain.statusCode).toBe(200);
      expect((await db.isoVersions.findByPk(version.id)).isPublic).toBe(false);

      const lifted = await post(`/api/organization/${orgName}/iso/bulk`, {
        action: 'make_public',
        names: [isoName],
        recursive: true,
      });
      expect(lifted.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await db.isoVersions.findByPk(version.id)).isPublic).toBe(true);
      expect((await db.isoFiles.findByPk(file.id)).isPublic).toBe(true);
    });

    it('should close and lift the file from the version', async () => {
      const closed = await post(`${isoUrl}/version/bulk`, {
        action: 'deny_guests',
        names: ['1.0.0'],
      });
      expect(closed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      expect((await db.isoFiles.findByPk(file.id)).guestAccess).toBe(false);

      const lifted = await put(`${isoUrl}/version/1.0.0`, { guest_access: true, recursive: true });
      expect(lifted.statusCode).toBe(200);
      expect((await db.isoFiles.findByPk(file.id)).guestAccess).toBe(true);
      expect((await db.iso.findByPk(iso.id)).guestAccess).toBe(true);
    });
  });

  describe('downloads', () => {
    const productName = `cd-${uniqueId}`;
    const productUrl = `/api/organization/${orgName}/download/${productName}`;
    let release;
    let patch;
    let file;

    const beneath = async () => ({
      release: await db.downloadReleases.findByPk(release.id),
      patch: await db.downloadPatches.findByPk(patch.id),
      file: await db.downloadFiles.findByPk(file.id),
    });

    beforeAll(async () => {
      const product = await db.download.create({
        name: productName,
        description: 'cascade',
        organizationId: org.id,
        userId: owner.id,
        ...OPEN,
      });
      release = await db.downloadReleases.create({
        versionNumber: '1.0.0',
        downloadId: product.id,
        ...OPEN,
      });
      patch = await db.downloadPatches.create({
        name: 'release',
        kind: 'release',
        downloadReleaseId: release.id,
        ...OPEN,
      });
      file = await db.downloadFiles.create({
        key: 'linux-x64',
        fileName: 'installer.tar',
        fileSize: 10,
        downloadPatchId: patch.id,
        ...OPEN,
      });
    });

    it('should close the whole tree from the product and reopen it only when asked', async () => {
      const closed = await post(`/api/organization/${orgName}/download/bulk`, {
        action: 'make_private',
        names: [productName],
      });
      expect(closed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      let rows = await beneath();
      Object.values(rows).forEach(row => expect(row.isPublic).toBe(false));

      const plain = await put(productUrl, { is_public: true });
      expect(plain.statusCode).toBe(200);
      rows = await beneath();
      Object.values(rows).forEach(row => expect(row.isPublic).toBe(false));

      const lifted = await put(productUrl, { is_public: true, recursive: true });
      expect(lifted.statusCode).toBe(200);
      rows = await beneath();
      Object.values(rows).forEach(row => expect(row.isPublic).toBe(true));

      const unpublished = await put(productUrl, { published: false, guest_access: false });
      expect(unpublished.statusCode).toBe(200);
      rows = await beneath();
      Object.values(rows).forEach(row => {
        expect(row.published).toBe(false);
        expect(row.guestAccess).toBe(false);
      });
      const republished = await put(productUrl, {
        published: true,
        guest_access: true,
        recursive: true,
      });
      expect(republished.statusCode).toBe(200);
      rows = await beneath();
      Object.values(rows).forEach(row => expect(words(row)).toEqual(OPEN));
    });

    it('should cascade from the release and the patch', async () => {
      const closed = await put(`${productUrl}/release/1.0.0`, { guest_access: false });
      expect(closed.statusCode).toBe(200);
      let rows = await beneath();
      expect(rows.patch.guestAccess).toBe(false);
      expect(rows.file.guestAccess).toBe(false);

      const lifted = await post(`${productUrl}/release/bulk`, {
        action: 'allow_guests',
        names: ['1.0.0'],
        recursive: true,
      });
      expect(lifted.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      rows = await beneath();
      expect(rows.patch.guestAccess).toBe(true);
      expect(rows.file.guestAccess).toBe(true);

      const patchClosed = await post(`${productUrl}/release/1.0.0/patch/bulk`, {
        action: 'unpublish',
        names: ['release'],
      });
      expect(patchClosed.body).toEqual({ processed: 1, skipped: 0, errors: [] });
      rows = await beneath();
      expect(rows.release.published).toBe(true);
      expect(rows.patch.published).toBe(false);
      expect(rows.file.published).toBe(false);

      const patchPlain = await put(`${productUrl}/release/1.0.0/patch/release`, {
        published: true,
      });
      expect(patchPlain.statusCode).toBe(200);
      rows = await beneath();
      expect(rows.patch.published).toBe(true);
      expect(rows.file.published).toBe(false);

      const patchLifted = await put(`${productUrl}/release/1.0.0/patch/release`, {
        published: true,
        recursive: true,
      });
      expect(patchLifted.statusCode).toBe(200);
      rows = await beneath();
      expect(rows.file.published).toBe(true);
    });
  });
});
