import { jest } from '@jest/globals';
import { createHash, randomUUID } from 'crypto';
import {
  SignJWT,
  calculateJwkThumbprint,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose';

const ISSUER = 'https://edge-idp.example';
const AUDIENCE = 'boxvault';
const ORIGIN = 'https://boxvault.example';

const mockLog = {
  auth: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  app: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  error: { error: jest.fn() },
};

const mockConfigLoader = {
  loadConfig: jest.fn(name => {
    if (name === 'auth') {
      return {
        auth: {
          jwt: { jwt_secret: { value: 'test-secret' } },
          oidc: { providers: { idp: { enabled: { value: true }, issuer: { value: ISSUER } } } },
          resource_server: { enabled: { value: true }, audience: { value: AUDIENCE } },
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

const externalUserHandler = {
  handleExternalUser: jest.fn(),
  syncOrganizationsFromClaim: jest.fn(),
};
const axiosGet = jest.fn();
const getOidcConfiguration = jest.fn();

jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));
jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
  ...mockConfigLoader,
  default: mockConfigLoader,
}));
jest.unstable_mockModule('../app/models/index.js', () => ({ default: mockDb }));
jest.unstable_mockModule('../app/utils/jwks.js', () => ({ getRemoteJwks: () => localJwks }));
jest.unstable_mockModule('../app/auth/passport.js', () => ({ getOidcConfiguration }));
jest.unstable_mockModule('../app/auth/external-user-handler.js', () => ({
  default: externalUserHandler,
}));
jest.unstable_mockModule('axios', () => ({ default: { get: axiosGet } }));

const { resolveRequestAuth } = await import('../app/utils/requestAuth.js');

const discovered = (metadata = {}) => ({
  serverMetadata: () => ({
    jwks_uri: `${ISSUER}/jwks`,
    userinfo_endpoint: `${ISSUER}/userinfo`,
    ...metadata,
  }),
});

const mintIdpToken = (claims = {}) =>
  new SignJWT({ sub: 'subject-1', UUID: 'uuid-1', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'idp-1' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(idpKeys.privateKey);

const athOf = token => createHash('sha256').update(token).digest('base64url');

const mintProof = (token, { header = {}, payload = {}, key = dpopKeys.privateKey } = {}) =>
  new SignJWT({
    htm: 'GET',
    htu: `${ORIGIN}/api/discover`,
    ath: athOf(token),
    jti: randomUUID(),
    ...payload,
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: dpopJwk, ...header })
    .setIssuedAt()
    .sign(key);

const requestWith = headers => ({
  headers,
  method: 'GET',
  originalUrl: '/api/discover?page=1',
  path: '/api/discover',
});

const refusalReason = () =>
  mockLog.auth.info.mock.calls.find(
    ([message]) => message === 'Identity-provider token refused'
  )?.[1]?.error;

describe('Request authentication edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOidcConfiguration.mockReturnValue(discovered());
    mockDb.service_account.findOne.mockResolvedValue(null);
    mockDb.credential.findByIssuerAndSubject.mockResolvedValue({ user_id: 7 });
    mockDb.user.findByPk.mockResolvedValue({ id: 7, suspended: false });
  });

  it('should treat an undecodable bearer credential as anonymous', async () => {
    expect(
      await resolveRequestAuth(requestWith({ authorization: 'Bearer aaa.bbb.ccc' }))
    ).toBeNull();
    expect(mockLog.auth.info).not.toHaveBeenCalled();
  });

  it('should refuse a token while the provider is not discovered', async () => {
    getOidcConfiguration.mockReturnValue(undefined);
    const token = await mintIdpToken();
    expect(await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }))).toBeNull();
    expect(refusalReason()).toBe('provider idp not discovered yet');
  });

  it('should refuse a token without a subject', async () => {
    const token = await mintIdpToken({ sub: undefined, UUID: undefined });
    expect(await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }))).toBeNull();
    expect(refusalReason()).toBe('token carries no subject');
  });

  it('should provision from the token claims when userinfo is unavailable', async () => {
    mockDb.credential.findByIssuerAndSubject.mockResolvedValue(null);
    axiosGet.mockRejectedValue(new Error('userinfo down'));
    externalUserHandler.handleExternalUser.mockResolvedValue({ id: 11 });
    const token = await mintIdpToken({ email: 'claims@example.com' });
    const auth = await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }));
    expect(auth.userId).toBe(11);
    expect(externalUserHandler.handleExternalUser).toHaveBeenCalledWith(
      'oidc-idp',
      expect.objectContaining({ email: 'claims@example.com' }),
      mockDb,
      expect.any(Object)
    );
  });

  it('should skip userinfo when the provider publishes no endpoint', async () => {
    getOidcConfiguration.mockReturnValue(discovered({ userinfo_endpoint: undefined }));
    mockDb.credential.findByIssuerAndSubject.mockResolvedValue(null);
    externalUserHandler.handleExternalUser.mockResolvedValue({ id: 12 });
    const token = await mintIdpToken();
    const auth = await resolveRequestAuth(requestWith({ authorization: `Bearer ${token}` }));
    expect(auth.userId).toBe(12);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it.each([
    ['type', { header: { typ: 'jwt' } }, 'unsupported DPoP proof'],
    ['algorithm', { header: { alg: 'RS256' }, key: idpKeys.privateKey }, 'unsupported DPoP proof'],
    [
      'private key material',
      { header: { jwk: { ...dpopJwk, d: 'secret' } } },
      'bad DPoP proof key',
    ],
    ['identifier', { payload: { jti: undefined } }, 'DPoP jti required'],
  ])('should refuse a proof with a bad %s', async (label, overrides, reason) => {
    void label;
    const token = await mintIdpToken({ cnf: { jkt: dpopJkt } });
    const proof = await mintProof(token, overrides);
    const req = requestWith({ authorization: `DPoP ${token}`, dpop: proof });
    expect(await resolveRequestAuth(req)).toBeNull();
    expect(refusalReason()).toBe(reason);
  });
});
