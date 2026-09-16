import request from 'supertest';
import { jest } from '@jest/globals';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureDownloadPath } from '../app/controllers/download/helpers.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const sha256 = content => createHash('sha256').update(content).digest('hex');

const binaryParser = (response, callback) => {
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Download file API', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `FileOrg_${uniqueId}`;
  const productName = 'domino-server';
  const releaseNumber = '14.5.1';
  const patchName = 'release';
  const productBase = `/api/organization/${orgName}/download/${productName}`;
  const patchBase = `${productBase}/release/${releaseNumber}/patch/${patchName}`;
  const fileContent = Buffer.from(`domino-installer-${uniqueId}`);
  const installerName = 'Domino_14.5.1_Linux_English.tar';
  let org;
  let owner;
  let member;
  let guest;
  let outsider;
  let ownerToken;
  let memberToken;
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

  const filePath = (release, patch, fileName) =>
    getSecureDownloadPath(orgName, productName, release, patch, fileName);

  const uploadTo = (key, token, content, headers = {}) => {
    const req = request(app)
      .post(`${patchBase}/file/${key}/upload`)
      .set('x-access-token', token)
      .set('Content-Type', 'application/octet-stream');
    Object.entries(headers).forEach(([header, value]) => req.set(header, value));
    return req.send(content);
  };

  const setProduct = values =>
    db.download.update(values, { where: { name: productName, organizationId: org.id } });

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    owner = await createUser('file-owner', 'owner');
    member = await createUser('file-member', 'member');
    guest = await createUser('file-guest', 'guest');
    outsider = await createUser('file-outsider', null);
    ownerToken = signFor(owner);
    memberToken = signFor(member);
    guestToken = signFor(guest);
    outsiderToken = signFor(outsider);
    await request(app)
      .post(`/api/organization/${orgName}/download`)
      .set('x-access-token', ownerToken)
      .send({ name: productName, published: true })
      .expect(201);
    await request(app)
      .post(`${productBase}/release`)
      .set('x-access-token', ownerToken)
      .send({ version_number: releaseNumber })
      .expect(201);
    await request(app)
      .post(`${productBase}/release/${releaseNumber}/patch`)
      .set('x-access-token', ownerToken)
      .send({ name: patchName })
      .expect(201);
  });

  afterAll(async () => {
    await db.download.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({ where: { id: [owner.id, member.id, guest.id, outsider.id] } });
    fs.rmSync(getSecureDownloadPath(orgName), { recursive: true, force: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST .../file', () => {
    it('should create a file row with the defaults', async () => {
      const res = await request(app)
        .post(`${patchBase}/file`)
        .set('x-access-token', ownerToken)
        .send({ key: 'linux-x64', file_name: installerName, kind: 'installer' });
      expect(res.statusCode).toBe(201);
      expect(res.body.key).toBe('linux-x64');
      expect(res.body.fileName).toBe(installerName);
      expect(res.body.kind).toBe('installer');
      expect(res.body.platform).toBe('any');
      expect(res.body.architecture).toBe('any');
      expect(res.body.language).toBe('any');
      expect(Number(res.body.fileSize)).toBe(0);
      expect(res.body.original).toBe(true);
      expect(res.body.storagePath).toBeNull();
    });

    it('should reject a platform outside the enum and a duplicate key', async () => {
      const invalid = await request(app)
        .post(`${patchBase}/file`)
        .set('x-access-token', ownerToken)
        .send({ key: 'bsd-x64', platform: 'freebsd' });
      expect(invalid.statusCode).toBe(422);
      expect(invalid.body.errors).toEqual([
        expect.objectContaining({ pointer: '/platform', rule: 'enum' }),
      ]);

      const duplicate = await request(app)
        .post(`${patchBase}/file`)
        .set('x-access-token', ownerToken)
        .send({ key: 'linux-x64' });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.body.errors).toEqual([
        expect.objectContaining({ pointer: '/key', rule: 'unique', params: { scope: patchName } }),
      ]);
    });

    it('should refuse a plain member and list the rows for a member', async () => {
      const asMember = await request(app)
        .post(`${patchBase}/file`)
        .set('x-access-token', memberToken)
        .send({ key: 'windows-x64' });
      expect(asMember.statusCode).toBe(403);

      const list = await request(app).get(`${patchBase}/file`).set('x-access-token', memberToken);
      expect(list.statusCode).toBe(200);
      expect(list.body.map(entry => entry.key)).toEqual(['linux-x64']);

      const anonymous = await request(app).get(`${patchBase}/file`);
      expect(anonymous.statusCode).toBe(403);
    });
  });

  describe('POST .../file/:key/upload', () => {
    it('should store the bytes under the real file name at the product path', async () => {
      const res = await uploadTo('linux-x64', ownerToken, fileContent, {
        'x-file-name': installerName,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('File upload completed');
      expect(res.body.details.fileSize).toBe(fileContent.length);
      expect(fs.existsSync(filePath(releaseNumber, patchName, installerName))).toBe(true);

      const info = await request(app)
        .get(`${patchBase}/file/linux-x64/info`)
        .set('x-access-token', memberToken);
      expect(info.statusCode).toBe(200);
      expect(info.body).toEqual({
        key: 'linux-x64',
        fileName: installerName,
        kind: 'installer',
        platform: 'any',
        architecture: 'any',
        language: 'any',
        variant: null,
        fileSize: expect.anything(),
        checksum: sha256(fileContent),
        checksumType: 'SHA256',
        downloadCount: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('should verify a declared checksum and refuse a wrong one', async () => {
      const content = Buffer.from(`windows-installer-${uniqueId}`);
      const ok = await uploadTo('windows-x64', ownerToken, content, {
        'x-file-name': 'Domino_14.5.1_Win_English.exe',
        'x-checksum': sha256(content),
        'x-checksum-type': 'sha256',
      });
      expect(ok.statusCode).toBe(200);

      const bad = await uploadTo('bad-checksum', ownerToken, content, {
        'x-file-name': 'Domino_14.5.1_Win_Wrong.exe',
        'x-checksum': 'deadbeef',
        'x-checksum-type': 'sha256',
      });
      expect(bad.statusCode).toBe(500);
      expect(bad.body.title).toBe('Could not upload the file');
      expect(fs.existsSync(filePath(releaseNumber, patchName, 'Domino_14.5.1_Win_Wrong.exe'))).toBe(
        false
      );
    });

    it('should assemble a chunked upload and answer the info poll', async () => {
      const content = Buffer.from(`container-image-${uniqueId}-with-two-chunks`);
      const half = Math.ceil(content.length / 2);
      const first = await uploadTo('container', ownerToken, content.subarray(0, half), {
        'x-file-name': 'Domino_14.5.1_Container_Image.tgz',
        'x-chunk-index': '0',
        'x-total-chunks': '2',
      });
      expect(first.statusCode).toBe(200);
      expect(first.body.details.isComplete).toBe(false);
      expect(first.body.details.chunksReceived).toBe(1);
      expect(first.body.details).toMatchObject({
        product: productName,
        release: releaseNumber,
        patch: patchName,
        key: 'container',
      });

      const second = await uploadTo('container', ownerToken, content.subarray(half), {
        'x-file-name': 'Domino_14.5.1_Container_Image.tgz',
        'x-chunk-index': '1',
        'x-total-chunks': '2',
      });
      expect(second.statusCode).toBe(200);
      expect(second.body.details.isComplete).toBe(true);
      expect(second.body.details.fileSize).toBe(content.length);

      const info = await request(app)
        .get(`${patchBase}/file/container/info`)
        .set('x-access-token', ownerToken);
      expect(info.body.fileSize).toBe(content.length);
      expect(info.body.checksum).toBe(sha256(content));
      expect(
        fs.readFileSync(filePath(releaseNumber, patchName, 'Domino_14.5.1_Container_Image.tgz'))
      ).toEqual(content);
    });

    it('should refuse a bad chunk header and a path traversal file name', async () => {
      const badChunk = await uploadTo('container', ownerToken, fileContent, {
        'x-chunk-index': '5',
        'x-total-chunks': '2',
      });
      expect(badChunk.statusCode).toBe(400);
      expect(badChunk.body.errors).toEqual([
        expect.objectContaining({ pointer: '/x-chunk-index', rule: 'maximum' }),
      ]);

      const traversal = await uploadTo('evil', ownerToken, fileContent, {
        'x-file-name': '../../etc/passwd',
      });
      expect(traversal.statusCode).toBe(400);
    });

    it('should create the product, release, patch and file when absent for any member', async () => {
      const content = Buffer.from(`shi-${uniqueId}`);
      const res = await request(app)
        .post(
          `/api/organization/${orgName}/download/super-human-installer/release/1.2.0/patch/release/file/linux-x64/upload`
        )
        .set('x-access-token', memberToken)
        .set('Content-Type', 'application/octet-stream')
        .set('x-file-name', 'shi-1.2.0-linux.tar.gz')
        .send(content);
      expect(res.statusCode).toBe(200);

      const product = await db.download.findOne({
        where: { name: 'super-human-installer', organizationId: org.id },
      });
      expect(product.userId).toBe(member.id);
      expect(product.published).toBe(false);
      const release = await db.downloadReleases.findOne({
        where: { versionNumber: '1.2.0', downloadId: product.id },
      });
      const patch = await db.downloadPatches.findOne({
        where: { name: 'release', downloadReleaseId: release.id },
      });
      expect(patch.kind).toBe('release');
      const file = await db.downloadFiles.findOne({
        where: { key: 'linux-x64', downloadPatchId: patch.id },
      });
      expect(file.fileName).toBe('shi-1.2.0-linux.tar.gz');
      expect(file.kind).toBe('other');
      expect(file.platform).toBe('any');
      expect(file.storagePath).toBe(
        `${orgName}/downloads/super-human-installer/1.2.0/release/shi-1.2.0-linux.tar.gz`
      );
      const storedPath = getSecureDownloadPath(
        orgName,
        'super-human-installer',
        '1.2.0',
        'release',
        'shi-1.2.0-linux.tar.gz'
      );
      expect(fs.existsSync(storedPath)).toBe(true);
    });

    it('should take the file name as the key when a drop names no key of its own', async () => {
      const content = Buffer.from(`mfa-template-${uniqueId}`);
      const dropUrl = `/api/organization/${orgName}/download/mfa-template/release/2.0/patch/release/file/mfa-template-2.0.ntf/upload`;
      const res = await request(app)
        .post(dropUrl)
        .set('x-access-token', memberToken)
        .set('Content-Type', 'application/octet-stream')
        .send(content);
      expect(res.statusCode).toBe(200);

      const product = await db.download.findOne({
        where: { name: 'mfa-template', organizationId: org.id },
      });
      expect(product.userId).toBe(member.id);
      expect(product.iconUrl).toBeNull();
      const file = await db.downloadFiles.findOne({ where: { fileName: 'mfa-template-2.0.ntf' } });
      expect(file.key).toBe('mfa-template-2.0.ntf');
      const droppedPath = getSecureDownloadPath(
        orgName,
        'mfa-template',
        '2.0',
        'release',
        'mfa-template-2.0.ntf'
      );
      expect(fs.readFileSync(droppedPath)).toEqual(content);

      const again = Buffer.from(`mfa-template-again-${uniqueId}`);
      const replaced = await request(app)
        .post(dropUrl)
        .set('x-access-token', memberToken)
        .set('Content-Type', 'application/octet-stream')
        .send(again);
      expect(replaced.statusCode).toBe(200);
      expect(await db.downloadFiles.count({ where: { fileName: 'mfa-template-2.0.ntf' } })).toBe(1);
      expect(fs.readFileSync(droppedPath)).toEqual(again);
    });

    it('should refuse a member uploading into a product they do not own', async () => {
      const res = await uploadTo('member-file', memberToken, fileContent, {
        'x-file-name': 'member.bin',
      });
      expect(res.statusCode).toBe(403);
    });

    it('should refuse a non-member and answer 404 for an unknown organization', async () => {
      const res = await uploadTo('outsider-file', outsiderToken, fileContent);
      expect(res.statusCode).toBe(403);
      const noOrg = await request(app)
        .post(
          `/api/organization/NoOrg-${uniqueId}/download/x/release/1/patch/release/file/k/upload`
        )
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(noOrg.statusCode).toBe(404);
    });

    it('should refuse a product name, release or patch outside its pattern with a pointer', async () => {
      const badProduct = await request(app)
        .post(
          `/api/organization/${orgName}/download/bad_name/release/1.0/patch/release/file/k/upload`
        )
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(badProduct.statusCode).toBe(422);
      expect(badProduct.body.errors).toEqual([
        expect.objectContaining({ pointer: '/name', rule: 'pattern', params: { pattern: 'slug' } }),
      ]);

      const badRelease = await request(app)
        .post(`${productBase}/release/.hidden/patch/release/file/k/upload`)
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(badRelease.statusCode).toBe(422);
      expect(badRelease.body.errors).toEqual([
        expect.objectContaining({ pointer: '/version_number', rule: 'pattern' }),
      ]);

      const badPatch = await request(app)
        .post(`${productBase}/release/${releaseNumber}/patch/-bad/file/k/upload`)
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'application/octet-stream')
        .send(fileContent);
      expect(badPatch.statusCode).toBe(422);
      expect(badPatch.body.errors).toEqual([
        expect.objectContaining({ pointer: '/name', rule: 'pattern' }),
      ]);
    });
  });

  describe('guest membership', () => {
    it('should read the info and download a file of the published private product', async () => {
      const info = await request(app)
        .get(`${patchBase}/file/linux-x64/info`)
        .set('x-access-token', guestToken);
      expect(info.statusCode).toBe(200);
      expect(info.body.downloadCount).toBe(0);

      const link = await request(app)
        .post(`${patchBase}/file/linux-x64/get-download-link`)
        .set('x-access-token', guestToken);
      expect(link.statusCode).toBe(200);
      expect(link.body).toHaveProperty('downloadUrl');

      const download = await request(app)
        .get(`${patchBase}/file/linux-x64/download`)
        .set('x-access-token', guestToken)
        .buffer(true)
        .parse(binaryParser);
      expect(download.statusCode).toBe(200);
      expect(Buffer.compare(download.body, fileContent)).toBe(0);
    });

    it('should be refused every file write', async () => {
      const created = await request(app)
        .post(`${patchBase}/file`)
        .set('x-access-token', guestToken)
        .send({ key: 'guest-x64' });
      expect(created.statusCode).toBe(403);

      const uploaded = await uploadTo('guest-file', guestToken, fileContent, {
        'x-file-name': 'guest.bin',
      });
      expect(uploaded.statusCode).toBe(403);

      const updated = await request(app)
        .put(`${patchBase}/file/linux-x64`)
        .set('x-access-token', guestToken)
        .send({ variant: 'hijack' });
      expect(updated.statusCode).toBe(403);

      const removed = await request(app)
        .delete(`${patchBase}/file/linux-x64/delete`)
        .set('x-access-token', guestToken);
      expect(removed.statusCode).toBe(403);

      const bulk = await request(app)
        .post(`${patchBase}/file/bulk`)
        .set('x-access-token', guestToken)
        .send({ action: 'delete', names: ['linux-x64'] });
      expect(bulk.statusCode).toBe(403);

      const dropped = await request(app)
        .post(`/api/organization/${orgName}/download/file/upload`)
        .set('x-access-token', guestToken)
        .set('Content-Type', 'application/octet-stream')
        .set('x-file-name', 'Guest_1.0.0_Linux.tar')
        .send(fileContent);
      expect(dropped.statusCode).toBe(403);
      expect(await db.download.count({ where: { name: 'guest', organizationId: org.id } })).toBe(0);
      expect(fs.existsSync(filePath(releaseNumber, patchName, installerName))).toBe(true);
    });
  });

  describe('POST <level>/file/upload', () => {
    const dropAt = (url, token, content, fileName) => {
      const req = request(app)
        .post(url)
        .set('x-access-token', token)
        .set('Content-Type', 'application/octet-stream');
      if (fileName) {
        req.set('x-file-name', fileName);
      }
      return req.send(content);
    };

    it('should create the product, release and patch the file name names from the collection', async () => {
      const content = Buffer.from(`traveler-${uniqueId}`);
      const res = await dropAt(
        `/api/organization/${orgName}/download/file/upload?is_public=true&kind=package&platform=linux&architecture=x64&language=en`,
        memberToken,
        content,
        'Traveler_14.0.0_Linux.tar.gz'
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.details.fileSize).toBe(content.length);
      expect(res.body.details).toMatchObject({
        product: 'traveler',
        release: '14.0.0',
        patch: 'release',
        key: 'Traveler_14.0.0_Linux.tar.gz',
      });

      const product = await db.download.findOne({
        where: { name: 'traveler', organizationId: org.id },
      });
      expect(product.userId).toBe(member.id);
      expect(product.isPublic).toBe(true);
      expect(product.published).toBe(false);
      const release = await db.downloadReleases.findOne({
        where: { versionNumber: '14.0.0', downloadId: product.id },
      });
      const patch = await db.downloadPatches.findOne({
        where: { name: 'release', downloadReleaseId: release.id },
      });
      expect(patch.kind).toBe('release');
      const file = await db.downloadFiles.findOne({
        where: { fileName: 'Traveler_14.0.0_Linux.tar.gz', downloadPatchId: patch.id },
      });
      expect(file.key).toBe('Traveler_14.0.0_Linux.tar.gz');
      expect(file.kind).toBe('package');
      expect(file.platform).toBe('linux');
      expect(file.architecture).toBe('x64');
      expect(file.language).toBe('en');

      const badMember = await dropAt(
        `/api/organization/${orgName}/download/file/upload?platform=amiga`,
        memberToken,
        content,
        'Traveler_14.0.0_Linux.tar.gz'
      );
      expect(badMember.statusCode).toBe(422);
      expect(badMember.body.errors).toEqual([
        expect.objectContaining({ pointer: '/platform', rule: 'enum' }),
      ]);
      const travelerPath = getSecureDownloadPath(
        orgName,
        'traveler',
        '14.0.0',
        'release',
        'Traveler_14.0.0_Linux.tar.gz'
      );
      expect(fs.readFileSync(travelerPath)).toEqual(content);
    });

    it('should leave a product private without the query and refuse a name without levels', async () => {
      const res = await dropAt(
        `/api/organization/${orgName}/download/file/upload`,
        memberToken,
        Buffer.from(`sametime-${uniqueId}`),
        'Sametime-12.0.2-Premium.zip'
      );
      expect(res.statusCode).toBe(200);
      const product = await db.download.findOne({
        where: { name: 'sametime', organizationId: org.id },
      });
      expect(product.isPublic).toBe(false);

      const noName = await dropAt(
        `/api/organization/${orgName}/download/file/upload`,
        memberToken,
        fileContent
      );
      expect(noName.statusCode).toBe(400);

      const noVersion = await dropAt(
        `/api/organization/${orgName}/download/file/upload`,
        memberToken,
        fileContent,
        'README.pdf'
      );
      expect(noVersion.statusCode).toBe(422);
      expect(noVersion.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ pointer: '/version_number' })])
      );
      expect(await db.download.count({ where: { name: 'readme', organizationId: org.id } })).toBe(
        0
      );

      const noProduct = await dropAt(
        `/api/organization/${orgName}/download/file/upload`,
        memberToken,
        fileContent,
        '1.0.0-tool.zip'
      );
      expect(noProduct.statusCode).toBe(422);
      expect(noProduct.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ pointer: '/name' })])
      );
    });

    it('should create the release the file name names under the product', async () => {
      const content = Buffer.from(`domino-1202-${uniqueId}`);
      const res = await dropAt(
        `${productBase}/file/upload`,
        ownerToken,
        content,
        'Domino_12.0.2_Win_English.exe'
      );
      expect(res.statusCode).toBe(200);

      const product = await db.download.findOne({
        where: { name: productName, organizationId: org.id },
      });
      const release = await db.downloadReleases.findOne({
        where: { versionNumber: '12.0.2', downloadId: product.id },
      });
      expect(release).not.toBeNull();
      const patch = await db.downloadPatches.findOne({
        where: { name: 'release', downloadReleaseId: release.id },
      });
      const file = await db.downloadFiles.findOne({ where: { downloadPatchId: patch.id } });
      expect(file.key).toBe('Domino_12.0.2_Win_English.exe');
      expect(fs.existsSync(filePath('12.0.2', 'release', 'Domino_12.0.2_Win_English.exe'))).toBe(
        true
      );

      const asMember = await dropAt(
        `${productBase}/file/upload`,
        memberToken,
        content,
        'Domino_12.0.2_Linux_English.tar'
      );
      expect(asMember.statusCode).toBe(403);
    });

    it('should take the path release over the one the file name names', async () => {
      const content = Buffer.from(`notes-${uniqueId}`);
      const res = await dropAt(
        `${productBase}/release/${releaseNumber}/file/upload`,
        ownerToken,
        content,
        'Notes_Domino_14.5_Release_Notes.pdf'
      );
      expect(res.statusCode).toBe(200);

      const file = await db.downloadFiles.findOne({
        where: { fileName: 'Notes_Domino_14.5_Release_Notes.pdf' },
      });
      expect(file.key).toBe('Notes_Domino_14.5_Release_Notes.pdf');
      expect(
        fs.readFileSync(filePath(releaseNumber, patchName, 'Notes_Domino_14.5_Release_Notes.pdf'))
      ).toEqual(content);
      const product = await db.download.findOne({
        where: { name: productName, organizationId: org.id },
      });
      expect(
        await db.downloadReleases.count({
          where: { versionNumber: '14.5', downloadId: product.id },
        })
      ).toBe(0);
    });

    it('should create the patch the path names and key the file by its name', async () => {
      const content = Buffer.from(`if1-${uniqueId}`);
      const res = await dropAt(
        `${productBase}/release/${releaseNumber}/patch/IF1/file/upload`,
        ownerToken,
        content,
        'Domino_1451IF1_Linux.tar'
      );
      expect(res.statusCode).toBe(200);

      const product = await db.download.findOne({
        where: { name: productName, organizationId: org.id },
      });
      const release = await db.downloadReleases.findOne({
        where: { versionNumber: releaseNumber, downloadId: product.id },
      });
      const patch = await db.downloadPatches.findOne({
        where: { name: 'IF1', downloadReleaseId: release.id },
      });
      expect(patch).not.toBeNull();
      const file = await db.downloadFiles.findOne({
        where: { key: 'Domino_1451IF1_Linux.tar', downloadPatchId: patch.id },
      });
      expect(file.fileName).toBe('Domino_1451IF1_Linux.tar');
      expect(fs.readFileSync(filePath(releaseNumber, 'IF1', 'Domino_1451IF1_Linux.tar'))).toEqual(
        content
      );
    });
  });

  describe('deduplication by symlink', () => {
    const linkPath = () => filePath(releaseNumber, 'FP1', 'Domino_1451FP1_Linux.tar');
    const originalPath = () => filePath(releaseNumber, patchName, installerName);

    it('should link a second upload of the same bytes to the original', async () => {
      const res = await request(app)
        .post(`${productBase}/release/${releaseNumber}/patch/FP1/file/linux-x64/upload`)
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'application/octet-stream')
        .set('x-file-name', 'Domino_1451FP1_Linux.tar')
        .send(fileContent);
      expect(res.statusCode).toBe(200);

      const original = await db.downloadFiles.findOne({ where: { fileName: installerName } });
      const link = await db.downloadFiles.findOne({
        where: { fileName: 'Domino_1451FP1_Linux.tar' },
      });
      expect(original.original).toBe(true);
      expect(link.original).toBe(false);
      expect(link.linksTo).toBe(original.id);
      expect(fs.lstatSync(linkPath()).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(originalPath()).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(linkPath())).toEqual(fileContent);
    });

    it('should serve the link and count its download', async () => {
      const res = await request(app)
        .get(`${productBase}/release/${releaseNumber}/patch/FP1/file/linux-x64/download`)
        .set('x-access-token', memberToken)
        .buffer(true)
        .parse(binaryParser);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-disposition']).toContain('Domino_1451FP1_Linux.tar');
      expect(Buffer.compare(res.body, fileContent)).toBe(0);
    });

    it('should promote the link when the original is deleted', async () => {
      const third = await request(app)
        .post(`${productBase}/release/${releaseNumber}/patch/FP1/file/linux-x64-again/upload`)
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'application/octet-stream')
        .set('x-file-name', 'Domino_1451FP1_Linux_again.tar')
        .send(fileContent);
      expect(third.statusCode).toBe(200);

      const res = await request(app)
        .delete(`${patchBase}/file/linux-x64/delete`)
        .set('x-access-token', ownerToken);
      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(originalPath())).toBe(false);

      const heir = await db.downloadFiles.findOne({
        where: { fileName: 'Domino_1451FP1_Linux.tar' },
      });
      expect(heir.original).toBe(true);
      expect(heir.linksTo).toBeNull();
      expect(fs.lstatSync(linkPath()).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(linkPath())).toEqual(fileContent);

      const other = await db.downloadFiles.findOne({
        where: { fileName: 'Domino_1451FP1_Linux_again.tar' },
      });
      expect(other.original).toBe(false);
      expect(other.linksTo).toBe(heir.id);
      const otherPath = filePath(releaseNumber, 'FP1', 'Domino_1451FP1_Linux_again.tar');
      expect(fs.lstatSync(otherPath).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(otherPath)).toEqual(fileContent);
    });

    it('should drop the last link with the patch and keep the bytes elsewhere untouched', async () => {
      await request(app)
        .post(`${productBase}/release/${releaseNumber}/patch/FP1/file/linux-x64/upload`)
        .set('x-access-token', ownerToken)
        .set('Content-Type', 'application/octet-stream')
        .set('x-file-name', 'Domino_1451FP1_Linux.tar')
        .send(fileContent)
        .expect(200);
      const res = await request(app)
        .delete(`${productBase}/release/${releaseNumber}/patch/FP1`)
        .set('x-access-token', ownerToken);
      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(getSecureDownloadPath(orgName, productName, releaseNumber, 'FP1'))).toBe(
        false
      );
    });
  });

  describe('info, link and download', () => {
    const fileBase = `${patchBase}/file/windows-x64`;
    const windowsName = 'Domino_14.5.1_Win_English.exe';

    it('should answer the info by key and by file name', async () => {
      const byKey = await request(app).get(`${fileBase}/info`).set('x-access-token', memberToken);
      expect(byKey.statusCode).toBe(200);
      const byName = await request(app)
        .get(`${patchBase}/file/${windowsName}/info`)
        .set('x-access-token', memberToken);
      expect(byName.statusCode).toBe(200);
      expect(byName.body.key).toBe('windows-x64');

      const anonymous = await request(app).get(`${fileBase}/info`);
      expect(anonymous.statusCode).toBe(403);
      const missing = await request(app)
        .get(`${patchBase}/file/no-such-key/info`)
        .set('x-access-token', memberToken);
      expect(missing.statusCode).toBe(404);
    });

    it('should generate a download link scoped to the file', async () => {
      const res = await request(app)
        .post(`${fileBase}/get-download-link`)
        .set('x-access-token', memberToken);
      expect(res.statusCode).toBe(200);
      const [, token] = res.body.downloadUrl.split('token=');
      const decoded = jwt.verify(token, 'test-secret');
      expect(decoded.type).toBe('download');
      expect(decoded.organization).toBe(orgName);
      expect(decoded.download).toBe(productName);
      expect(decoded.versionNumber).toBe(releaseNumber);
      expect(decoded.patch).toBe(patchName);
      expect(decoded.key).toBe('windows-x64');

      const download = await request(app).get(`${fileBase}/download?token=${token}`);
      expect(download.statusCode).toBe(200);

      const asOutsider = await request(app)
        .post(`${fileBase}/get-download-link`)
        .set('x-access-token', outsiderToken);
      expect(asOutsider.statusCode).toBe(403);
      const anonymous = await request(app).post(`${fileBase}/get-download-link`);
      expect(anonymous.statusCode).toBe(403);
    });

    it('should download by key and by file name and count the download', async () => {
      const byKey = await request(app)
        .get(`${fileBase}/download`)
        .set('x-access-token', memberToken)
        .buffer(true)
        .parse(binaryParser);
      expect(byKey.statusCode).toBe(200);
      expect(byKey.headers['content-disposition']).toBe(`attachment; filename="${windowsName}"`);

      const byName = await request(app)
        .get(`${patchBase}/file/${windowsName}/download`)
        .set('x-access-token', memberToken)
        .buffer(true)
        .parse(binaryParser);
      expect(byName.statusCode).toBe(200);
      expect(Buffer.compare(byName.body, byKey.body)).toBe(0);

      const info = await request(app).get(`${fileBase}/info`).set('x-access-token', memberToken);
      expect(info.body.downloadCount).toBe(3);

      const product = await request(app).get(productBase).set('x-access-token', memberToken);
      expect(product.body.downloadCount).toBeGreaterThanOrEqual(3);
    });

    it('should handle range requests', async () => {
      const res = await request(app)
        .get(`${fileBase}/download`)
        .set('x-access-token', memberToken)
        .set('Range', 'bytes=0-4');
      expect(res.statusCode).toBe(206);
      expect(res.headers['content-length']).toBe('5');
    });

    it('should answer null counts to a caller who is not a member', async () => {
      await setProduct({ isPublic: true });
      const releaseBase = `${productBase}/release/${releaseNumber}`;

      const infoAsOutsider = await request(app)
        .get(`${fileBase}/info`)
        .set('x-access-token', outsiderToken);
      expect(infoAsOutsider.statusCode).toBe(200);
      expect(infoAsOutsider.body.downloadCount).toBeNull();

      const infoAnonymous = await request(app).get(`${fileBase}/info`);
      expect(infoAnonymous.body.downloadCount).toBeNull();

      const infoAsMember = await request(app)
        .get(`${fileBase}/info`)
        .set('x-access-token', memberToken);
      expect(infoAsMember.body.downloadCount).toBe(4);

      const files = await request(app).get(`${patchBase}/file`);
      expect(files.statusCode).toBe(200);
      files.body.forEach(entry => expect(entry.downloadCount).toBeNull());

      const patch = await request(app).get(patchBase).set('x-access-token', outsiderToken);
      expect(patch.statusCode).toBe(200);
      patch.body.files.forEach(entry => expect(entry.downloadCount).toBeNull());

      const patches = await request(app).get(`${releaseBase}/patch`);
      patches.body.forEach(entry =>
        entry.files.forEach(file => expect(file.downloadCount).toBeNull())
      );

      const release = await request(app).get(releaseBase);
      expect(release.statusCode).toBe(200);
      release.body.patches.forEach(entry =>
        entry.files.forEach(file => expect(file.downloadCount).toBeNull())
      );

      const releases = await request(app).get(`${productBase}/release`);
      releases.body.forEach(entry =>
        entry.patches.forEach(patchEntry =>
          patchEntry.files.forEach(file => expect(file.downloadCount).toBeNull())
        )
      );

      const product = await request(app).get(productBase);
      expect(product.body.downloadCount).toBeNull();
      product.body.releases.forEach(entry =>
        entry.patches.forEach(patchEntry =>
          patchEntry.files.forEach(file => expect(file.downloadCount).toBeNull())
        )
      );

      const productAsMember = await request(app)
        .get(productBase)
        .set('x-access-token', memberToken);
      expect(productAsMember.body.downloadCount).toBeGreaterThanOrEqual(3);
      const windowsRow = productAsMember.body.releases
        .flatMap(entry => entry.patches)
        .flatMap(patchEntry => patchEntry.files)
        .find(file => file.key === 'windows-x64');
      expect(windowsRow.downloadCount).toBe(4);

      await setProduct({ isPublic: false });
    });

    it('should refuse a download token issued for another file', async () => {
      const token = jwt.sign(
        {
          userId: member.id,
          organization: orgName,
          download: productName,
          versionNumber: releaseNumber,
          patch: patchName,
          key: 'container',
          type: 'download',
        },
        'test-secret',
        { expiresIn: '1h', ...TEST_JWT_CLAIMS }
      );
      const res = await request(app).get(`${fileBase}/download?token=${token}`);
      expect(res.statusCode).toBe(403);
    });

    it('should apply the visibility rule to downloads', async () => {
      const anonymous = await request(app).get(`${fileBase}/download`);
      expect(anonymous.statusCode).toBe(403);

      const asOutsider = await request(app)
        .get(`${fileBase}/download`)
        .set('x-access-token', outsiderToken);
      expect(asOutsider.statusCode).toBe(403);

      await setProduct({ isPublic: true });
      const open = await request(app).get(`${fileBase}/download`);
      expect(open.statusCode).toBe(200);

      await setProduct({ isPublic: false, published: false });
      const asMember = await request(app)
        .get(`${fileBase}/download`)
        .set('x-access-token', memberToken);
      expect(asMember.statusCode).toBe(403);
      const asCreator = await request(app)
        .get(`${fileBase}/download`)
        .set('x-access-token', ownerToken);
      expect(asCreator.statusCode).toBe(200);
      await setProduct({ published: true });
    });

    it('should refuse a service account of another organization', async () => {
      const otherOrg = await db.organization.create({ name: `file-other-${uniqueId}` });
      await db.UserOrg.create({ user_id: owner.id, organization_id: otherOrg.id, role: 'owner' });
      const account = await db.service_account.create({
        username: `sa-other-${uniqueId}`,
        token: `sa-other-token-${uniqueId}`,
        organization_id: otherOrg.id,
        userId: owner.id,
      });
      const saToken = jwt.sign(
        { id: owner.id, isServiceAccount: true, serviceAccountId: account.id },
        'test-secret',
        { expiresIn: '1h', ...TEST_JWT_CLAIMS }
      );
      const res = await request(app).get(`${fileBase}/download`).set('x-access-token', saToken);
      expect(res.statusCode).toBe(403);
      await account.destroy();
      await db.UserOrg.destroy({ where: { user_id: owner.id, organization_id: otherOrg.id } });
      await otherOrg.destroy();
    });

    it('should answer 404 for a row without bytes and for a missing physical file', async () => {
      await request(app)
        .post(`${patchBase}/file`)
        .set('x-access-token', ownerToken)
        .send({ key: 'notes', kind: 'notes' })
        .expect(201);
      const noBytes = await request(app)
        .get(`${patchBase}/file/notes/download`)
        .set('x-access-token', memberToken);
      expect(noBytes.statusCode).toBe(404);

      const ghost = await db.downloadFiles.findOne({ where: { key: 'windows-x64' } });
      const kept = ghost.storagePath;
      await ghost.update({ storagePath: `${orgName}/downloads/nowhere.exe` });
      const missing = await request(app)
        .get(`${fileBase}/download`)
        .set('x-access-token', memberToken);
      expect(missing.statusCode).toBe(404);
      await ghost.update({ storagePath: kept });
    });

    it('should handle a download error (500)', async () => {
      const statSpy = jest.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('Stat Error');
      });
      const res = await request(app).get(`${fileBase}/download`).set('x-access-token', memberToken);
      expect(res.statusCode).toBe(500);
      statSpy.mockRestore();
    });
  });

  describe('PUT .../file/:key', () => {
    it('should update the attributes and rename the stored file', async () => {
      const res = await request(app)
        .put(`${patchBase}/file/windows-x64`)
        .set('x-access-token', ownerToken)
        .send({ kind: 'installer', platform: 'windows', architecture: 'x64', language: 'en' });
      expect(res.statusCode).toBe(200);
      expect(res.body.kind).toBe('installer');
      expect(res.body.platform).toBe('windows');
      expect(res.body.architecture).toBe('x64');
      expect(res.body.language).toBe('en');

      const renamed = await request(app)
        .put(`${patchBase}/file/windows-x64`)
        .set('x-access-token', ownerToken)
        .send({ file_name: 'Domino_14.5.1_Windows_English.exe' });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.body.storagePath).toBe(
        `${orgName}/downloads/${productName}/${releaseNumber}/${patchName}/Domino_14.5.1_Windows_English.exe`
      );
      expect(
        fs.existsSync(filePath(releaseNumber, patchName, 'Domino_14.5.1_Windows_English.exe'))
      ).toBe(true);

      const conflict = await request(app)
        .put(`${patchBase}/file/windows-x64`)
        .set('x-access-token', ownerToken)
        .send({ key: 'container' });
      expect(conflict.statusCode).toBe(409);

      const invalid = await request(app)
        .put(`${patchBase}/file/windows-x64`)
        .set('x-access-token', ownerToken)
        .send({ kind: 'firmware' });
      expect(invalid.statusCode).toBe(422);

      const asMember = await request(app)
        .put(`${patchBase}/file/windows-x64`)
        .set('x-access-token', memberToken)
        .send({ variant: 'hijack' });
      expect(asMember.statusCode).toBe(403);
    });
  });

  describe('DELETE .../file/:key/delete', () => {
    it('should refuse a plain member and remove the file for the owner', async () => {
      const asMember = await request(app)
        .delete(`${patchBase}/file/windows-x64/delete`)
        .set('x-access-token', memberToken);
      expect(asMember.statusCode).toBe(403);

      const res = await request(app)
        .delete(`${patchBase}/file/windows-x64/delete`)
        .set('x-access-token', ownerToken);
      expect(res.statusCode).toBe(200);
      expect(
        fs.existsSync(filePath(releaseNumber, patchName, 'Domino_14.5.1_Windows_English.exe'))
      ).toBe(false);

      const gone = await request(app)
        .delete(`${patchBase}/file/windows-x64/delete`)
        .set('x-access-token', ownerToken);
      expect(gone.statusCode).toBe(404);
    });

    it('should delete the product with its files', async () => {
      const res = await request(app).delete(productBase).set('x-access-token', ownerToken);
      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(getSecureDownloadPath(orgName, productName))).toBe(false);
    });
  });
});
