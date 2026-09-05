import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authConfigPath = path.join(__dirname, '../app/config/auth.test.config.yaml');

const ISSUER = 'https://scim-idp.example';
const UNDISCOVERED_ISSUER = 'https://undiscovered-idp.example';
const AUDIENCE = 'boxvault';
const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const USER_EXTENSION = 'urn:startcloud:scim:schemas:extension:1.0:User';
const GROUP_EXTENSION = 'urn:startcloud:scim:schemas:extension:1.0:Group';
const SCIM_TYPE = 'application/scim+json';

const idpKeys = await generateKeyPair('RS256');
const otherKeys = await generateKeyPair('RS256');
const idpJwk = { ...(await exportJWK(idpKeys.publicKey)), kid: 'scim-1', alg: 'RS256', use: 'sig' };

const jwksServer = createServer((req, res) => {
  void req;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ keys: [idpJwk] }));
});
await new Promise(resolve => {
  jwksServer.listen(0, '127.0.0.1', resolve);
});
const jwksUri = `http://127.0.0.1:${jwksServer.address().port}/jwks`;

const passThrough = () => (req, res, next) => {
  void req;
  void res;
  next();
};

jest.unstable_mockModule('../app/auth/passport.js', () => ({
  passport: { initialize: passThrough, session: passThrough, use: jest.fn() },
  initializeStrategies: jest.fn().mockResolvedValue(),
  getOidcConfiguration: jest.fn(name =>
    name === 'scimidp' ? { serverMetadata: () => ({ jwks_uri: jwksUri }) } : undefined
  ),
  buildAuthorizationUrl: jest.fn(),
  buildEndSessionUrl: jest.fn(),
  handleOidcCallback: jest.fn(),
}));

const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const jwt = (await import('jsonwebtoken')).default;
const { getSecureBoxPath } = await import('../app/utils/paths.js');

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const writeAuthConfig = mutate => {
  const original = fs.readFileSync(authConfigPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(authConfigPath, yaml.dump(config));
  return () => fs.writeFileSync(authConfigPath, original);
};

const enableScim = config => {
  config.auth.scim = { enabled: { value: true }, audience: { value: AUDIENCE } };
  config.auth.oidc.providers = {
    scimidp: {
      enabled: { value: true },
      issuer: { value: ISSUER },
      client_id: { value: 'boxvault-scim' },
    },
    undiscovered: { enabled: { value: true }, issuer: { value: UNDISCOVERED_ISSUER } },
  };
};

const mintToken = ({
  audience = AUDIENCE,
  issuer = ISSUER,
  key = idpKeys.privateKey,
  expiresAt = '5m',
  claims = {},
} = {}) =>
  new SignJWT({ scope: 'scim', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'scim-1' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);

describe('SCIM receiver', () => {
  const uniqueId = Date.now().toString(36);
  const hexId = Date.now().toString(16).toUpperCase().slice(-5);
  const userUuid = `user-uuid-${uniqueId}`;
  const secondUserUuid = `user-uuid-two-${uniqueId}`;
  const ghostUuid = `ghost-uuid-${uniqueId}`;
  const orgUuid = `org-uuid-${uniqueId}`;
  const customerId = `A${hexId}`;
  let restoreConfig;
  let token;
  let userId;
  let secondUserId;
  let ownerGroupId;
  let memberGroupId;

  const scimPost = (route, body) =>
    request(app)
      .post(`/scim/v2${route}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', SCIM_TYPE)
      .send(JSON.stringify(body));

  const scimPut = (route, body) =>
    request(app)
      .put(`/scim/v2${route}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', SCIM_TYPE)
      .send(JSON.stringify(body));

  const scimGet = (route, query = {}) =>
    request(app).get(`/scim/v2${route}`).set('Authorization', `Bearer ${token}`).query(query);

  const scimDelete = route =>
    request(app).delete(`/scim/v2${route}`).set('Authorization', `Bearer ${token}`);

  const userBody = (overrides = {}) => ({
    schemas: [USER_SCHEMA, USER_EXTENSION],
    externalId: userUuid,
    userName: `scim.user.${uniqueId}`,
    displayName: 'Scim User',
    emails: [{ value: `scim-user-${uniqueId}@example.com`, primary: true }],
    active: true,
    [USER_EXTENSION]: { emailVerified: true },
    ...overrides,
  });

  const groupBody = (role, overrides = {}) => ({
    schemas: [GROUP_SCHEMA, GROUP_EXTENSION],
    externalId: `${orgUuid}:${role}`,
    displayName: `Scim Org ${uniqueId}`,
    members: [{ value: userUuid }],
    [GROUP_EXTENSION]: {
      orgUuid,
      role,
      customerId,
      personal: false,
      email: `org-${uniqueId}@example.com`,
      description: 'Mirrored organization',
      logo: 'https://logo.example/org.png',
      url: 'https://org.example',
      telephone: '+1 555 0100',
      locale: 'en-US',
      timezone: 'America/Chicago',
      address: { streetAddress: '1 Main St', locality: 'Springfield' },
      accessMode: 'invite_only',
      defaultRole: 'admin',
    },
    ...overrides,
  });

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    restoreConfig = writeAuthConfig(enableScim);
    token = await mintToken();
  });

  afterAll(async () => {
    restoreConfig();
    await new Promise(resolve => {
      jwksServer.close(resolve);
    });
    await db.user.destroy({ where: { username: `scim.user.${uniqueId}` } });
    await db.organization.destroy({ where: { external_org_id: orgUuid } });
  });

  describe('scimAuth', () => {
    it('should refuse every request while SCIM is disabled', async () => {
      const restore = writeAuthConfig(config => {
        config.auth.scim.enabled = { value: false };
      });
      try {
        const res = await scimGet('/Users', { filter: `externalId eq "${userUuid}"` });
        expect(res.statusCode).toBe(403);
        expect(res.headers['content-type']).toContain(SCIM_TYPE);
        expect(res.body).toMatchObject({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '403',
        });
      } finally {
        restore();
      }
    });

    it('should refuse a request without a bearer token', async () => {
      const res = await request(app).get('/scim/v2/Users');
      expect(res.statusCode).toBe(401);
      expect(res.body.detail).toBe('Missing bearer token');
    });

    it('should refuse a token that is not a JWT', async () => {
      const res = await request(app).get('/scim/v2/Users').set('Authorization', 'Bearer not-a-jwt');
      expect(res.statusCode).toBe(401);
      expect(res.body.detail).toBe('Malformed bearer token');
    });

    it('should refuse a three-part token that does not decode', async () => {
      const res = await request(app)
        .get('/scim/v2/Users')
        .set('Authorization', 'Bearer aaa.bbb.ccc');
      expect(res.statusCode).toBe(401);
      expect(res.body.detail).toBe('Malformed bearer token');
    });

    it('should refuse a token without an issuer', async () => {
      const unsigned = jwt.sign({ scope: 'scim' }, 'whatever');
      const res = await request(app)
        .get('/scim/v2/Users')
        .set('Authorization', `Bearer ${unsigned}`);
      expect(res.statusCode).toBe(401);
      expect(res.body.detail).toBe('Token carries no issuer');
    });

    it('should refuse a token of an unknown issuer', async () => {
      const foreign = await mintToken({ issuer: 'https://someone-else.example' });
      const res = await request(app)
        .get('/scim/v2/Users')
        .set('Authorization', `Bearer ${foreign}`);
      expect(res.statusCode).toBe(401);
      expect(res.body.detail).toBe('Unknown token issuer');
    });

    it('should answer 503 while the provider is not discovered yet', async () => {
      const early = await mintToken({ issuer: UNDISCOVERED_ISSUER });
      const res = await request(app).get('/scim/v2/Users').set('Authorization', `Bearer ${early}`);
      expect(res.statusCode).toBe(503);
    });

    it('should refuse to validate without a configured audience', async () => {
      const restore = writeAuthConfig(config => {
        delete config.auth.scim.audience;
      });
      try {
        const res = await scimGet('/Users', { filter: `externalId eq "${userUuid}"` });
        expect(res.statusCode).toBe(403);
        expect(res.body.detail).toBe('SCIM audience is not configured');
      } finally {
        restore();
      }
    });

    it('should refuse a token signed by another key', async () => {
      const forged = await mintToken({ key: otherKeys.privateKey });
      const res = await request(app).get('/scim/v2/Users').set('Authorization', `Bearer ${forged}`);
      expect(res.statusCode).toBe(401);
      expect(res.body.detail).toBe('Invalid or expired token');
    });

    it('should refuse an expired token', async () => {
      const expired = await mintToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
      const res = await request(app)
        .get('/scim/v2/Users')
        .set('Authorization', `Bearer ${expired}`);
      expect(res.statusCode).toBe(401);
    });

    it('should refuse a token minted for another audience', async () => {
      const wrongAudience = await mintToken({ audience: 'someone-else' });
      const res = await request(app)
        .get('/scim/v2/Users')
        .set('Authorization', `Bearer ${wrongAudience}`);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /scim/v2/Users', () => {
    it('should reject a resource without externalId', async () => {
      const res = await scimPost('/Users', userBody({ externalId: undefined }));
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('invalidValue');
    });

    it('should reject a resource without an email', async () => {
      const res = await scimPost('/Users', userBody({ userName: 'nomail', emails: undefined }));
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('invalidValue');
    });

    it('should provision the user, assign the id and answer the resource location', async () => {
      const res = await scimPost('/Users', userBody());
      expect(res.statusCode).toBe(201);
      expect(res.headers['content-type']).toContain(SCIM_TYPE);
      expect(res.body.schemas).toEqual([USER_SCHEMA, USER_EXTENSION]);
      expect(res.body.externalId).toBe(userUuid);
      expect(res.body.userName).toBe(`scim.user.${uniqueId}`);
      expect(res.body.displayName).toBe('Scim User');
      expect(res.body.active).toBe(true);
      expect(res.body[USER_EXTENSION]).toEqual({ emailVerified: true, primaryOrgUuid: null });
      expect(res.body.meta.resourceType).toBe('User');
      expect(res.body.meta.location).toMatch(/\/scim\/v2\/Users\/\d+$/);
      expect(res.headers.location).toBe(res.body.meta.location);
      userId = Number(res.body.id);

      const user = await db.user.findByPk(userId);
      expect(user.authProvider).toBe('oidc');
      expect(user.verified).toBe(true);
      const credential = await db.credential.findOne({
        where: { provider: ISSUER, subject: userUuid },
      });
      expect(credential.user_id).toBe(userId);
    });

    it('should answer 409 uniqueness for a second push of the same externalId', async () => {
      const res = await scimPost('/Users', userBody());
      expect(res.statusCode).toBe(409);
      expect(res.body.scimType).toBe('uniqueness');
    });

    it('should refuse to link an existing local account when the email is not verified', async () => {
      const local = await db.user.create({
        username: `local-unverified-${uniqueId}`,
        email: `local-unverified-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
      });
      const res = await scimPost(
        '/Users',
        userBody({
          externalId: `unverified-${uniqueId}`,
          userName: `local-unverified-${uniqueId}`,
          emails: [{ value: local.email, primary: true }],
          [USER_EXTENSION]: { emailVerified: false },
        })
      );
      expect(res.statusCode).toBe(409);
      expect(res.body.scimType).toBe('uniqueness');
      await local.destroy();
    });

    it('should link an existing local account when the email is verified', async () => {
      const local = await db.user.create({
        username: `local-linked-${uniqueId}`,
        email: `local-linked-${uniqueId}@example.com`,
        password: 'password',
        verified: true,
      });
      const res = await scimPost(
        '/Users',
        userBody({
          externalId: `linked-${uniqueId}`,
          userName: `local-linked-${uniqueId}`,
          emails: [{ value: local.email, primary: true }],
        })
      );
      expect(res.statusCode).toBe(201);
      expect(Number(res.body.id)).toBe(local.id);
      await local.reload();
      expect(local.authProvider).toBe('oidc');
      expect(local.externalId).toBe(`linked-${uniqueId}`);
      await local.destroy();
    });

    it('should provision a second user for the group tests', async () => {
      const res = await scimPost(
        '/Users',
        userBody({
          externalId: secondUserUuid,
          userName: `scim.second.${uniqueId}`,
          displayName: 'Second User',
          emails: [{ value: `scim-second-${uniqueId}@example.com`, primary: true }],
        })
      );
      expect(res.statusCode).toBe(201);
      secondUserId = Number(res.body.id);
    });
  });

  describe('GET /scim/v2/Users', () => {
    it('should refuse any filter other than externalId eq', async () => {
      const res = await scimGet('/Users', { filter: 'userName eq "x"' });
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('invalidFilter');
    });

    it('should answer the one resource holding the externalId', async () => {
      const res = await scimGet('/Users', { filter: `externalId eq "${userUuid}"` });
      expect(res.statusCode).toBe(200);
      expect(res.body.totalResults).toBe(1);
      expect(res.body.Resources[0].id).toBe(String(userId));
      expect(res.body.Resources[0][USER_EXTENSION].primaryOrgUuid).toBeNull();
    });

    it('should answer an empty list for an unknown externalId', async () => {
      const res = await scimGet('/Users', { filter: 'externalId eq "nobody"' });
      expect(res.statusCode).toBe(200);
      expect(res.body.totalResults).toBe(0);
      expect(res.body.Resources).toEqual([]);
    });

    it('should answer an empty list for an empty externalId', async () => {
      const res = await scimGet('/Users', { filter: 'externalId eq ""' });
      expect(res.statusCode).toBe(200);
      expect(res.body.totalResults).toBe(0);
    });
  });

  describe('POST /scim/v2/Groups', () => {
    it('should reject a malformed externalId', async () => {
      const res = await scimPost('/Groups', groupBody('owner', { externalId: 'nope' }));
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('invalidValue');
      const notText = await scimPost('/Groups', groupBody('owner', { externalId: 5 }));
      expect(notText.statusCode).toBe(400);
      const badRole = await scimPost(
        '/Groups',
        groupBody('owner', { externalId: `${orgUuid}:boss` })
      );
      expect(badRole.statusCode).toBe(400);
    });

    it('should reject a filter that is not a single string', async () => {
      const res = await scimGet('/Groups', { filter: ['a', 'b'] });
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('invalidFilter');
    });

    it('should reject an extension that contradicts the externalId', async () => {
      const res = await scimPost(
        '/Groups',
        groupBody('owner', { [GROUP_EXTENSION]: { orgUuid: 'another-org', role: 'owner' } })
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('orgUuid');
    });

    it('should reject an extension role that contradicts the externalId', async () => {
      const res = await scimPost(
        '/Groups',
        groupBody('owner', { [GROUP_EXTENSION]: { orgUuid, role: 'member' } })
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.detail).toContain('role');
    });

    it('should mirror the organization and grant the member its role', async () => {
      const res = await scimPost('/Groups', groupBody('owner'));
      expect(res.statusCode).toBe(201);
      expect(res.body.schemas).toEqual([GROUP_SCHEMA, GROUP_EXTENSION]);
      expect(res.body.externalId).toBe(`${orgUuid}:owner`);
      expect(res.body.displayName).toBe(`Scim Org ${uniqueId}`);
      expect(res.body.members).toEqual([{ value: userUuid }]);
      expect(res.body[GROUP_EXTENSION]).toEqual({
        orgUuid,
        role: 'owner',
        customerId,
        personal: false,
      });
      expect(res.headers.location).toBe(res.body.meta.location);
      ownerGroupId = Number(res.body.id);

      const org = await db.organization.findOne({ where: { external_org_id: orgUuid } });
      expect(org.external_issuer).toBe(ISSUER);
      expect(org.name).toBe(`Scim-Org-${uniqueId}`);
      expect(org.display_name).toBe(`Scim Org ${uniqueId}`);
      expect(org.org_code).toBe(customerId);
      expect(org.email).toBe(`org-${uniqueId}@example.com`);
      expect(org.emailHash).toMatch(/^[0-9a-f]{64}$/);
      expect(org.description).toBe('Mirrored organization');
      expect(org.logo).toBe('https://logo.example/org.png');
      expect(org.url).toBe('https://org.example');
      expect(org.telephone).toBe('+1 555 0100');
      expect(org.locale).toBe('en-US');
      expect(org.timezone).toBe('America/Chicago');
      expect(org.address).toEqual({ streetAddress: '1 Main St', locality: 'Springfield' });
      expect(org.access_mode).toBe('invite_only');
      expect(org.default_role).toBe('admin');

      const membership = await db.UserOrg.findUserOrgRole(userId, org.id);
      expect(membership.role).toBe('owner');
    });

    it('should answer 409 uniqueness for a second push of the same group', async () => {
      const res = await scimPost('/Groups', groupBody('owner'));
      expect(res.statusCode).toBe(409);
      expect(res.body.scimType).toBe('uniqueness');
    });

    it('should keep the highest role across groups and ignore ghost members', async () => {
      const res = await scimPost(
        '/Groups',
        groupBody('member', {
          members: [{ value: userUuid }, { value: secondUserUuid }, { value: ghostUuid }],
        })
      );
      expect(res.statusCode).toBe(201);
      memberGroupId = Number(res.body.id);

      const org = await db.organization.findOne({ where: { external_org_id: orgUuid } });
      const first = await db.UserOrg.findUserOrgRole(userId, org.id);
      expect(first.role).toBe('owner');
      const second = await db.UserOrg.findUserOrgRole(secondUserId, org.id);
      expect(second.role).toBe('member');
      const memberships = await db.UserOrg.findAll({ where: { organization_id: org.id } });
      expect(memberships).toHaveLength(2);
    });

    it('should disambiguate the slug when a local organization already holds the name', async () => {
      const takenUuid = `taken-org-${uniqueId}`;
      const local = await db.organization.create({ name: `Taken-Org-${uniqueId}` });
      const res = await scimPost(
        '/Groups',
        groupBody('owner', {
          externalId: `${takenUuid}:owner`,
          displayName: `Taken Org ${uniqueId}`,
          members: [],
          [GROUP_EXTENSION]: { customerId: 'not-hex', accessMode: 'bogus' },
        })
      );
      expect(res.statusCode).toBe(201);
      const mirrored = await db.organization.findOne({ where: { external_org_id: takenUuid } });
      expect(mirrored.name).toBe(`Taken-Org-${uniqueId}-${takenUuid.slice(0, 6)}`);
      expect(mirrored.org_code).toMatch(/^[0-9A-F]{6}$/);
      expect(mirrored.org_code).not.toBe('not-hex');
      expect(mirrored.access_mode).toBe('private');
      expect(mirrored.default_role).toBe('member');
      expect(mirrored.email).toBe('');
      expect(mirrored.logo).toBeNull();
      await mirrored.destroy();
      await local.destroy();
      await db.scimGroup.destroy({ where: { org_uuid: takenUuid } });
    });

    it('should fall back to a uuid slug when the name empties out', async () => {
      const blankUuid = `blank-org-${uniqueId}`;
      const res = await scimPost(
        '/Groups',
        groupBody('member', {
          externalId: `${blankUuid}:member`,
          displayName: '***',
          members: [],
          [GROUP_EXTENSION]: {},
        })
      );
      expect(res.statusCode).toBe(201);
      const mirrored = await db.organization.findOne({ where: { external_org_id: blankUuid } });
      expect(mirrored.name).toBe(`org-${blankUuid.slice(0, 8)}`);
      await mirrored.destroy();
      await db.scimGroup.destroy({ where: { org_uuid: blankUuid } });
    });

    it('should not take a customer id another organization already holds', async () => {
      const heldCode = `B${hexId}`;
      const holder = await db.organization.create({
        name: `Holder-${uniqueId}`,
        org_code: heldCode,
      });
      const clashUuid = `clash-org-${uniqueId}`;
      const res = await scimPost(
        '/Groups',
        groupBody('owner', {
          externalId: `${clashUuid}:owner`,
          displayName: `Clash Org ${uniqueId}`,
          members: [],
          [GROUP_EXTENSION]: { customerId: heldCode },
        })
      );
      expect(res.statusCode).toBe(201);
      const mirrored = await db.organization.findOne({ where: { external_org_id: clashUuid } });
      expect(mirrored.org_code).not.toBe(heldCode);
      expect(mirrored.org_code).toMatch(/^[0-9A-F]{6}$/);
      await mirrored.destroy();
      await holder.destroy();
      await db.scimGroup.destroy({ where: { org_uuid: clashUuid } });
    });

    it('should use the externalId as displayName when none was pushed', async () => {
      const namelessUuid = `nameless-org-${uniqueId}`;
      const res = await scimPost('/Groups', {
        schemas: [GROUP_SCHEMA],
        externalId: `${namelessUuid}:admin`,
        members: 'not-an-array',
      });
      expect(res.statusCode).toBe(201);
      expect(res.body.displayName).toBe(`${namelessUuid}:admin`);
      expect(res.body.members).toEqual([]);
      const mirrored = await db.organization.findOne({ where: { external_org_id: namelessUuid } });
      expect(mirrored.display_name).toBe(mirrored.name);
      await mirrored.destroy();
      await db.scimGroup.destroy({ where: { org_uuid: namelessUuid } });
    });
  });

  describe('GET /scim/v2/Groups', () => {
    it('should refuse any filter other than externalId eq', async () => {
      const res = await scimGet('/Groups', { filter: 'displayName eq "x"' });
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('invalidFilter');
    });

    it('should answer the one group holding the externalId', async () => {
      const res = await scimGet('/Groups', { filter: `externalId eq "${orgUuid}:owner"` });
      expect(res.statusCode).toBe(200);
      expect(res.body.totalResults).toBe(1);
      expect(res.body.Resources[0].id).toBe(String(ownerGroupId));
    });

    it('should answer an empty list for an unknown or malformed externalId', async () => {
      const unknown = await scimGet('/Groups', { filter: 'externalId eq "nobody:owner"' });
      expect(unknown.body.totalResults).toBe(0);
      const malformed = await scimGet('/Groups', { filter: 'externalId eq "malformed"' });
      expect(malformed.body.totalResults).toBe(0);
    });
  });

  describe('PUT /scim/v2/Users/:id', () => {
    it('should answer 404 for an unknown or non-numeric id', async () => {
      const unknown = await scimPut('/Users/999999', userBody());
      expect(unknown.statusCode).toBe(404);
      const nonNumeric = await scimPut('/Users/abc', userBody());
      expect(nonNumeric.statusCode).toBe(404);
    });

    it('should reject a body id that does not match the URL', async () => {
      const res = await scimPut(`/Users/${userId}`, userBody({ id: '42' }));
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('mutability');
    });

    it('should reject a resource without an email', async () => {
      const res = await scimPut(`/Users/${userId}`, userBody({ userName: 'x', emails: [] }));
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('invalidValue');
    });

    it('should refuse to rebind the externalId when the mailbox differs', async () => {
      const res = await scimPut(
        `/Users/${userId}`,
        userBody({
          externalId: `other-${uniqueId}`,
          emails: [{ value: `someone-else-${uniqueId}@example.com`, primary: true }],
        })
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('mutability');
    });

    it('should refuse an externalId already bound to another user', async () => {
      const res = await scimPut(`/Users/${userId}`, userBody({ externalId: secondUserUuid }));
      expect(res.statusCode).toBe(409);
      expect(res.body.scimType).toBe('uniqueness');
    });

    it('should apply the full desired state including suspension', async () => {
      const res = await scimPut(
        `/Users/${userId}`,
        userBody({
          displayName: 'Renamed User',
          active: false,
          preferredLanguage: 'es-MX',
          locale: 'es-MX',
          timezone: 'Europe/Madrid',
          photos: [{ value: 'https://cdn.example/avatar.png', type: 'photo' }],
          entitlements: [{ value: 'seat', type: 'license' }],
        })
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.active).toBe(false);
      expect(res.body.displayName).toBe('Renamed User');
      expect(res.body.preferredLanguage).toBe('es-MX');
      expect(res.body.timezone).toBe('Europe/Madrid');
      expect(res.body.photos).toEqual([{ value: 'https://cdn.example/avatar.png', type: 'photo' }]);
      expect(res.body.entitlements).toEqual([{ value: 'seat', type: 'license' }]);
      const user = await db.user.findByPk(userId);
      expect(user.suspended).toBe(true);
      expect(user.avatar_url).toBe('https://cdn.example/avatar.png');
    });

    it('should drop an over-long optional attribute instead of failing the push', async () => {
      const res = await scimPut(
        `/Users/${userId}`,
        userBody({ active: false, preferredLanguage: 'x'.repeat(40), timezone: 'Europe/Madrid' })
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.preferredLanguage).toBeUndefined();
      expect(res.body.timezone).toBe('Europe/Madrid');
    });

    it('should adopt a pushed externalId for the same mailbox', async () => {
      const adoptedUuid = `adopted-${uniqueId}`;
      const res = await scimPut(`/Users/${userId}`, userBody({ externalId: adoptedUuid }));
      expect(res.statusCode).toBe(200);
      expect(res.body.externalId).toBe(adoptedUuid);
      const credential = await db.credential.findOne({
        where: { provider: ISSUER, user_id: userId },
      });
      expect(credential.subject).toBe(adoptedUuid);

      const back = await scimPut(`/Users/${userId}`, userBody());
      expect(back.statusCode).toBe(200);
      expect(back.body.externalId).toBe(userUuid);
    });

    it('should point the user at a mirrored primary organization', async () => {
      const res = await scimPut(
        `/Users/${userId}`,
        userBody({ [USER_EXTENSION]: { emailVerified: true, primaryOrgUuid: orgUuid } })
      );
      expect(res.statusCode).toBe(200);
      expect(res.body[USER_EXTENSION].primaryOrgUuid).toBe(orgUuid);

      const org = await db.organization.findOne({ where: { external_org_id: orgUuid } });
      const user = await db.user.findByPk(userId);
      expect(user.primary_organization_id).toBe(org.id);
      const membership = await db.UserOrg.findUserOrgRole(userId, org.id);
      expect(membership.is_primary).toBe(true);

      const listed = await scimGet('/Users', { filter: `externalId eq "${userUuid}"` });
      expect(listed.body.Resources[0][USER_EXTENSION].primaryOrgUuid).toBe(orgUuid);
    });

    it('should skip a primary organization that is not mirrored yet', async () => {
      const res = await scimPut(
        `/Users/${userId}`,
        userBody({ [USER_EXTENSION]: { emailVerified: true, primaryOrgUuid: 'not-yet-mirrored' } })
      );
      expect(res.statusCode).toBe(200);
      const org = await db.organization.findOne({ where: { external_org_id: orgUuid } });
      const user = await db.user.findByPk(userId);
      expect(user.primary_organization_id).toBe(org.id);
    });

    it('should never steal the primary pointer from a local organization', async () => {
      const localOrg = await db.organization.create({ name: `LocalPrimary-${uniqueId}` });
      await db.UserOrg.create({
        user_id: secondUserId,
        organization_id: localOrg.id,
        role: 'member',
        is_primary: true,
      });
      await db.user.update(
        { primary_organization_id: localOrg.id },
        { where: { id: secondUserId } }
      );

      const res = await scimPut(
        `/Users/${secondUserId}`,
        userBody({
          externalId: secondUserUuid,
          userName: `scim.second.${uniqueId}`,
          emails: [{ value: `scim-second-${uniqueId}@example.com`, primary: true }],
          [USER_EXTENSION]: { emailVerified: true, primaryOrgUuid: orgUuid },
        })
      );
      expect(res.statusCode).toBe(200);
      const user = await db.user.findByPk(secondUserId);
      expect(user.primary_organization_id).toBe(localOrg.id);
      await db.UserOrg.destroy({ where: { user_id: secondUserId, organization_id: localOrg.id } });
      await db.user.update({ primary_organization_id: null }, { where: { id: secondUserId } });
      await localOrg.destroy();
    });
  });

  describe('PUT /scim/v2/Groups/:id', () => {
    it('should answer 404 for an unknown or non-numeric id', async () => {
      const unknown = await scimPut('/Groups/999999', groupBody('owner'));
      expect(unknown.statusCode).toBe(404);
      const nonNumeric = await scimPut('/Groups/abc', groupBody('owner'));
      expect(nonNumeric.statusCode).toBe(404);
    });

    it('should reject a body id that does not match the URL', async () => {
      const res = await scimPut(`/Groups/${ownerGroupId}`, groupBody('owner', { id: '42' }));
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('mutability');
    });

    it('should reject an externalId that does not match the stored group', async () => {
      const res = await scimPut(
        `/Groups/${ownerGroupId}`,
        groupBody('owner', { externalId: `${orgUuid}:admin` })
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('mutability');
    });

    it('should reject an extension role that contradicts the stored group', async () => {
      const res = await scimPut(
        `/Groups/${ownerGroupId}`,
        groupBody('owner', { externalId: undefined, [GROUP_EXTENSION]: { role: 'member' } })
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.scimType).toBe('mutability');
    });

    it('should apply members, the display name, a drifted customer id and a cleared profile', async () => {
      const healedCode = `C${hexId}`;
      const res = await scimPut(
        `/Groups/${ownerGroupId}`,
        groupBody('owner', {
          externalId: undefined,
          displayName: `Scim Org Renamed ${uniqueId}`,
          members: [{ value: secondUserUuid }],
          [GROUP_EXTENSION]: { customerId: healedCode, personal: true },
        })
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.members).toEqual([{ value: secondUserUuid }]);
      expect(res.body[GROUP_EXTENSION]).toEqual({
        orgUuid,
        role: 'owner',
        customerId: healedCode,
        personal: true,
      });

      const org = await db.organization.findOne({ where: { external_org_id: orgUuid } });
      expect(org.name).toBe(`Scim-Org-${uniqueId}`);
      expect(org.display_name).toBe(`Scim Org Renamed ${uniqueId}`);
      expect(org.org_code).toBe(healedCode);
      expect(org.email).toBe('');
      expect(org.emailHash).toBe('');
      expect(org.description).toBe('');
      expect(org.logo).toBeNull();
      expect(org.address).toBeNull();
      expect(org.access_mode).toBe('private');
      expect(org.default_role).toBe('member');

      const first = await db.UserOrg.findUserOrgRole(userId, org.id);
      expect(first.role).toBe('member');
      const second = await db.UserOrg.findUserOrgRole(secondUserId, org.id);
      expect(second.role).toBe('owner');
    });

    it('should flag the organization as personal for its members', async () => {
      const role = await db.role.findOne({ where: { name: 'user' } });
      const user = await db.user.findByPk(userId);
      await user.update({ suspended: false });
      await user.setRoles([role]);
      const session = jwt.sign({ id: userId }, 'test-secret', {
        expiresIn: '1h',
        ...TEST_JWT_CLAIMS,
      });
      const res = await request(app).get('/api/user/organizations').set('x-access-token', session);
      expect(res.statusCode).toBe(200);
      const mirrored = res.body.find(entry => entry.organization.name === `Scim-Org-${uniqueId}`);
      expect(mirrored.personal).toBe(true);
      expect(mirrored.isPrimary).toBe(true);
      expect(mirrored.role).toBe('member');
    });
  });

  describe('DELETE /scim/v2/Groups/:id', () => {
    it('should answer 404 for an unknown or non-numeric id', async () => {
      const unknown = await scimDelete('/Groups/999999');
      expect(unknown.statusCode).toBe(404);
      const nonNumeric = await scimDelete('/Groups/abc');
      expect(nonNumeric.statusCode).toBe(404);
    });

    it('should recompute memberships while other role groups remain', async () => {
      const res = await scimDelete(`/Groups/${memberGroupId}`);
      expect(res.statusCode).toBe(204);
      const org = await db.organization.findOne({ where: { external_org_id: orgUuid } });
      expect(org).not.toBeNull();
      expect(await db.UserOrg.findUserOrgRole(userId, org.id)).toBeNull();
      const second = await db.UserOrg.findUserOrgRole(secondUserId, org.id);
      expect(second.role).toBe('owner');
    });

    it('should delete the mirrored organization with its last role group', async () => {
      const org = await db.organization.findOne({ where: { external_org_id: orgUuid } });
      const dirPath = getSecureBoxPath(org.name);
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'marker.txt'), 'x');

      const res = await scimDelete(`/Groups/${ownerGroupId}`);
      expect(res.statusCode).toBe(204);
      expect(await db.organization.findOne({ where: { external_org_id: orgUuid } })).toBeNull();
      expect(await db.scimGroup.count({ where: { org_uuid: orgUuid } })).toBe(0);
      expect(fs.existsSync(dirPath)).toBe(false);
    });
  });

  describe('DELETE /scim/v2/Users/:id', () => {
    it('should answer 404 for an unknown or non-numeric id', async () => {
      const unknown = await scimDelete('/Users/999999');
      expect(unknown.statusCode).toBe(404);
      const nonNumeric = await scimDelete('/Users/abc');
      expect(nonNumeric.statusCode).toBe(404);
    });

    it('should remove the user and answer 404 afterwards', async () => {
      const res = await scimDelete(`/Users/${secondUserId}`);
      expect(res.statusCode).toBe(204);
      expect(await db.user.findByPk(secondUserId)).toBeNull();
      const again = await scimDelete(`/Users/${secondUserId}`);
      expect(again.statusCode).toBe(404);
    });
  });
});
