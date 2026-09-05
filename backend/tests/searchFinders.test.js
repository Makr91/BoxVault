import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../server.js';
import db from '../app/models/index.js';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('Search finders across the catalog', () => {
  const uniqueId = Date.now().toString(36);
  const orgName = `SearchOrg-${uniqueId}`;
  const boxName = `sbox-${uniqueId}`;
  const isoName = `siso-${uniqueId}`;
  const boxVersionNumber = `v${uniqueId}a`;
  const isoVersionNumber = `v${uniqueId}b`;
  const providerName = `prov-${uniqueId}`;
  const architectureName = `arch-${uniqueId}`;
  const boxChecksum = `abcdef${uniqueId}000000000000000000`;
  const isoChecksum = `fedcba${uniqueId}000000000000000000`;
  const metaTerm = `zzmeta${uniqueId}`;
  const numberTerm = '987650199';
  let org;
  let owner;
  let member;
  let ownerToken;
  let adminToken;

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const createUser = async label => {
    const account = await db.user.create({
      username: `${label}-${uniqueId}`,
      email: `${label}-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    await account.setRoles([role]);
    return account;
  };

  const search = (query, token) => {
    const req = request(app).get('/api/search').query(query);
    return token ? req.set('x-access-token', token) : req;
  };

  const createPublicBox = (name, extra = {}) =>
    db.box.create({
      name,
      description: 'box',
      isPublic: true,
      published: true,
      organizationId: org.id,
      userId: owner.id,
      ...extra,
    });

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    org = await db.organization.create({
      name: orgName,
      display_name: 'Search Organization',
      access_mode: 'invite_only',
    });
    owner = await createUser('search-owner');
    member = await createUser('search-member');
    await db.UserOrg.create({ user_id: owner.id, organization_id: org.id, role: 'owner' });
    await db.UserOrg.create({ user_id: member.id, organization_id: org.id, role: 'member' });
    const admin = await db.user.findOne({ where: { username: 'SomeUser' } });
    ownerToken = signFor(owner);
    adminToken = signFor(admin);

    const box = await createPublicBox(boxName);
    const version = await db.versions.create({ versionNumber: boxVersionNumber, boxId: box.id });
    const provider = await db.providers.create({ name: providerName, versionId: version.id });
    const architecture = await db.architectures.create({
      name: architectureName,
      providerId: provider.id,
    });
    await db.files.create({
      fileName: 'vagrant.box',
      checksum: boxChecksum,
      checksumType: 'SHA256',
      fileSize: 10,
      architectureId: architecture.id,
    });

    await createPublicBox(`mbox-a-${uniqueId}`, { metadata: JSON.stringify({ distro: metaTerm }) });
    await createPublicBox(`mbox-b-${uniqueId}`, { metadata: `${metaTerm}-not-json` });
    await createPublicBox(`mbox-c-${uniqueId}`, { metadata: Number(numberTerm) });

    const iso = await db.iso.create({
      name: isoName,
      description: 'iso',
      isPublic: true,
      published: true,
      organizationId: org.id,
      userId: owner.id,
    });
    const isoVersion = await db.isoVersions.create({
      versionNumber: isoVersionNumber,
      isoId: iso.id,
    });
    await db.isoFiles.create({
      architecture: 'amd64',
      fileName: `image-${uniqueId}.iso`,
      fileSize: 10,
      checksum: isoChecksum,
      checksumType: 'SHA256',
      storagePath: `iso/${uniqueId}.iso`,
      isoVersionId: isoVersion.id,
    });
  });

  afterAll(async () => {
    await db.iso.destroy({ where: { organizationId: org.id } });
    await db.box.destroy({ where: { organizationId: org.id } });
    await org.destroy();
    await db.user.destroy({ where: { id: [owner.id, member.id] } });
  });

  it('should find the ISO as an item', async () => {
    const res = await search({ q: isoName, kinds: 'item' });
    expect(res.statusCode).toBe(200);
    expect(res.body.results).toEqual([
      expect.objectContaining({ kind: 'item', collection: 'isos', org: orgName, name: isoName }),
    ]);
  });

  it('should find box and ISO versions', async () => {
    const res = await search({ q: `v${uniqueId}`, kinds: 'version' });
    expect(res.body.results.map(row => [row.collection, row.version])).toEqual([
      ['boxes', boxVersionNumber],
      ['isos', isoVersionNumber],
    ]);
    expect(res.body.results[1].subtitle).toBe(`${orgName} · isos · ${isoName}`);
  });

  it('should find providers and architectures with their chain', async () => {
    const provider = await search({ q: providerName, kinds: 'provider' });
    expect(provider.body.results).toEqual([
      expect.objectContaining({
        kind: 'provider',
        provider: providerName,
        subtitle: `${orgName} · boxes · ${boxName} · ${boxVersionNumber}`,
      }),
    ]);
    const architecture = await search({ q: architectureName, kinds: 'architecture' });
    expect(architecture.body.results).toEqual([
      expect.objectContaining({
        kind: 'architecture',
        architecture: architectureName,
        subtitle: `${orgName} · boxes · ${boxName} · ${boxVersionNumber} · ${providerName}`,
      }),
    ]);
  });

  it('should find artifacts by checksum prefix', async () => {
    const boxHit = await search({ q: boxChecksum.slice(0, 10), kinds: 'artifact' });
    expect(boxHit.body.results).toEqual([
      expect.objectContaining({ collection: 'boxes', title: 'vagrant.box', matched: 'checksum' }),
    ]);
    const isoHit = await search({ q: isoChecksum.slice(0, 10), kinds: 'artifact' });
    expect(isoHit.body.results).toEqual([
      expect.objectContaining({
        collection: 'isos',
        architecture: 'amd64',
        title: `image-${uniqueId}.iso`,
        matched: 'checksum',
      }),
    ]);
  });

  it('should match metadata stored as JSON text and skip unreadable metadata', async () => {
    const parsed = await search({ q: metaTerm, kinds: 'item' });
    expect(parsed.statusCode).toBe(200);
    expect(parsed.body.results).toEqual([
      expect.objectContaining({ name: `mbox-a-${uniqueId}`, matched: 'metadata.distro' }),
    ]);
    const numeric = await search({ q: numberTerm, kinds: 'item' });
    expect(numeric.body.results).toEqual([]);
  });

  it('should drop wildcard false positives after the database match', async () => {
    const kinds = ['organization', 'item', 'version', 'provider', 'architecture', 'artifact'];
    const responses = await Promise.all(kinds.map(kind => search({ q: '%%', kinds: kind })));
    responses.forEach(res => {
      expect(res.statusCode).toBe(200);
      expect(res.body.results).toEqual([]);
    });
    const users = await search({ q: '%%', kinds: 'user' }, adminToken);
    expect(users.body.results).toEqual([]);
  });

  it('should answer the members of the organizations the caller manages', async () => {
    const res = await search({ q: member.username, kinds: 'user' }, ownerToken);
    expect(res.body.results).toEqual([
      expect.objectContaining({ kind: 'user', org: orgName, name: member.username }),
    ]);
  });
});
