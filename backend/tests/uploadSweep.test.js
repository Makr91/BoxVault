import request from 'supertest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import app from '../server.js';
import db from '../app/models/index.js';
import { getSecureBoxPath, getStorageRoot } from '../app/utils/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appConfigPath = path.join(__dirname, '../app/config/app.test.config.yaml');

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };
const HOUR_MS = 60 * 60 * 1000;

const updateAppConfig = mutate => {
  const original = fs.readFileSync(appConfigPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(appConfigPath, yaml.dump(config));
  return () => fs.writeFileSync(appConfigPath, original);
};

const makeTempDir = (segments, ageMs) => {
  const dir = path.join(getStorageRoot(), ...segments, '.temp');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'chunk-0'), 'stale');
  const stamp = new Date(Date.now() - ageMs);
  fs.utimesSync(dir, stamp, stamp);
  return dir;
};

describe('Stale chunk directory sweep', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `SweepUp-${uniqueId}`;
  const boxName = `sweep-box-${uniqueId}`;
  const staleOrg = `StaleOrg-${uniqueId}`;
  let org;
  let owner;
  let ownerToken;

  const uploadUrl = `/api/organization/${orgName}/box/${boxName}/version/1.0.0/provider/virtualbox/architecture/amd64/file/upload`;

  const sendChunk = index =>
    request(app)
      .post(uploadUrl)
      .set('x-access-token', ownerToken)
      .set('Content-Type', 'application/octet-stream')
      .set('x-chunk-index', String(index))
      .set('x-total-chunks', '3')
      .send(Buffer.from(`chunk-${index}`));

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({ name: orgName });
    owner = await db.user.create({
      username: `sweep-owner-${uniqueId}`,
      email: `sweep-owner-${uniqueId}@example.com`,
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
    const box = await db.box.create({
      name: boxName,
      description: 'sweep',
      isPublic: true,
      published: true,
      organizationId: org.id,
      userId: owner.id,
    });
    const version = await db.versions.create({ versionNumber: '1.0.0', boxId: box.id });
    const provider = await db.providers.create({ name: 'virtualbox', versionId: version.id });
    await db.architectures.create({ name: 'amd64', providerId: provider.id });
  });

  afterAll(async () => {
    await db.box.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await owner.destroy();
    fs.rmSync(getSecureBoxPath(orgName), { recursive: true, force: true });
    fs.rmSync(path.join(getStorageRoot(), staleOrg), { recursive: true, force: true });
  });

  it('should remove abandoned chunk directories older than the default age on the first chunk', async () => {
    const stale = makeTempDir([staleOrg, 'old-box', '1.0.0', 'vb', 'amd64'], 48 * HOUR_MS);
    const fresh = makeTempDir([staleOrg, 'new-box', '1.0.0', 'vb', 'amd64'], HOUR_MS);
    const deep = makeTempDir([staleOrg, 'a', 'b', 'c', 'd', 'e', 'f', 'g'], 48 * HOUR_MS);
    const stray = path.join(getStorageRoot(), staleOrg, 'stray.txt');
    fs.writeFileSync(stray, 'not a directory');

    const res = await sendChunk(0);
    expect(res.statusCode).toBe(200);
    expect(res.body.details).toMatchObject({
      status: 'uploading',
      chunksReceived: 1,
      totalChunks: 3,
    });

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(fs.existsSync(deep)).toBe(true);
    expect(fs.existsSync(stray)).toBe(true);
  });

  it('should honour the configured age and ignore a malformed knob', async () => {
    const twoHours = makeTempDir([staleOrg, 'two-hours', '1.0.0', 'vb', 'amd64'], 2 * HOUR_MS);
    const restore = updateAppConfig(config => {
      config.boxvault.upload_stale_temp_max_age_hours = { value: 1 };
    });
    try {
      const res = await sendChunk(0);
      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(twoHours)).toBe(false);
    } finally {
      restore();
    }

    const kept = makeTempDir([staleOrg, 'kept', '1.0.0', 'vb', 'amd64'], 2 * HOUR_MS);
    const restoreMalformed = updateAppConfig(config => {
      config.boxvault.upload_stale_temp_max_age_hours = { value: 'soon' };
    });
    try {
      const res = await sendChunk(0);
      expect(res.statusCode).toBe(200);
      expect(fs.existsSync(kept)).toBe(true);
    } finally {
      restoreMalformed();
    }
  });

  it('should leave later chunks out of the sweep', async () => {
    const stale = makeTempDir([staleOrg, 'later', '1.0.0', 'vb', 'amd64'], 48 * HOUR_MS);
    const res = await sendChunk(1);
    expect(res.statusCode).toBe(200);
    expect(res.body.details.chunksReceived).toBe(2);
    expect(fs.existsSync(stale)).toBe(true);
  });
});
