import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authConfigPath = path.join(__dirname, '../app/config/auth.test.config.yaml');

const ISSUER = 'https://login-idp.example';
const AUTHORIZE_URL = `${ISSUER}/authorize?client_id=boxvault`;
const END_SESSION_URL = `${ISSUER}/logout?post_logout_redirect_uri=x`;

const buildAuthorizationUrl = jest.fn();
const handleOidcCallback = jest.fn();
const buildEndSessionUrl = jest.fn();

const passThrough = () => (req, res, next) => {
  void req;
  void res;
  next();
};

jest.unstable_mockModule('../app/auth/passport.js', () => ({
  passport: { initialize: passThrough, session: passThrough, use: jest.fn() },
  initializeStrategies: jest.fn().mockResolvedValue(),
  getOidcConfiguration: jest.fn(),
  buildAuthorizationUrl,
  buildEndSessionUrl,
  handleOidcCallback,
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

const tokensFor = claims => ({
  claims: () => claims,
  id_token: 'id-token',
  access_token: 'access-token',
  refresh_token: 'refresh-token',
});

const wait = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

describe('OIDC login routes', () => {
  const uniqueId = Date.now().toString(36);
  let restoreConfig;
  let user;
  let suspendedUser;

  const signFor = (account, claims = {}) =>
    jwt.sign({ id: account.id, ...claims }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const startLogin = (agent, query = {}) => agent.get('/api/auth/oidc/loginidp').query(query);

  const callback = (agent, query) => agent.get('/api/auth/oidc/callback').query(query);

  const exchange = code => request(app).post('/api/auth/oidc/exchange').send({ code });

  const completeLogin = async (account, tokens) => {
    const agent = request.agent(app);
    buildAuthorizationUrl.mockResolvedValueOnce(new URL(AUTHORIZE_URL));
    await startLogin(agent);
    handleOidcCallback.mockResolvedValueOnce({
      user: account,
      tokens: tokens || tokensFor({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    });
    return callback(agent, { code: 'grant-code', state: 'state' });
  };

  const codeOf = res => new URL(res.headers.location, 'http://localhost').searchParams.get('code');

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    restoreConfig = writeAuthConfig(config => {
      config.auth.oidc.providers = {
        loginidp: {
          enabled: { value: true },
          issuer: { value: ISSUER },
          client_id: { value: 'boxvault' },
          display_name: { value: 'Login IdP' },
          icon_url: { value: 'https://login-idp.example/icon.svg' },
        },
        disabledidp: {
          enabled: { value: false },
          issuer: { value: 'https://off.example' },
          display_name: { value: 'Off' },
        },
      };
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    user = await db.user.create({
      username: `login-user-${uniqueId}`,
      email: `login-user-${uniqueId}@example.com`,
      password: 'external',
      verified: true,
    });
    await user.setRoles([role]);
    suspendedUser = await db.user.create({
      username: `login-suspended-${uniqueId}`,
      email: `login-suspended-${uniqueId}@example.com`,
      password: 'external',
      verified: true,
      suspended: true,
    });
  });

  afterAll(async () => {
    restoreConfig();
    await db.user.destroy({ where: { id: [user.id, suspendedUser.id] } });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should list the enabled issuers and methods', async () => {
    const issuers = await request(app).get('/api/auth/oidc/issuers');
    expect(issuers.statusCode).toBe(200);
    expect(issuers.body.issuers).toEqual([{ provider: 'loginidp', issuer: ISSUER }]);

    const methods = await request(app).get('/api/auth/methods');
    expect(methods.statusCode).toBe(200);
    expect(methods.body.methods).toEqual([
      { id: 'local', name: 'Local Account', enabled: true },
      {
        id: 'oidc-loginidp',
        name: 'Login IdP',
        enabled: true,
        icon_url: 'https://login-idp.example/icon.svg',
      },
    ]);
    expect(methods.body.local_registration_enabled).toBe(true);
  });

  it('should refuse to start a login with an unknown or disabled provider', async () => {
    const unknown = await request(app).get('/api/auth/oidc/nope');
    expect(unknown.statusCode).toBe(302);
    expect(unknown.headers.location).toBe('/?error=provider_not_found');
    const disabled = await request(app).get('/api/auth/oidc/disabledidp');
    expect(disabled.headers.location).toBe('/?error=provider_not_enabled');
  });

  it('should redirect to the provider with the silent prompt when asked', async () => {
    buildAuthorizationUrl.mockResolvedValueOnce(new URL(AUTHORIZE_URL));
    const res = await startLogin(request.agent(app), { return: '/boxes', prompt: 'none' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(AUTHORIZE_URL);
    expect(buildAuthorizationUrl).toHaveBeenCalledWith(
      'loginidp',
      'http://localhost:3000/api/auth/oidc/callback',
      expect.any(String),
      expect.any(String),
      'none'
    );
  });

  it('should fall back to the error page when the provider cannot be reached', async () => {
    buildAuthorizationUrl.mockRejectedValueOnce(new Error('discovery down'));
    const res = await startLogin(request.agent(app));
    expect(res.headers.location).toBe('/?error=oidc_failed');
  });

  it('should refuse a callback without a login session', async () => {
    const res = await request(app).get('/api/auth/oidc/callback').query({ code: 'x' });
    expect(res.headers.location).toBe('/?error=no_session_data');
  });

  it('should map provider errors on the callback', async () => {
    const denied = await request(app)
      .get('/api/auth/oidc/callback')
      .query({ error: 'access_denied' });
    expect(denied.headers.location).toBe('/login?error=access_denied');

    const other = await request(app)
      .get('/api/auth/oidc/callback')
      .query({ error: 'server_error' });
    expect(other.headers.location).toBe('/login?error=oidc_failed');

    const agent = request.agent(app);
    buildAuthorizationUrl.mockResolvedValueOnce(new URL(AUTHORIZE_URL));
    await startLogin(agent, { prompt: 'none' });
    const silent = await callback(agent, { error: 'login_required' });
    expect(silent.headers.location).toBe('/login?silent=failed');
  });

  it('should hand out a single-use code and exchange it for the session token', async () => {
    const res = await completeLogin(user);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^\/auth\/callback\?code=[0-9a-f]{64}$/);
    expect(handleOidcCallback).toHaveBeenCalledWith(
      'loginidp',
      expect.any(URL),
      expect.any(String),
      expect.any(String)
    );

    const code = codeOf(res);
    const exchanged = await exchange(code);
    expect(exchanged.statusCode).toBe(200);
    const claims = jwt.verify(exchanged.body.token, 'test-secret', TEST_JWT_CLAIMS);
    expect(claims).toMatchObject({
      id: user.id,
      isServiceAccount: false,
      provider: 'oidc-loginidp',
      id_token: 'id-token',
      oidc_access_token: 'access-token',
      oidc_refresh_token: 'refresh-token',
    });
    expect(claims.oidc_expires_at).toBeGreaterThan(Date.now());

    const again = await exchange(code);
    expect(again.statusCode).toBe(400);
    expect((await exchange(undefined)).statusCode).toBe(400);
    expect((await exchange('unknown-code')).statusCode).toBe(400);
  });

  it('should default the identity-provider expiry when the claims carry none', async () => {
    const before = Date.now();
    const res = await completeLogin(user, tokensFor({}));
    const exchanged = await exchange(codeOf(res));
    const claims = jwt.verify(exchanged.body.token, 'test-secret', TEST_JWT_CLAIMS);
    expect(claims.oidc_expires_at).toBeGreaterThanOrEqual(before + 30 * 60 * 1000);
    expect(claims.oidc_expires_at).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000);
  });

  it('should refuse a missing or suspended account', async () => {
    const missing = await completeLogin(null);
    expect(missing.headers.location).toBe('/?error=user_creation_failed');
    const suspended = await completeLogin(suspendedUser);
    expect(suspended.headers.location).toBe('/login?error=account_suspended');
  });

  it('should map callback failures', async () => {
    const agent = request.agent(app);
    buildAuthorizationUrl.mockResolvedValueOnce(new URL(AUTHORIZE_URL));
    await startLogin(agent);
    handleOidcCallback.mockRejectedValueOnce(new Error('Access denied: invitation required'));
    const denied = await callback(agent, { code: 'x', state: 'y' });
    expect(denied.headers.location).toBe('/?error=access_denied');

    buildAuthorizationUrl.mockResolvedValueOnce(new URL(AUTHORIZE_URL));
    await startLogin(agent);
    handleOidcCallback.mockRejectedValueOnce(new Error('token exchange failed'));
    const failed = await callback(agent, { code: 'x', state: 'y' });
    expect(failed.headers.location).toBe('/?error=oidc_failed');
  });

  it('should purge expired handoff codes', async () => {
    const restore = writeAuthConfig(config => {
      config.auth.oidc.login_handoff_ttl_seconds = { value: 1 };
    });
    try {
      const first = codeOf(await completeLogin(user));
      await wait(1100);
      const second = codeOf(await completeLogin(user));
      expect((await exchange(first)).statusCode).toBe(400);
      expect((await exchange(second)).statusCode).toBe(200);
    } finally {
      restore();
    }
  });

  describe('POST /api/auth/oidc/logout', () => {
    const logout = headers => request(app).post('/api/auth/oidc/logout').set(headers).send({});

    it('should answer without a session', async () => {
      const res = await logout({ Authorization: 'Bearer none' });
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('No active session to logout');
    });

    it('should log a local session out locally', async () => {
      const res = await logout({ 'x-access-token': signFor(user, { provider: 'local' }) });
      expect(res.body.message).toBe('Logged out locally');
    });

    it('should hand back the provider end-session URL for a federated session', async () => {
      buildEndSessionUrl.mockReturnValueOnce(new URL(END_SESSION_URL));
      const token = signFor(user, { provider: 'oidc-loginidp', id_token: 'id-token' });
      const res = await logout({ 'x-access-token': token });
      expect(res.body).toEqual({
        success: true,
        message: 'Logout initiated',
        redirect_url: END_SESSION_URL,
      });
      expect(buildEndSessionUrl).toHaveBeenCalledWith(
        'loginidp',
        'http://localhost:3000/login?logout=success',
        expect.any(String),
        'id-token'
      );
    });

    it('should log out locally when the provider has no end-session endpoint', async () => {
      buildEndSessionUrl.mockReturnValueOnce(null);
      const token = signFor(user, { provider: 'oidc-loginidp' });
      const res = await logout({ 'x-access-token': token });
      expect(res.body.message).toBe('Logged out locally');
    });

    it('should log out locally on an unreadable token', async () => {
      const res = await logout({ 'x-access-token': 'not.a.token' });
      expect(res.body.message).toBe('Logged out locally');
    });

    it('should answer the local-only logout', async () => {
      const res = await request(app)
        .post('/api/auth/oidc/logout/local')
        .set('x-access-token', signFor(user))
        .send({});
      expect(res.body).toEqual({ success: true, message: 'Logged out locally' });
    });
  });
});
