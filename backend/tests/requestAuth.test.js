import { jest } from '@jest/globals';
import { createHash, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import {
  SignJWT,
  calculateJwkThumbprint,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose';

const ISSUER = 'https://idp.example';
const AUDIENCE = 'boxvault';
const ORIGIN = 'https://boxvault.example';
const JWT_CLAIM_OPTIONS = { issuer: 'boxvault', audience: 'boxvault-api' };

const mockLog = {
  auth: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  app: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  error: { error: jest.fn() },
};

const resourceServer = { enabled: { value: true }, audience: { value: AUDIENCE } };

const mockConfigLoader = {
  loadConfig: jest.fn(name => {
    if (name === 'auth') {
      return {
        auth: {
          jwt: { jwt_secret: { value: 'test-secret' } },
          oidc: { providers: { idp: { enabled: { value: true }, issuer: { value: ISSUER } } } },
          resource_server: resourceServer,
        },
      };
    }
    return { boxvault: { origin: { value: ORIGIN } } };
  }),
};

const mockDb = {
  credential: { findByIssuerAndSubject: jest.fn() },
  user: { findByPk: jest.fn() },
  service_account: { findOne: jest.fn() },
  UserOrg: { getUserOrganizations: jest.fn() },
  Sequelize: { Op: { or: 'or', gt: 'gt', eq: 'eq' } },
};

const idpKeys = await generateKeyPair('RS256');
const idpJwk = { ...(await exportJWK(idpKeys.publicKey)), kid: 'idp-1', alg: 'RS256' };
const localJwks = createLocalJWKSet({ keys: [idpJwk] });
const dpopKeys = await generateKeyPair('ES256');
const dpopJwk = await exportJWK(dpopKeys.publicKey);
const dpopJkt = await calculateJwkThumbprint(dpopJwk);
const otherKeys = await generateKeyPair('ES256');
const otherJwk = await exportJWK(otherKeys.publicKey);

const externalUserHandler = {
  handleExternalUser: jest.fn(),
  syncOrganizationsFromClaim: jest.fn(),
};
const axiosGet = jest.fn();

jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));
jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
  ...mockConfigLoader,
  default: mockConfigLoader,
}));
jest.unstable_mockModule('../app/models/index.js', () => ({ default: mockDb }));
jest.unstable_mockModule('../app/utils/jwks.js', () => ({ getRemoteJwks: () => localJwks }));
jest.unstable_mockModule('../app/auth/passport.js', () => ({
  getOidcConfiguration: jest.fn(() => ({
    serverMetadata: () => ({
      jwks_uri: `${ISSUER}/jwks`,
      userinfo_endpoint: `${ISSUER}/userinfo`,
    }),
  })),
}));
jest.unstable_mockModule('../app/auth/external-user-handler.js', () => ({
  default: externalUserHandler,
}));
jest.unstable_mockModule('axios', () => ({ default: { get: axiosGet } }));

const { resolveRequestAuth } = await import('../app/utils/requestAuth.js');
const { default: authJwt } = await import('../app/middleware/authJwt.js');
const { sessionAuth } = await import('../app/middleware/sessionAuth.js');
const { resolveJwtUser } = await import('../app/utils/jwtUser.js');

const mintIdpToken = (claims = {}, { audience = AUDIENCE, issuer = ISSUER } = {}) =>
  new SignJWT({ sub: 'subject-1', UUID: 'uuid-1', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'idp-1' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(idpKeys.privateKey);

const athOf = token => createHash('sha256').update(token).digest('base64url');

const mintProof = (token, overrides = {}) => {
  const {
    htm = 'GET',
    htu = `${ORIGIN}/api/discover`,
    ath = athOf(token),
    iat = Math.floor(Date.now() / 1000),
    jti = randomUUID(),
    jwk = dpopJwk,
    key = dpopKeys.privateKey,
  } = overrides;
  return new SignJWT({ htm, htu, ath, jti })
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk })
    .setIssuedAt(iat)
    .sign(key);
};

const sessionToken = claims =>
  jwt.sign(claims, 'test-secret', { expiresIn: '1h', ...JWT_CLAIM_OPTIONS });

const requestWith = (headers = {}, extra = {}) => ({
  headers,
  method: 'GET',
  originalUrl: '/api/discover?page=1',
  path: '/api/discover',
  ...extra,
});

const mockResponse = () => ({ status: jest.fn().mockReturnThis(), send: jest.fn() });

describe('Request authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resourceServer.enabled.value = true;
    resourceServer.audience.value = AUDIENCE;
    mockDb.service_account.findOne.mockResolvedValue(null);
    mockDb.credential.findByIssuerAndSubject.mockResolvedValue({ user_id: 7 });
    mockDb.user.findByPk.mockResolvedValue({ id: 7, suspended: false, sessionsInvalidAfter: null });
    mockDb.UserOrg.getUserOrganizations.mockResolvedValue([
      { organization_id: 2 },
      { organization_id: 5 },
    ]);
  });

  describe('resolveRequestAuth', () => {
    it('resolves nothing without credentials', async () => {
      expect(await resolveRequestAuth(requestWith())).toBeNull();
    });

    it('resolves the session JWT without exposing its identity-provider fields', async () => {
      const organizations = [{ id: 2, name: 'org' }];
      const token = sessionToken({
        id: 4,
        provider: 'oidc-idp',
        organizations,
        oidc_access_token: 'idp-access-token',
      });
      const auth = await resolveRequestAuth(requestWith({ 'x-access-token': token }));
      expect(auth).toMatchObject({ userId: 4, isServiceAccount: false, organizations });
      expect(auth.claims.provider).toBe('oidc-idp');
      expect(auth.provider).toBeUndefined();
      expect(auth.oidcAccessToken).toBeUndefined();
    });

    it('resolves a service-account session JWT', async () => {
      const token = sessionToken({ id: 4, isServiceAccount: true, serviceAccountId: 9 });
      const auth = await resolveRequestAuth(requestWith({ 'x-access-token': token }));
      expect(auth).toMatchObject({ userId: 4, isServiceAccount: true, serviceAccountId: 9 });
    });

    it('resolves a raw service-account key on Authorization Bearer', async () => {
      mockDb.service_account.findOne.mockResolvedValue({
        id: 3,
        userId: 9,
        user: { suspended: false },
      });
      const auth = await resolveRequestAuth(requestWith({ authorization: 'Bearer raw-key' }));
      expect(auth).toEqual({ userId: 9, isServiceAccount: true, serviceAccountId: 3 });
    });

    it('resolves a raw service-account key on x-access-token', async () => {
      mockDb.service_account.findOne.mockResolvedValue({
        id: 3,
        userId: 9,
        user: { suspended: false },
      });
      const auth = await resolveRequestAuth(requestWith({ 'x-access-token': 'raw-key' }));
      expect(auth).toEqual({ userId: 9, isServiceAccount: true, serviceAccountId: 3 });
    });

    it('accepts the session JWT alone when asked for the session only', async () => {
      mockDb.service_account.findOne.mockResolvedValue({
        id: 3,
        userId: 9,
        user: { suspended: false },
      });
      const auth = await resolveRequestAuth(requestWith({ authorization: 'Bearer raw-key' }), {
        sessionOnly: true,
      });
      expect(auth).toBeNull();
    });

    it('accepts an identity-provider token as Bearer', async () => {
      const token = await mintIdpToken();
      const auth = await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }));
      expect(auth).toMatchObject({
        userId: 7,
        isServiceAccount: false,
        provider: 'oidc-idp',
        oidcAccessToken: token,
      });
      expect(auth.claims.sub).toBe('subject-1');
      expect(mockDb.credential.findByIssuerAndSubject).toHaveBeenCalledWith(ISSUER, 'uuid-1');
    });

    it('syncs the organizations claim of a linked user', async () => {
      const token = await mintIdpToken({ organizations: [] });
      await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }));
      expect(externalUserHandler.syncOrganizationsFromClaim).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7 }),
        expect.objectContaining({ sub: 'subject-1' }),
        ISSUER,
        mockDb
      );
    });

    it('provisions a first-contact subject through the external user handler', async () => {
      mockDb.credential.findByIssuerAndSubject.mockResolvedValue(null);
      axiosGet.mockResolvedValue({ data: { email: 'first@example.com', name: 'First' } });
      externalUserHandler.handleExternalUser.mockResolvedValue({ id: 11 });
      const token = await mintIdpToken();
      const auth = await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }));
      expect(auth.userId).toBe(11);
      expect(externalUserHandler.handleExternalUser).toHaveBeenCalledWith(
        'oidc-idp',
        expect.objectContaining({ sub: 'subject-1', email: 'first@example.com' }),
        mockDb,
        expect.any(Object)
      );
    });

    it('refuses an identity-provider token while the resource server is disabled', async () => {
      resourceServer.enabled.value = false;
      const token = await mintIdpToken();
      expect(
        await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }))
      ).toBeNull();
      expect(mockLog.auth.info).toHaveBeenCalledWith(
        'Identity-provider token refused',
        expect.objectContaining({ error: 'resource server disabled' })
      );
    });

    it('refuses to validate without a configured audience', async () => {
      resourceServer.audience.value = '';
      const token = await mintIdpToken();
      expect(
        await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }))
      ).toBeNull();
    });

    it('refuses a token minted for another audience', async () => {
      const token = await mintIdpToken({}, { audience: 'someone-else' });
      expect(
        await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }))
      ).toBeNull();
    });

    it('ignores a token of an unknown issuer', async () => {
      const token = await mintIdpToken({}, { issuer: 'https://other.example' });
      expect(
        await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }))
      ).toBeNull();
      expect(mockLog.auth.info).not.toHaveBeenCalled();
    });

    it('refuses a suspended user', async () => {
      mockDb.user.findByPk.mockResolvedValue({ id: 7, suspended: true });
      const token = await mintIdpToken();
      expect(
        await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }))
      ).toBeNull();
    });

    it('refuses a key-bound token presented as Bearer', async () => {
      const token = await mintIdpToken({ cnf: { jkt: dpopJkt } });
      expect(
        await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }))
      ).toBeNull();
      expect(mockLog.auth.info).toHaveBeenCalledWith(
        'Identity-provider token refused',
        expect.objectContaining({ error: 'key-bound token presented as Bearer' })
      );
    });

    it('refuses the DPoP scheme with an unbound token', async () => {
      const token = await mintIdpToken();
      const proof = await mintProof(token);
      const req = requestWith({ authorization: `DPoP ${token}`, dpop: proof });
      expect(await resolveRequestAuth(req)).toBeNull();
    });

    it('refuses a key-bound token without a proof', async () => {
      const token = await mintIdpToken({ cnf: { jkt: dpopJkt } });
      expect(await resolveRequestAuth(requestWith({ authorization: `DPoP ${token}` }))).toBeNull();
    });

    it('accepts a key-bound token with a valid DPoP proof', async () => {
      const token = await mintIdpToken({ cnf: { jkt: dpopJkt } });
      const proof = await mintProof(token);
      const req = requestWith({ authorization: `DPoP ${token}`, dpop: proof });
      const auth = await resolveRequestAuth(req);
      expect(auth).toMatchObject({ userId: 7, provider: 'oidc-idp', oidcAccessToken: token });
    });

    it.each([
      ['htm', { htm: 'POST' }, 'DPoP htm mismatch'],
      ['htu', { htu: `${ORIGIN}/api/other` }, 'DPoP htu mismatch'],
      ['iat', { iat: Math.floor(Date.now() / 1000) - 120 }, 'DPoP proof expired'],
      ['ath', { ath: athOf('another-token') }, 'DPoP ath mismatch'],
      [
        'thumbprint',
        { jwk: otherJwk, key: otherKeys.privateKey },
        'DPoP key does not match the token binding',
      ],
    ])('refuses a proof with a wrong %s', async (field, overrides, reason) => {
      void field;
      const token = await mintIdpToken({ cnf: { jkt: dpopJkt } });
      const proof = await mintProof(token, overrides);
      const req = requestWith({ authorization: `DPoP ${token}`, dpop: proof });
      expect(await resolveRequestAuth(req)).toBeNull();
      expect(mockLog.auth.info).toHaveBeenCalledWith(
        'Identity-provider token refused',
        expect.objectContaining({ error: reason })
      );
    });

    it('refuses a replayed proof', async () => {
      const token = await mintIdpToken({ cnf: { jkt: dpopJkt } });
      const proof = await mintProof(token);
      const headers = { authorization: `DPoP ${token}`, dpop: proof };
      expect(await resolveRequestAuth(requestWith(headers))).not.toBeNull();
      expect(await resolveRequestAuth(requestWith(headers))).toBeNull();
      expect(mockLog.auth.info).toHaveBeenCalledWith(
        'Identity-provider token refused',
        expect.objectContaining({ error: 'DPoP proof replayed' })
      );
    });
  });

  describe('gates on the resolver', () => {
    it('verifyToken authenticates an identity-provider token and stamps the request', async () => {
      const token = await mintIdpToken();
      const req = requestWith({ authorization: `Bearer ${token}` });
      const res = mockResponse();
      const next = jest.fn();
      await authJwt.verifyToken(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req).toMatchObject({
        userId: 7,
        isServiceAccount: false,
        authProvider: 'oidc-idp',
        oidcAccessToken: token,
      });
      expect(req.tokenClaims.sub).toBe('subject-1');
    });

    it('verifyToken answers 401 to a refused identity-provider token', async () => {
      resourceServer.enabled.value = false;
      const token = await mintIdpToken();
      const res = mockResponse();
      const next = jest.fn();
      await authJwt.verifyToken(requestWith({ authorization: `Bearer ${token}` }), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'TOKEN_INVALID' }));
      expect(next).not.toHaveBeenCalled();
    });

    it('verifyToken answers 403 without credentials', async () => {
      const res = mockResponse();
      const next = jest.fn();
      await authJwt.verifyToken(requestWith(), res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('verifyToken refuses an identity-provider token on the refresh route', async () => {
      const token = await mintIdpToken();
      const req = requestWith(
        { authorization: `Bearer ${token}` },
        { path: '/api/auth/refresh-token' }
      );
      const res = mockResponse();
      const next = jest.fn();
      await authJwt.verifyToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('sessionAuth resolves an identity-provider token', async () => {
      const token = await mintIdpToken();
      const req = requestWith({ authorization: `Bearer ${token}` });
      const next = jest.fn();
      await sessionAuth(req, {}, next);
      expect(next).toHaveBeenCalled();
      expect(req).toMatchObject({ userId: 7, isServiceAccount: false, authProvider: 'oidc-idp' });
    });

    it('sessionAuth leaves an earlier authentication alone', async () => {
      const token = await mintIdpToken();
      const req = requestWith({ authorization: `Bearer ${token}` }, { userId: 1 });
      const next = jest.fn();
      await sessionAuth(req, {}, next);
      expect(next).toHaveBeenCalled();
      expect(req.userId).toBe(1);
      expect(mockDb.credential.findByIssuerAndSubject).not.toHaveBeenCalled();
    });

    it('resolveJwtUser returns the organizations of the identity-provider user', async () => {
      const token = await mintIdpToken();
      const viewer = await resolveJwtUser(requestWith({ authorization: `Bearer ${token}` }));
      expect(viewer).toEqual({ userId: 7, orgIds: [2, 5] });
    });
  });
});
