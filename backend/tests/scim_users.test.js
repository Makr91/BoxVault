import { jest } from '@jest/globals';

const mockLog = {
  auth: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
  error: { error: jest.fn() },
  app: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
};

const mockDb = {
  user: { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  credential: { findOne: jest.fn(), findByIssuerAndSubject: jest.fn(), create: jest.fn() },
  organization: { findOne: jest.fn(), findByPk: jest.fn() },
  UserOrg: { findUserOrgRole: jest.fn(), setPrimaryOrganization: jest.fn() },
};

const mockScimError = jest.fn((res, status, detail, scimType = null) =>
  res.status(status).json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    ...(scimType ? { scimType } : {}),
    status: String(status),
    detail,
  })
);

jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));
jest.unstable_mockModule('../app/models/index.js', () => ({ default: mockDb }));
jest.unstable_mockModule('../app/middleware/scimAuth.js', () => ({
  scimAuth: jest.fn(),
  scimError: mockScimError,
}));

const { createUser, putUser } = await import('../app/controllers/scim/users.js');

const ISSUER = 'https://idp.example.com';
const EXTERNAL_ID = '11111111-2222-3333-4444-555555555555';
const USER_EXTENSION = 'urn:startcloud:scim:schemas:extension:1.0:User';

const buildRequest = (body, params = { id: '7' }) => ({
  body,
  params,
  query: {},
  scimIssuer: ISSUER,
  protocol: 'https',
  baseUrl: '/scim/v2',
  get: () => 'boxvault.example.com',
});

const buildResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.location = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const buildStoredUser = (overrides = {}) => {
  const user = {
    id: 7,
    username: 'stored.user',
    name: 'Stored User',
    email: 'stored@example.com',
    preferredLanguage: 'en',
    locale: 'en-US',
    timezone: 'America/Chicago',
    suspended: false,
    verified: true,
    avatar_url: null,
    entitlements: null,
    primary_organization_id: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
  user.update = jest.fn(patch => {
    Object.assign(user, patch);
    return Promise.resolve(user);
  });
  return user;
};

const matchingBody = (overrides = {}) => ({
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
  userName: 'stored.user',
  displayName: 'Stored User',
  emails: [{ value: 'stored@example.com', primary: true }],
  preferredLanguage: 'en',
  locale: 'en-US',
  timezone: 'America/Chicago',
  active: true,
  ...overrides,
});

describe('SCIM Users receiver', () => {
  let storedUser;
  let credential;

  beforeEach(() => {
    jest.clearAllMocks();

    storedUser = buildStoredUser();
    credential = { subject: EXTERNAL_ID, user_id: 7, update: jest.fn() };

    mockDb.credential.findOne.mockResolvedValue(credential);
    mockDb.user.findByPk.mockResolvedValue(storedUser);
    mockDb.credential.findByIssuerAndSubject.mockResolvedValue(null);
    mockDb.user.findOne.mockResolvedValue(null);
    mockDb.organization.findOne.mockResolvedValue(null);
    mockDb.organization.findByPk.mockResolvedValue(null);
  });

  describe('parseScimUserState email extraction', () => {
    it('should prefer the primary address from emails[]', async () => {
      const res = buildResponse();
      const body = matchingBody({
        emails: [
          { value: 'secondary@example.com' },
          { value: 'primary@example.com', primary: true },
        ],
      });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'primary@example.com' })
      );
    });

    it('should fall back to the first addressed entry when none is marked primary', async () => {
      const res = buildResponse();
      const body = matchingBody({
        emails: [{ type: 'work' }, { value: 'first@example.com' }, { value: 'second@example.com' }],
      });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'first@example.com' })
      );
    });

    it('should fall back to userName only when it contains an at sign', async () => {
      const res = buildResponse();
      const body = matchingBody({ userName: 'someone@example.com', emails: undefined });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'someone@example.com', email: 'someone@example.com' })
      );
    });

    it('should reject a resource whose userName is not an address and carries no emails', async () => {
      const res = buildResponse();
      const body = matchingBody({ userName: 'someone', emails: undefined });

      await putUser(buildRequest(body), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ scimType: 'invalidValue', status: '400' })
      );
      expect(storedUser.update).not.toHaveBeenCalled();
    });

    it('should reject a resource whose emails carry no values at all', async () => {
      const res = buildResponse();
      const body = matchingBody({ userName: 'someone', emails: [{ type: 'work' }] });

      await putUser(buildRequest(body), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(storedUser.update).not.toHaveBeenCalled();
    });

    it('should recompute the email hash whenever the address changes', async () => {
      const res = buildResponse();
      const body = matchingBody({ emails: [{ value: 'moved@example.com', primary: true }] });

      await putUser(buildRequest(body), res);

      const [[patch]] = storedUser.update.mock.calls;
      expect(patch.email).toBe('moved@example.com');
      expect(patch.emailHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('parseScimUserState display name', () => {
    it('should prefer displayName over the formatted name', async () => {
      const res = buildResponse();
      const body = matchingBody({
        displayName: 'Ada Lovelace',
        name: { formatted: 'Augusta Ada King' },
      });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({ name: 'Ada Lovelace' });
    });

    it('should use the formatted name when displayName is absent', async () => {
      const res = buildResponse();
      const body = matchingBody({
        displayName: undefined,
        name: { formatted: 'Augusta Ada King' },
      });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({ name: 'Augusta Ada King' });
    });

    it('should trim the display name', async () => {
      const res = buildResponse();
      const body = matchingBody({ displayName: '  Ada Lovelace  ' });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({ name: 'Ada Lovelace' });
    });

    it('should treat a blank displayName as absent and fall through', async () => {
      const res = buildResponse();
      const body = matchingBody({ displayName: '   ', name: { formatted: 'Augusta Ada King' } });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({ name: 'Augusta Ada King' });
    });

    it('should clear the stored name when the push carries neither form', async () => {
      const res = buildResponse();
      const body = matchingBody({ displayName: undefined, name: undefined });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({ name: null });
    });
  });

  describe('parseScimUserState language, locale and timezone', () => {
    it('should clear all three when the push omits them', async () => {
      const res = buildResponse();
      const body = matchingBody({
        preferredLanguage: undefined,
        locale: undefined,
        timezone: undefined,
      });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({
        preferredLanguage: null,
        locale: null,
        timezone: null,
      });
    });

    it('should treat a blank attribute as no value', async () => {
      const res = buildResponse();
      const body = matchingBody({ preferredLanguage: '   ' });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({ preferredLanguage: null });
    });

    it('should treat a non-string attribute as no value', async () => {
      const res = buildResponse();
      const body = matchingBody({ timezone: 3600 });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({ timezone: null });
    });

    it('should store the trimmed pushed values', async () => {
      const res = buildResponse();
      const body = matchingBody({
        preferredLanguage: ' es-MX ',
        locale: ' es-MX ',
        timezone: ' Europe/Madrid ',
      });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({
        preferredLanguage: 'es-MX',
        locale: 'es-MX',
        timezone: 'Europe/Madrid',
      });
    });
  });

  describe('buildUserPatch', () => {
    it('should write nothing when the pushed state already matches the stored user', async () => {
      const res = buildResponse();

      await putUser(buildRequest(matchingBody()), res);

      expect(storedUser.update).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should carry only the field that changed', async () => {
      const res = buildResponse();

      await putUser(buildRequest(matchingBody({ timezone: 'Europe/Madrid' })), res);

      expect(storedUser.update).toHaveBeenCalledTimes(1);
      expect(storedUser.update).toHaveBeenCalledWith({ timezone: 'Europe/Madrid' });
    });

    it('should carry a renamed username on its own', async () => {
      const res = buildResponse();

      await putUser(buildRequest(matchingBody({ userName: 'renamed.user' })), res);

      expect(storedUser.update).toHaveBeenCalledWith({ username: 'renamed.user' });
    });

    it('should map active false onto suspension', async () => {
      const res = buildResponse();

      await putUser(buildRequest(matchingBody({ active: false })), res);

      expect(storedUser.update).toHaveBeenCalledWith({ suspended: true });
    });

    it('should leave the verified flag alone when the extension omits emailVerified', async () => {
      const res = buildResponse();

      await putUser(buildRequest(matchingBody({ timezone: 'Europe/Madrid' })), res);

      const [[patch]] = storedUser.update.mock.calls;
      expect(Object.keys(patch)).not.toContain('verified');
    });

    it('should apply the extension emailVerified when it is present', async () => {
      const res = buildResponse();
      const body = matchingBody({ [USER_EXTENSION]: { emailVerified: false } });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({ verified: false });
    });

    it('should store an http avatar pushed on photos', async () => {
      const res = buildResponse();
      const body = matchingBody({
        photos: [{ value: 'https://cdn.example.com/a.png', type: 'photo' }],
      });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({
        avatar_url: 'https://cdn.example.com/a.png',
      });
    });

    it('should refuse a non-http avatar and clear the stored one', async () => {
      storedUser.avatar_url = 'https://cdn.example.com/old.png';
      const res = buildResponse();
      // Assembled rather than written literally so the linter's script-URL ban
      // does not stop us testing that exact scheme, which is the one that
      // matters here.
      const scriptUrl = ['java', 'script:alert(1)'].join('');
      const body = matchingBody({ photos: [{ value: scriptUrl, type: 'photo' }] });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({ avatar_url: null });
    });

    it('should keep only entries carrying a string value in entitlements', async () => {
      const res = buildResponse();
      const body = matchingBody({
        entitlements: [
          { value: 'seat', type: 'license', extra: 'dropped' },
          { type: 'license' },
          { value: 'support', display: 'Support' },
        ],
      });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).toHaveBeenCalledWith({
        entitlements: [
          { value: 'seat', type: 'license' },
          { value: 'support', display: 'Support' },
        ],
      });
    });

    it('should leave matching entitlements out of the patch', async () => {
      storedUser.entitlements = [{ value: 'seat', type: 'license' }];
      const res = buildResponse();
      const body = matchingBody({ entitlements: [{ value: 'seat', type: 'license' }] });

      await putUser(buildRequest(body), res);

      expect(storedUser.update).not.toHaveBeenCalled();
    });

    it('should return the stored resource rendered as SCIM', async () => {
      const res = buildResponse();

      await putUser(buildRequest(matchingBody()), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '7',
          externalId: EXTERNAL_ID,
          userName: 'stored.user',
          active: true,
          displayName: 'Stored User',
          preferredLanguage: 'en',
          locale: 'en-US',
          timezone: 'America/Chicago',
          emails: [{ value: 'stored@example.com', primary: true }],
        })
      );
    });

    it('should return 404 for a resource id that belongs to no credential', async () => {
      mockDb.credential.findOne.mockResolvedValue(null);
      const res = buildResponse();

      await putUser(buildRequest(matchingBody()), res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /scim/v2/Users', () => {
    it('should provision the parsed desired state verbatim', async () => {
      mockDb.user.create.mockImplementation(attributes => {
        const created = {
          id: 11,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          updatedAt: new Date('2026-02-01T00:00:00.000Z'),
          ...attributes,
        };
        created.update = jest.fn();
        return Promise.resolve(created);
      });
      mockDb.credential.create.mockResolvedValue({});
      const res = buildResponse();

      await createUser(
        buildRequest(
          {
            schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
            externalId: EXTERNAL_ID,
            userName: 'ada',
            displayName: 'Ada Lovelace',
            emails: [{ value: 'ada@example.com', primary: true }],
            preferredLanguage: 'es-MX',
            locale: 'es-MX',
            timezone: 'Europe/Madrid',
            active: true,
            [USER_EXTENSION]: { emailVerified: true },
          },
          {}
        ),
        res
      );

      expect(mockDb.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'ada',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          preferredLanguage: 'es-MX',
          locale: 'es-MX',
          timezone: 'Europe/Madrid',
          suspended: false,
          verified: true,
          authProvider: 'oidc',
          externalId: EXTERNAL_ID,
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should fall back to the email when the resource carries no userName', async () => {
      mockDb.user.create.mockImplementation(attributes => {
        const created = { id: 12, createdAt: new Date(), updatedAt: new Date(), ...attributes };
        created.update = jest.fn();
        return Promise.resolve(created);
      });
      mockDb.credential.create.mockResolvedValue({});
      const res = buildResponse();

      await createUser(
        buildRequest(
          {
            externalId: EXTERNAL_ID,
            emails: [{ value: 'ada@example.com', primary: true }],
            [USER_EXTENSION]: { emailVerified: true },
          },
          {}
        ),
        res
      );

      expect(mockDb.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'ada@example.com', email: 'ada@example.com' })
      );
    });

    it('should reject a resource that yields no email', async () => {
      const res = buildResponse();

      await createUser(buildRequest({ externalId: EXTERNAL_ID, userName: 'ada' }, {}), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ scimType: 'invalidValue' }));
      expect(mockDb.user.create).not.toHaveBeenCalled();
    });

    it('should reject a resource that carries no externalId', async () => {
      const res = buildResponse();

      await createUser(
        buildRequest({ emails: [{ value: 'ada@example.com', primary: true }] }, {}),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockDb.user.create).not.toHaveBeenCalled();
    });
  });
});
