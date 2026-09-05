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

const ISSUER = 'https://logout-idp.example';
const NO_CLIENT_ISSUER = 'https://noclient-idp.example';
const UNDISCOVERED_ISSUER = 'https://undiscovered-logout-idp.example';
const CLIENT_ID = 'boxvault-login';
const LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

const idpKeys = await generateKeyPair('RS256');
const otherKeys = await generateKeyPair('RS256');
const idpJwk = { ...(await exportJWK(idpKeys.publicKey)), kid: 'logout-1', alg: 'RS256' };

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
    ['logoutidp', 'noclient'].includes(name)
      ? { serverMetadata: () => ({ jwks_uri: jwksUri }) }
      : undefined
  ),
  buildAuthorizationUrl: jest.fn(),
  buildEndSessionUrl: jest.fn(),
  handleOidcCallback: jest.fn(),
}));

const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const jwt = (await import('jsonwebtoken')).default;

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const writeAuthConfig = mutate => {
  const original = fs.readFileSync(authConfigPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(authConfigPath, yaml.dump(config));
  return () => fs.writeFileSync(authConfigPath, original);
};

const mintLogoutToken = ({
  claims = {},
  issuer = ISSUER,
  audience = CLIENT_ID,
  key = idpKeys.privateKey,
  events = { [LOGOUT_EVENT]: {} },
} = {}) =>
  new SignJWT({ events, jti: `jti-${Date.now()}-${Math.random()}`, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'logout-1' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(key);

const postLogout = logoutToken =>
  request(app).post('/api/auth/oidc/backchannel-logout').send({ logout_token: logoutToken });

describe('OIDC back-channel logout', () => {
  const uniqueId = Date.now().toString(36);
  const subjectUuid = `logout-subject-${uniqueId}`;
  let restoreConfig;
  let user;
  let emailUser;

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    restoreConfig = writeAuthConfig(config => {
      config.auth.oidc.providers = {
        logoutidp: {
          enabled: { value: true },
          issuer: { value: ISSUER },
          client_id: { value: CLIENT_ID },
        },
        noclient: { enabled: { value: true }, issuer: { value: NO_CLIENT_ISSUER } },
        undiscovered: { enabled: { value: true }, issuer: { value: UNDISCOVERED_ISSUER } },
      };
    });

    const role = await db.role.findOne({ where: { name: 'user' } });
    user = await db.user.create({
      username: `logout-user-${uniqueId}`,
      email: `logout-user-${uniqueId}@example.com`,
      password: 'external',
      verified: true,
    });
    await user.setRoles([role]);
    await db.credential.create({
      user_id: user.id,
      provider: ISSUER,
      subject: subjectUuid,
      external_email: user.email,
    });

    emailUser = await db.user.create({
      username: `logout-email-${uniqueId}`,
      email: `logout-email-${uniqueId}@example.com`,
      password: 'external',
      verified: true,
    });
    await emailUser.setRoles([role]);
  });

  afterAll(async () => {
    restoreConfig();
    await new Promise(resolve => {
      jwksServer.close(resolve);
    });
    await user.destroy();
    await emailUser.destroy();
  });

  it('should reject a request without a logout token', async () => {
    const res = await request(app).post('/api/auth/oidc/backchannel-logout').send({});
    expect(res.statusCode).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      error: 'invalid_request',
      error_description: 'missing or malformed logout_token',
    });
  });

  it('should reject a token that is not a JWT', async () => {
    const res = await postLogout('not-a-jwt');
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toBe('missing or malformed logout_token');
  });

  it('should reject a three-part token that does not decode', async () => {
    const res = await postLogout('aaa.bbb.ccc');
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toBe('missing or malformed logout_token');
  });

  it('should reject a token of an unknown issuer', async () => {
    const res = await postLogout(await mintLogoutToken({ issuer: 'https://stranger.example' }));
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toBe('unknown token issuer');
  });

  it('should reject a token while the provider is not discovered yet', async () => {
    const res = await postLogout(await mintLogoutToken({ issuer: UNDISCOVERED_ISSUER }));
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toBe('identity provider metadata not available');
  });

  it('should reject a token for a provider without a client id', async () => {
    const res = await postLogout(await mintLogoutToken({ issuer: NO_CLIENT_ISSUER }));
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toBe('provider client_id is not configured');
  });

  it('should reject a token signed by another key', async () => {
    const res = await postLogout(await mintLogoutToken({ key: otherKeys.privateKey }));
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toBe('logout token validation failed');
  });

  it('should reject a token minted for another audience', async () => {
    const res = await postLogout(await mintLogoutToken({ audience: 'someone-else' }));
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toBe('logout token validation failed');
  });

  it('should reject a token without a sub or sid claim', async () => {
    const res = await postLogout(await mintLogoutToken());
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toBe('logout token must contain a sub or sid claim');
  });

  it('should reject a token without the back-channel logout event', async () => {
    const res = await postLogout(
      await mintLogoutToken({ claims: { sub: subjectUuid }, events: { other: {} } })
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toContain('events claim');
  });

  it('should reject a token carrying a nonce', async () => {
    const res = await postLogout(
      await mintLogoutToken({ claims: { sub: subjectUuid, nonce: 'n' } })
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toBe('logout token must not contain a nonce claim');
  });

  it('should accept a sid-only token without mapping anything locally', async () => {
    const res = await postLogout(await mintLogoutToken({ claims: { sid: 'session-1' } }));
    expect(res.statusCode).toBe(200);
    await user.reload();
    expect(user.sessionsInvalidAfter).toBeNull();
  });

  it('should accept a token whose subject matches no local credential', async () => {
    const res = await postLogout(await mintLogoutToken({ claims: { sub: 'nobody-here' } }));
    expect(res.statusCode).toBe(200);
  });

  it('should revoke the sessions of the user behind the subject', async () => {
    const session = jwt.sign({ id: user.id }, 'test-secret', {
      expiresIn: '1h',
      ...TEST_JWT_CLAIMS,
    });
    const before = await request(app).get('/api/user').set('x-access-token', session);
    expect(before.statusCode).toBe(200);

    await new Promise(resolve => {
      setTimeout(resolve, 1100);
    });
    const res = await postLogout(await mintLogoutToken({ claims: { sub: subjectUuid } }));
    expect(res.statusCode).toBe(200);

    await user.reload();
    expect(user.sessionsInvalidAfter).not.toBeNull();

    const after = await request(app).get('/api/user').set('x-access-token', session);
    expect(after.statusCode).toBe(401);
    expect(after.body.error).toBe('TOKEN_INVALID');

    const refresh = await request(app)
      .post('/api/auth/refresh-token')
      .set('x-access-token', session)
      .send({ stayLoggedIn: true });
    expect(refresh.statusCode).toBe(401);
    expect(refresh.body.error).toBe('TOKEN_INVALID');
  });

  it('should resolve the user through the UUID claim before the subject', async () => {
    const res = await postLogout(
      await mintLogoutToken({ claims: { sub: 'someone-else', UUID: subjectUuid } })
    );
    expect(res.statusCode).toBe(200);
  });

  it('should fall back to the email address when the subject is one', async () => {
    const res = await postLogout(await mintLogoutToken({ claims: { sub: emailUser.email } }));
    expect(res.statusCode).toBe(200);
    await emailUser.reload();
    expect(emailUser.sessionsInvalidAfter).not.toBeNull();
  });

  it('should report a failed revocation', async () => {
    jest.spyOn(db.user, 'update').mockRejectedValueOnce(new Error('database down'));
    const res = await postLogout(await mintLogoutToken({ claims: { sub: subjectUuid } }));
    expect(res.statusCode).toBe(400);
    expect(res.body.error_description).toBe('logout failed');
    jest.restoreAllMocks();
  });
});
