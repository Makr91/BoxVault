import request from 'supertest';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureBoxPath } from '../app/utils/paths.js';
import { generateDownloadToken } from '../app/utils/auth.js';
import { hashServiceAccountToken } from '../app/utils/serviceAccountAuth.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const binaryParser = (response, callback) => {
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

const basic = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

describe('Download authentication', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `DlOrg-${uniqueId}`;
  const versionNumber = '1.0.0';
  const providerName = 'virtualbox';
  const architectureName = 'amd64';
  const rawToken = `raw-${uniqueId}-${'a'.repeat(20)}`;
  const content = Buffer.from(`box-${uniqueId}`);
  let org;
  let owner;
  let serviceAccount;

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const downloadUrl = boxName =>
    `/api/organization/${orgName}/box/${boxName}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download`;

  const download = boxName =>
    request(app).get(downloadUrl(boxName)).buffer(true).parse(binaryParser);

  const createBox = async (name, isPublic) => {
    const box = await db.box.create({
      name,
      description: name,
      isPublic,
      published: true,
      organizationId: org.id,
      userId: owner.id,
    });
    const version = await db.versions.create({ versionNumber, boxId: box.id });
    const provider = await db.providers.create({ name: providerName, versionId: version.id });
    const architecture = await db.architectures.create({
      name: architectureName,
      providerId: provider.id,
    });
    await db.files.create({
      fileName: 'vagrant.box',
      fileSize: content.length,
      architectureId: architecture.id,
    });
    const dir = getSecureBoxPath(orgName, name, versionNumber, providerName, architectureName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'vagrant.box'), content);
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName });
    owner = await db.user.create({
      username: `dl-owner-${uniqueId}`,
      email: `dl-owner-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    await owner.setRoles([role]);
    await db.UserOrg.create({ user_id: owner.id, organization_id: org.id, role: 'owner' });
    serviceAccount = await db.service_account.create({
      username: `dl-sa-${uniqueId}`,
      token: hashServiceAccountToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      userId: owner.id,
      organization_id: org.id,
    });
    await createBox(`dl-public-${uniqueId}`, true);
    await createBox(`dl-private-${uniqueId}`, false);
  });

  afterAll(async () => {
    await serviceAccount.destroy();
    await db.box.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await owner.destroy();
    fs.rmSync(getSecureBoxPath(orgName), { recursive: true, force: true });
  });

  it('should refuse a session token presented as a download token', async () => {
    const res = await download(`dl-public-${uniqueId}`).query({ token: signFor(owner) });
    expect(res.statusCode).toBe(403);
  });

  it('should refuse a download token of a suspended user', async () => {
    await owner.update({ suspended: true });
    try {
      const token = generateDownloadToken({
        userId: owner.id,
        organization: orgName,
        boxId: `dl-private-${uniqueId}`,
        versionNumber,
        providerName,
        architectureName,
      });
      const res = await download(`dl-private-${uniqueId}`).query({ token });
      expect(res.statusCode).toBe(403);
    } finally {
      await owner.update({ suspended: false });
    }
  });

  it('should serve a private box to a valid download token', async () => {
    const token = generateDownloadToken({
      userId: owner.id,
      organization: orgName,
      boxId: `dl-private-${uniqueId}`,
      versionNumber,
      providerName,
      architectureName,
    });
    const res = await download(`dl-private-${uniqueId}`).query({ token });
    expect(res.statusCode).toBe(200);
    expect(Buffer.compare(res.body, content)).toBe(0);
  });

  it('should refuse malformed or wrong basic credentials', async () => {
    const malformed = await download(`dl-public-${uniqueId}`).set(
      'Authorization',
      `Basic ${Buffer.from('nocolon').toString('base64')}`
    );
    expect(malformed.statusCode).toBe(401);
    expect(JSON.parse(malformed.body.toString()).message).toBe('Invalid basic auth format.');

    const wrong = await download(`dl-public-${uniqueId}`).set(
      'Authorization',
      basic(serviceAccount.username, 'not-the-token')
    );
    expect(wrong.statusCode).toBe(401);
    expect(JSON.parse(wrong.body.toString()).message).toBe('Invalid credentials.');
  });

  it('should serve a private box to valid basic credentials', async () => {
    const res = await download(`dl-private-${uniqueId}`).set(
      'Authorization',
      basic(serviceAccount.username, rawToken)
    );
    expect(res.statusCode).toBe(200);
    expect(Buffer.compare(res.body, content)).toBe(0);
  });

  it('should refuse basic credentials of a suspended owner', async () => {
    await owner.update({ suspended: true });
    try {
      const res = await download(`dl-public-${uniqueId}`).set(
        'Authorization',
        basic(serviceAccount.username, rawToken)
      );
      expect(res.statusCode).toBe(403);
    } finally {
      await owner.update({ suspended: false });
    }
  });

  it('should serve a private box to a raw bearer key', async () => {
    const res = await download(`dl-private-${uniqueId}`).set('Authorization', `Bearer ${rawToken}`);
    expect(res.statusCode).toBe(200);
  });

  it('should treat the raw key of a suspended owner as anonymous', async () => {
    await owner.update({ suspended: true });
    try {
      const privateRes = await download(`dl-private-${uniqueId}`).set(
        'Authorization',
        `Bearer ${rawToken}`
      );
      expect(privateRes.statusCode).toBe(403);
      const publicRes = await download(`dl-public-${uniqueId}`).set(
        'Authorization',
        `Bearer ${rawToken}`
      );
      expect(publicRes.statusCode).toBe(200);
    } finally {
      await owner.update({ suspended: false });
    }
  });

  it('should treat an unknown bearer key as anonymous', async () => {
    const privateRes = await download(`dl-private-${uniqueId}`).set(
      'Authorization',
      'Bearer not-a-known-key'
    );
    expect(privateRes.statusCode).toBe(403);
    const publicRes = await download(`dl-public-${uniqueId}`).set(
      'Authorization',
      'Bearer not-a-known-key'
    );
    expect(publicRes.statusCode).toBe(200);
  });
});
