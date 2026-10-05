import request from 'supertest';
import { jest } from '@jest/globals';
import { createHash } from 'crypto';
import app from '../server.js';
import db from '../app/models/index.js';
import jwt from 'jsonwebtoken';

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const ROW_KEYS = [
  'kind',
  'id',
  'collection',
  'org',
  'name',
  'version',
  'provider',
  'architecture',
  'anchor',
  'source',
  'score',
  'title',
  'subtitle',
  'matched',
  'highlight',
  'facets',
];

const collect = (response, callback) => {
  const chunks = [];
  response.on('data', chunk => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Search API', () => {
  let memberToken;
  let adminToken;
  let guestToken;
  let member;
  let admin;
  let guest;
  let org;
  let otherOrg;
  let publicBox;
  let privateBox;
  let otherBox;
  let version;
  let provider;
  let architecture;
  let file;
  let privateDownload;
  let unpublishedDownload;
  let hiddenBox;
  let hiddenDownload;
  const rankBoxes = [];
  const uniqueId = Date.now();
  const orgName = `SearchOrg_${uniqueId}`;
  const otherOrgName = `SearchOther_${uniqueId}`;
  const memberName = `searchmember_${uniqueId}`;
  const publicBoxName = `search-public-${uniqueId}`;
  const privateBoxName = `search-private-${uniqueId}`;
  const hiddenBoxName = `search-phidden-${uniqueId}`;
  const otherBoxName = `search-pother-${uniqueId}`;
  const fileName = `search-artifact-${uniqueId}.box`;
  const privateDownloadName = `private-dl-${uniqueId}`;
  const unpublishedDownloadName = `unpub-dl-${uniqueId}`;
  const hiddenDownloadName = `hidden-dl-${uniqueId}`;
  const checksum = createHash('sha256').update(`search-${uniqueId}`).digest('hex');
  const rankTerm = `rank-${uniqueId}`;
  const exactName = rankTerm;
  const prefixName = `${rankTerm}-extra`;
  const nearName = `zz-${rankTerm}`;
  const farName = `abcdef-${rankTerm}`;
  const elsewhereName = `elsewhere-${uniqueId}`;

  const signFor = account =>
    jwt.sign({ id: account.id }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const search = (query, token) => {
    const req = request(app).get('/api/search').query(query);
    return token ? req.set('x-access-token', token) : req;
  };

  const opensearchOf = host => {
    const req = request(app).get('/opensearch.xml').buffer(true).parse(collect);
    return host ? req.set('Host', host) : req;
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);

    org = await db.organization.create({ name: orgName, access_mode: 'private' });
    otherOrg = await db.organization.create({ name: otherOrgName, access_mode: 'private' });

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

    guest = await db.user.create({
      username: `searchguest_${uniqueId}`,
      email: `searchguest_${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    await guest.setRoles([userRole]);
    await db.UserOrg.create({ user_id: guest.id, organization_id: org.id, role: 'guest' });
    guestToken = signFor(guest);

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
      guestAccess: true,
      userId: member.id,
      organizationId: org.id,
    });
    hiddenBox = await db.box.create({
      name: hiddenBoxName,
      description: 'A private box closed to guests',
      published: true,
      isPublic: false,
      userId: member.id,
      organizationId: org.id,
    });
    otherBox = await db.box.create({
      name: otherBoxName,
      description: 'A public box of another organization',
      published: true,
      isPublic: true,
      userId: member.id,
      organizationId: otherOrg.id,
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
    privateDownload = await db.download.create({
      name: privateDownloadName,
      description: 'A private download',
      published: true,
      isPublic: false,
      guestAccess: true,
      userId: member.id,
      organizationId: org.id,
    });
    hiddenDownload = await db.download.create({
      name: hiddenDownloadName,
      description: 'A private download closed to guests',
      published: true,
      isPublic: false,
      userId: member.id,
      organizationId: org.id,
    });
    unpublishedDownload = await db.download.create({
      name: unpublishedDownloadName,
      description: 'An unpublished download',
      published: false,
      isPublic: true,
      userId: member.id,
      organizationId: org.id,
    });
    const ranked = await Promise.all(
      [
        [exactName, 'ranked'],
        [prefixName, 'ranked'],
        [nearName, 'ranked'],
        [farName, 'ranked'],
        [elsewhereName, `described as ${rankTerm}`],
      ].map(([name, description]) =>
        db.box.create({
          name,
          description,
          published: true,
          isPublic: true,
          userId: member.id,
          organizationId: org.id,
        })
      )
    );
    rankBoxes.push(...ranked);
  });

  afterAll(async () => {
    await Promise.all(rankBoxes.map(box => box.destroy()));
    await hiddenDownload.destroy();
    await hiddenBox.destroy();
    await unpublishedDownload.destroy();
    await privateDownload.destroy();
    await file.destroy();
    await architecture.destroy();
    await provider.destroy();
    await version.destroy();
    await otherBox.destroy();
    await privateBox.destroy();
    await publicBox.destroy();
    await otherOrg.destroy();
    await org.destroy();
    await member.destroy();
    await admin.destroy();
    await guest.destroy();
  });

  describe('GET /api/search', () => {
    it('should reject a query shorter than 2 characters', async () => {
      const res = await search({ q: ' a ' });
      expect(res.statusCode).toBe(422);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/validation');
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/q', rule: 'minLength', params: { minLength: 2 } }),
      ]);
    });

    it('should reject a query longer than 200 characters', async () => {
      const res = await search({ q: 'a'.repeat(201) });
      expect(res.statusCode).toBe(422);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/q', rule: 'maxLength', params: { maxLength: 200 } }),
      ]);
    });

    it('should answer an internal problem when a finder fails', async () => {
      jest.spyOn(db.box, 'findAll').mockRejectedValueOnce(new Error('database down'));
      const res = await search({ q: 'search-p' });
      expect(res.statusCode).toBe(500);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
    });

    it('should answer no-store with the query, kinds and scope echoed', async () => {
      const res = await search({ q: '  search-p  ' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.query).toBe('search-p');
      expect(res.body.kinds).toEqual([
        'organization',
        'item',
        'version',
        'provider',
        'architecture',
        'artifact',
        'user',
      ]);
      expect(res.body.scope).toBe('');
      expect(res.body.next).toBeNull();
      expect(res.body.truncated).toBeUndefined();
    });

    it('should answer only public items to an anonymous caller', async () => {
      const res = await search({ q: 'search-p' });
      expect(res.statusCode).toBe(200);
      const names = res.body.results.map(row => row.name);
      expect(names).toContain(publicBoxName);
      expect(names).not.toContain(privateBoxName);
      const hit = res.body.results.find(row => row.name === publicBoxName);
      expect(hit).toEqual({
        kind: 'item',
        id: `boxes/${orgName}/${publicBoxName}`,
        collection: 'boxes',
        org: orgName,
        name: publicBoxName,
        version: '',
        provider: '',
        architecture: '',
        anchor: '',
        source: null,
        score: 2,
        title: publicBoxName,
        subtitle: `${orgName} · boxes`,
        matched: 'name',
        highlight: { name: { text: publicBoxName, spans: [[0, 8]] } },
        facets: { collection: 'boxes' },
      });
      expect(res.body.results.some(row => row.kind === 'organization')).toBe(false);
      expect(res.body.results.some(row => row.kind === 'user')).toBe(false);
    });

    it('should match whitelisted metadata keys and never the password', async () => {
      const distro = await search({ q: `zebradistro${uniqueId}` });
      expect(distro.statusCode).toBe(200);
      const hit = distro.body.results.find(row => row.name === publicBoxName);
      expect(hit).toBeDefined();
      expect(hit.matched).toBe('metadata.distro');
      expect(hit.score).toBe(0);
      expect(hit.highlight).toEqual({
        'metadata.distro': {
          text: `zebradistro${uniqueId}`,
          spans: [[0, `zebradistro${uniqueId}`.length]],
        },
      });
      expect(JSON.stringify(distro.body)).not.toContain(`hunter${uniqueId}secret`);

      const password = await search({ q: `hunter${uniqueId}secret` });
      expect(password.statusCode).toBe(200);
      expect(password.body.results).toEqual([]);
    });

    it('should answer private rows of the own organization to a member', async () => {
      const res = await search({ q: 'search-p' }, memberToken);
      expect(res.statusCode).toBe(200);
      const names = res.body.results.map(row => row.name);
      expect(names).toContain(publicBoxName);
      expect(names).toContain(privateBoxName);

      const orgs = await search({ q: orgName, kinds: 'organization' }, memberToken);
      expect(orgs.statusCode).toBe(200);
      expect(orgs.body.results).toEqual([
        {
          kind: 'organization',
          id: orgName,
          collection: null,
          org: orgName,
          name: orgName,
          version: '',
          provider: '',
          architecture: '',
          anchor: '',
          source: null,
          score: 3,
          title: orgName,
          subtitle: '',
          matched: 'name',
          highlight: { name: { text: orgName, spans: [[0, orgName.length]] } },
          facets: {},
        },
      ]);
    });

    it('should answer a guest the private rows flagged for guests only', async () => {
      const boxes = await search({ q: 'search-p' }, guestToken);
      expect(boxes.statusCode).toBe(200);
      const names = boxes.body.results.map(row => row.name);
      expect(names).toContain(publicBoxName);
      expect(names).toContain(privateBoxName);
      expect(names).not.toContain(hiddenBoxName);

      const asMember = await search({ q: 'search-p' }, memberToken);
      expect(asMember.body.results.map(row => row.name)).toContain(hiddenBoxName);

      const downloads = await search({ q: `dl-${uniqueId}`, kinds: 'item' }, guestToken);
      expect(downloads.statusCode).toBe(200);
      const downloadNames = downloads.body.results.map(row => row.name);
      expect(downloadNames).toContain(privateDownloadName);
      expect(downloadNames).not.toContain(hiddenDownloadName);
      expect(downloadNames).not.toContain(unpublishedDownloadName);
      expect(downloads.body.results.some(row => row.kind === 'user')).toBe(false);

      const organizations = await search({ q: orgName, kinds: 'organization' }, guestToken);
      expect(organizations.body.results.map(row => row.name)).toContain(orgName);
    });

    it('should answer downloads by the three-line visibility rule', async () => {
      const anonymous = await search({ q: `dl-${uniqueId}`, kinds: 'item' });
      expect(anonymous.statusCode).toBe(200);
      expect(anonymous.body.results).toEqual([]);
      expect(anonymous.body.counts).toEqual({ item: { value: 0, relation: 'eq' } });

      const asMember = await search({ q: `dl-${uniqueId}`, kinds: 'item' }, memberToken);
      expect(asMember.statusCode).toBe(200);
      const memberNames = asMember.body.results.map(row => row.name);
      expect(memberNames).toContain(privateDownloadName);
      expect(memberNames).toContain(hiddenDownloadName);
      expect(memberNames).toContain(unpublishedDownloadName);
      expect(asMember.body.results.every(row => row.collection === 'downloads')).toBe(true);
      expect(
        asMember.body.results.every(row => row.facets.collection === 'downloads' && row.id)
      ).toBe(true);

      const asAdmin = await search({ q: `dl-${uniqueId}`, kinds: 'item' }, adminToken);
      expect(asAdmin.statusCode).toBe(200);
      const adminNames = asAdmin.body.results.map(row => row.name);
      expect(adminNames).toContain(privateDownloadName);
      expect(adminNames).not.toContain(unpublishedDownloadName);
    });

    it('should never answer users to a plain member', async () => {
      const res = await search({ q: memberName }, memberToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.results.some(row => row.kind === 'user')).toBe(false);
    });

    it('should answer users to a global admin without password or suspended fields', async () => {
      const res = await search({ q: memberName, kinds: 'user' }, adminToken);
      expect(res.statusCode).toBe(200);
      const hit = res.body.results.find(row => row.name === memberName);
      expect(hit).toBeDefined();
      expect(hit.kind).toBe('user');
      expect(hit.id).toBe(`${hit.org}/${memberName}`);
      expect(hit.title).toBe(memberName);
      expect(hit.matched).toBe('username');
      expect(hit.score).toBe(3);
      expect(hit.facets).toEqual({});
      expect(Object.keys(hit).sort()).toEqual([...ROW_KEYS].sort());
    });

    it('should match an artifact by checksum prefix', async () => {
      const prefix = checksum.slice(0, 12);
      const res = await search({ q: prefix });
      expect(res.statusCode).toBe(200);
      const hit = res.body.results.find(row => row.kind === 'artifact');
      expect(hit).toEqual({
        kind: 'artifact',
        id: `boxes/${orgName}/${publicBoxName}/1.0.0/virtualbox/amd64/${fileName}`,
        collection: 'boxes',
        org: orgName,
        name: publicBoxName,
        version: '1.0.0',
        provider: 'virtualbox',
        architecture: 'amd64',
        anchor: fileName,
        source: null,
        score: 0,
        title: fileName,
        subtitle: `${orgName} · boxes · ${publicBoxName} · 1.0.0 · virtualbox · amd64`,
        matched: 'checksum',
        highlight: { checksum: { text: checksum, spans: [[0, 12]] } },
        facets: { collection: 'boxes' },
      });
    });

    it('should not match a checksum prefix shorter than 6 characters', async () => {
      const res = await search({ q: checksum.slice(0, 5) });
      expect(res.statusCode).toBe(200);
      expect(res.body.results.some(row => row.title === fileName)).toBe(false);
    });
  });

  describe('score and order', () => {
    it('should score 3, 2, 1 and 0 and sort by score, position, title and id', async () => {
      const res = await search({ q: rankTerm, kinds: 'item', limit: 10 });
      expect(res.statusCode).toBe(200);
      expect(res.body.results.map(row => [row.name, row.score])).toEqual([
        [exactName, 3],
        [prefixName, 2],
        [nearName, 1],
        [farName, 1],
        [elsewhereName, 0],
      ]);
      expect(res.body.results[2].highlight).toEqual({
        name: { text: nearName, spans: [[3, 3 + rankTerm.length]] },
      });
      expect(res.body.results[4].matched).toBe('description');
      expect(res.body.results[4].highlight).toEqual({
        description: {
          text: `described as ${rankTerm}`,
          spans: [[13, 13 + rankTerm.length]],
        },
      });
    });

    it('should count every match of each kind exactly', async () => {
      const res = await search({ q: rankTerm, kinds: 'item', limit: 2 });
      expect(res.statusCode).toBe(200);
      expect(res.body.kinds).toEqual(['item']);
      expect(res.body.counts).toEqual({ item: { value: 5, relation: 'eq' } });
      expect(res.body.results).toHaveLength(2);
    });

    it('should answer no cursor and the first limit rows of each kind for several kinds', async () => {
      const res = await search({ q: rankTerm, kinds: 'item,organization', limit: 1 });
      expect(res.statusCode).toBe(200);
      expect(res.body.kinds).toEqual(['organization', 'item']);
      expect(res.body.counts).toEqual({
        organization: { value: 0, relation: 'eq' },
        item: { value: 5, relation: 'eq' },
      });
      expect(res.body.results.map(row => row.name)).toEqual([exactName]);
      expect(res.body.next).toBeNull();
    });

    it('should page one kind through its cursor with no overlap', async () => {
      const first = await search({ q: rankTerm, kinds: 'item', limit: 2 });
      expect(first.body.results.map(row => row.name)).toEqual([exactName, prefixName]);
      expect(typeof first.body.next).toBe('string');

      const second = await search({
        q: rankTerm,
        kinds: 'item',
        limit: 2,
        after: first.body.next,
      });
      expect(second.statusCode).toBe(200);
      expect(second.body.results.map(row => row.name)).toEqual([nearName, farName]);
      expect(second.body.counts).toEqual({ item: { value: 5, relation: 'eq' } });
      expect(typeof second.body.next).toBe('string');

      const third = await search({
        q: rankTerm,
        kinds: 'item',
        limit: 2,
        after: second.body.next,
      });
      expect(third.body.results.map(row => row.name)).toEqual([elsewhereName]);
      expect(third.body.next).toBeNull();
    });

    it('should answer the first page for a bad cursor or one minted for another search', async () => {
      const garbage = await search({
        q: rankTerm,
        kinds: 'item',
        limit: 2,
        after: '!!not-a-cursor',
      });
      expect(garbage.statusCode).toBe(200);
      expect(garbage.body.results.map(row => row.name)).toEqual([exactName, prefixName]);

      const other = await search({ q: 'search-p', kinds: 'item', limit: 1 });
      expect(typeof other.body.next).toBe('string');
      const foreign = await search({
        q: rankTerm,
        kinds: 'item',
        limit: 2,
        after: other.body.next,
      });
      expect(foreign.body.results.map(row => row.name)).toEqual([exactName, prefixName]);
    });
  });

  describe('scope', () => {
    it('should narrow to one organization, compared case-insensitively, and echo the scope', async () => {
      const unscoped = await search({ q: 'search-p', kinds: 'item' });
      expect(unscoped.body.results.map(row => row.name)).toContain(otherBoxName);

      const scope = `org:${orgName}`;
      const scoped = await search({ q: 'search-p', kinds: 'item', scope });
      expect(scoped.statusCode).toBe(200);
      expect(scoped.body.scope).toBe(scope);
      expect(scoped.body.results.map(row => row.name)).toContain(publicBoxName);
      expect(scoped.body.results.every(row => row.org === orgName)).toBe(true);

      const upper = await search({
        q: 'search-p',
        kinds: 'item',
        scope: `org:${otherOrgName.toUpperCase()}`,
      });
      expect(upper.body.results.map(row => row.name)).toEqual([otherBoxName]);
      expect(upper.body.counts).toEqual({ item: { value: 1, relation: 'eq' } });
    });

    it('should narrow to one collection', async () => {
      const unscoped = await search({ q: String(uniqueId) }, memberToken);
      expect(unscoped.body.results.some(row => row.collection === 'boxes')).toBe(true);

      const scoped = await search(
        { q: String(uniqueId), scope: 'collection:downloads', limit: 50 },
        memberToken
      );
      expect(scoped.statusCode).toBe(200);
      expect(scoped.body.scope).toBe('collection:downloads');
      expect(scoped.body.results.length).toBeGreaterThan(0);
      expect(scoped.body.results.every(row => row.collection === 'downloads')).toBe(true);
      expect(scoped.body.results.map(row => row.name)).toContain(privateDownloadName);
      expect(scoped.body.counts.organization).toEqual({ value: 0, relation: 'eq' });
    });

    it('should treat a bad scope as no scope', async () => {
      const res = await search({ q: 'search-p', kinds: 'item', scope: 'bogus' });
      expect(res.statusCode).toBe(200);
      expect(res.body.scope).toBe('');
      expect(res.body.results.map(row => row.name)).toContain(otherBoxName);
    });
  });

  describe('GET /opensearch.xml', () => {
    it('should describe the unnamed hostname with the default brand', async () => {
      const res = await opensearchOf();
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/opensearchdescription+xml');
      expect(res.headers['cache-control']).toBe('no-cache');
      const text = res.body.toString('utf8');
      expect(text).toContain(
        '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">'
      );
      expect(text).toContain('<ShortName>BoxVault</ShortName>');
      expect(text).toContain('<Description>Search BoxVault</Description>');
      expect(text).toContain('<InputEncoding>UTF-8</InputEncoding>');
      expect(text).toContain('<Image>http://localhost:3000/brand/boxvault/mark.svg</Image>');
      expect(text).toContain(
        '<Url type="text/html" template="http://localhost:3000/search?q={searchTerms}"/>'
      );
    });

    it('should describe a named hostname with its brand and origin', async () => {
      const named = await opensearchOf('downloads.test');
      expect(named.statusCode).toBe(200);
      expect(named.headers['content-type']).toContain('application/opensearchdescription+xml');
      const text = named.body.toString('utf8');
      expect(text).toContain('<ShortName>Test Downloads</ShortName>');
      expect(text).toContain('<Description>Search Test Downloads</Description>');
      expect(text).toContain('<Image>http://localhost:3000/brand/test/mark.svg</Image>');
      expect(text).toContain(
        '<Url type="text/html" template="http://localhost:3000/search?q={searchTerms}"/>'
      );

      const face = await opensearchOf('face.test');
      expect(face.body.toString('utf8')).toContain(
        '<Url type="text/html" template="https://face.test/search?q={searchTerms}"/>'
      );
    });
  });
});
