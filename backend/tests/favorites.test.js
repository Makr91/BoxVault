// DO NOT IMPLEMENT UNIT TESTS!

// ONLY INTEGRATION TESTS!

import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// Mock Logger
const mockLog = {
  auth: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
  error: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  app: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  api: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  database: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  file: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
};
jest.unstable_mockModule('../app/utils/Logger.js', () => ({
  log: mockLog,
  morganMiddleware: (req, res, next) => {
    void req;
    void res;
    next();
  },
}));

// Mock Passport to prevent OIDC discovery during startup
jest.unstable_mockModule('../app/auth/passport.js', () => ({
  passport: {
    initialize: () => (req, res, next) => {
      void req;
      void res;
      next();
    },
    session: () => (req, res, next) => {
      void req;
      void res;
      next();
    },
    use: jest.fn(),
  },
  initializeStrategies: jest.fn().mockResolvedValue(),
  getOidcConfiguration: jest.fn().mockReturnValue({
    serverMetadata: () => ({ token_endpoint: 'http://mock-auth-server.com/token' }),
    clientId: 'client-id',
  }),
  buildAuthorizationUrl: jest.fn(),
  buildEndSessionUrl: jest.fn(),
  handleOidcCallback: jest.fn(),
}));

// Mock Config Loader
const mockConfig = {
  auth: {
    auth: {
      jwt: { jwt_secret: 'test-secret', jwt_expiration: '1h' },
      oidc: {
        token_refresh_threshold_minutes: 10,
        providers: {
          testprovider: {
            issuer: 'http://mock-auth-server.com',
            client_secret: 'mock-secret',
            token_endpoint_auth_method: 'client_secret_post',
          },
        },
      },
    },
  },
};

const mockConfigLoader = {
  loadConfig: jest.fn(name => {
    if (name === 'auth') {
      return mockConfig.auth;
    }
    if (name === 'app') {
      return {
        boxvault: {
          origin: 'http://localhost:3000',
          api_url: 'http://localhost:3000/api',
          box_max_file_size: 1,
          api_listen_port_unencrypted: 5000,
          api_listen_port_encrypted: 5001,
        },
        ssl: {
          cert_path: '',
          key_path: '',
        },
        logging: { level: 'silent' },
      };
    }
    if (name === 'db') {
      return {
        sql: {
          dialect: 'sqlite',
          storage: ':memory:',
          logging: false,
        },
      };
    }
    return {};
  }),
  getConfigPath: jest.fn(),
  getSetupTokenPath: jest.fn(),
  checkConfigs: jest.fn().mockReturnValue([]),
  loadSchema: jest.fn().mockReturnValue({ properties: {} }),
  readConfigFile: jest.fn(name => mockConfigLoader.loadConfig(name)),
  fillDefaults: jest.fn((schema, config) => {
    void schema;
    return config;
  }),
  validateConfig: jest.fn().mockReturnValue([]),
  unknownKeys: jest.fn().mockReturnValue([]),
  CONFIG_NAMES: ['app', 'auth', 'db', 'mail'],
  getRateLimitConfig: jest.fn().mockReturnValue({
    window_minutes: 15,
    max_requests: 1000,
    message: 'Too many requests from this IP, please try again later.',
    skip_successful_requests: false,
    skip_failed_requests: false,
    file_operations_max_requests: 1000,
    download_max_requests: 1000,
    download_link_max_requests: 1000,
    architecture_operations_max_requests: 1000,
  }),
  getI18nConfig: jest.fn().mockReturnValue({ default_language: 'en' }),
  loadConfigs: jest.fn(),
  clearConfigCache: jest.fn(),
  getConfigDir: jest.fn().mockReturnValue('/tmp'),
  isProduction: true,
};
jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
  ...mockConfigLoader,
  default: mockConfigLoader,
}));

// Mock Axios
const mockFavoriteApps = [
  {
    clientId: 'box-id-1',
    clientName: 'My Favorite Box',
    customLabel: 'My Box',
    order: 1,
  },
];

const axiosPost = jest.fn();
const axiosGet = jest.fn();
const axiosPut = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    get: axiosGet,
    post: axiosPost,
    put: axiosPut,
  },
}));

// Now dynamically import everything else
const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const bcrypt = (await import('bcryptjs')).default;

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('Favorites API', () => {
  let localUserToken;
  let oidcUserToken;
  let testUser;

  const uniqueId = Date.now().toString(36);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);

    // Create a user to get a valid JWT for the auth middleware
    const hashedPassword = await bcrypt.hash('password', 8);
    testUser = await db.user.create({
      username: `fav-user-${uniqueId}`,
      email: `fav-user-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await testUser.setRoles([userRole]);

    // Token for a local user (no OIDC info)
    localUserToken = jwt.sign({ id: testUser.id, provider: 'local' }, 'test-secret', {
      expiresIn: '1h',
      ...TEST_JWT_CLAIMS,
    });

    // Token for an OIDC user (contains OIDC info)
    oidcUserToken = jwt.sign(
      {
        id: testUser.id,
        provider: 'oidc-testprovider',
        oidc_access_token: 'valid-oidc-token',
      },
      'test-secret',
      { expiresIn: '1h', ...TEST_JWT_CLAIMS }
    );
  });

  afterAll(async () => {
    await db.user.destroy({ where: { id: testUser.id } });
  });

  // Clear mocks after each test
  afterEach(() => {
    axiosPost.mockClear();
    axiosGet.mockClear();
    jest.clearAllMocks();
  });

  describe('the retired raw favorites routes', () => {
    it('should no longer answer POST /api/favorites/save', async () => {
      const res = await request(app)
        .post('/api/favorites/save')
        .set('x-access-token', oidcUserToken)
        .send([{ clientId: 'app1', order: 1 }]);
      expect(res.statusCode).toBe(404);
      expect(axiosPost).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/user/favorites', () => {
    it('should forward to the identity provider and answer its body unmapped', async () => {
      const favorites = [{ clientId: 'app1', customLabel: 'One', order: 1 }];
      axiosGet.mockResolvedValue({ status: 200, data: favorites });
      const res = await request(app)
        .get('/api/user/favorites')
        .set('x-access-token', oidcUserToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(favorites);
      expect(axiosGet).toHaveBeenCalledWith('http://mock-auth-server.com/api/user/favorites', {
        headers: { Authorization: 'Bearer valid-oidc-token', 'Content-Type': 'application/json' },
      });
    });

    it('should answer an empty list to a session without an OIDC access token', async () => {
      const res = await request(app)
        .get('/api/user/favorites')
        .set('x-access-token', localUserToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
      expect(axiosGet).not.toHaveBeenCalled();
    });

    it('should pass the identity provider refusal through and answer 502 when it is down', async () => {
      axiosGet.mockRejectedValueOnce({ message: 'Forbidden', response: { status: 403, data: {} } });
      const refused = await request(app)
        .get('/api/user/favorites')
        .set('x-access-token', oidcUserToken);
      expect(refused.statusCode).toBe(403);
      expect(refused.body).toEqual({ error: 'NOTIFICATIONS_NOT_AUTHORIZED' });

      axiosGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const down = await request(app)
        .get('/api/user/favorites')
        .set('x-access-token', oidcUserToken);
      expect(down.statusCode).toBe(502);
      expect(down.body).toEqual({ error: 'AUTH_SERVER_UNAVAILABLE' });
    });
  });

  describe('PUT /api/user/favorites', () => {
    it('should forward the body to the identity provider and answer its status', async () => {
      const favorites = [{ clientId: 'app1', customLabel: 'One', order: 1 }];
      axiosPut.mockResolvedValue({ status: 200, data: favorites });
      const res = await request(app)
        .put('/api/user/favorites')
        .set('x-access-token', oidcUserToken)
        .send(favorites);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(favorites);
      expect(axiosPut).toHaveBeenCalledWith(
        'http://mock-auth-server.com/api/user/favorites',
        favorites,
        {
          headers: { Authorization: 'Bearer valid-oidc-token', 'Content-Type': 'application/json' },
        }
      );
    });

    it('should require an OIDC access token', async () => {
      const res = await request(app)
        .put('/api/user/favorites')
        .set('x-access-token', localUserToken)
        .send([]);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'OIDC_ACCESS_TOKEN_REQUIRED' });
      expect(axiosPut).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/userinfo/claims', () => {
    it('should retrieve full claims from auth server', async () => {
      const mockClaims = {
        sub: 'user123',
        email: 'test@example.com',
        favorite_apps: mockFavoriteApps,
      };
      axiosGet.mockResolvedValue({ data: mockClaims });

      const res = await request(app)
        .get('/api/userinfo/claims')
        .set('x-access-token', oidcUserToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('sub', 'user123');
      expect(res.body).toHaveProperty('favorite_apps');
      expect(res.body.favorite_apps).toHaveLength(1);
    });

    it('should return minimal claims for non-OIDC user', async () => {
      const res = await request(app)
        .get('/api/userinfo/claims')
        .set('x-access-token', localUserToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('sub', testUser.id);
      expect(res.body.favorite_apps).toEqual([]);
    });

    it('should handle auth server errors gracefully', async () => {
      axiosGet.mockRejectedValue(new Error('Auth Server Error'));
      const res = await request(app)
        .get('/api/userinfo/claims')
        .set('x-access-token', oidcUserToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.favorite_apps).toEqual([]);
    });
  });

  describe('Helper Edge Cases', () => {
    it('should answer 502 for a JWT with an unknown provider', async () => {
      const unknownProviderToken = jwt.sign(
        {
          id: testUser.id,
          provider: 'oidc-unknown',
          oidc_access_token: 'token',
        },
        'test-secret',
        { expiresIn: '1h', ...TEST_JWT_CLAIMS }
      );

      const res = await request(app)
        .get('/api/user/favorites')
        .set('x-access-token', unknownProviderToken);
      expect(res.statusCode).toBe(502);
      expect(res.body).toEqual({ error: 'AUTH_SERVER_UNAVAILABLE' });
      expect(mockLog.error.error).toHaveBeenCalledWith(
        'Failed to get auth server URL:',
        expect.stringContaining('Provider unknown not found')
      );
    });

    it('should answer 502 for a JWT without a provider claim', async () => {
      const noProviderToken = jwt.sign(
        {
          id: testUser.id,
          oidc_access_token: 'token',
        },
        'test-secret',
        { expiresIn: '1h', ...TEST_JWT_CLAIMS }
      );

      const res = await request(app)
        .get('/api/user/favorites')
        .set('x-access-token', noProviderToken);
      expect(res.statusCode).toBe(502);
      expect(res.body).toEqual({ error: 'AUTH_SERVER_UNAVAILABLE' });
    });

    it('should refuse a malformed JWT before the helper runs', async () => {
      const res = await request(app)
        .get('/api/user/favorites')
        .set('x-access-token', 'malformed.token.structure');
      expect(res.statusCode).toBe(401);
    });

    it('should answer 502 when the auth configuration cannot be loaded in the helper', async () => {
      mockConfigLoader.loadConfig.mockImplementationOnce(name => {
        if (name === 'auth') {
          return mockConfig.auth;
        }
        return {};
      });

      mockConfigLoader.loadConfig.mockImplementationOnce(name => {
        if (name === 'auth') {
          return mockConfig.auth;
        }
        return {};
      });

      mockConfigLoader.loadConfig.mockImplementationOnce(name => {
        if (name === 'auth') {
          return mockConfig.auth;
        }
        return {};
      });

      mockConfigLoader.loadConfig.mockImplementationOnce(name => {
        if (name === 'auth') {
          return mockConfig.auth;
        }
        return {};
      });

      mockConfigLoader.loadConfig.mockImplementationOnce(() => {
        throw new Error('Config Load Error');
      });

      const res = await request(app)
        .get('/api/user/favorites')
        .set('x-access-token', oidcUserToken);

      expect(res.statusCode).toBe(502);
      expect(res.body).toEqual({ error: 'AUTH_SERVER_UNAVAILABLE' });
      expect(mockLog.error.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load configuration')
      );
    });

    it('should use the refreshed OIDC access token when the session token is about to expire', async () => {
      const expiringToken = jwt.sign(
        {
          id: testUser.id,
          provider: 'oidc-testprovider',
          oidc_access_token: 'old-token',
          oidc_refresh_token: 'refresh-token',
          oidc_expires_at: Date.now() + 5000,
        },
        'test-secret',
        { expiresIn: '1h', ...TEST_JWT_CLAIMS }
      );

      axiosPost.mockImplementation(() =>
        Promise.resolve({
          data: {
            access_token: 'new-refreshed-token',
            expires_in: 3600,
            refresh_token: 'new-refresh-token',
          },
        })
      );

      axiosGet.mockResolvedValue({ status: 200, data: [] });

      const res = await request(app)
        .get('/api/user/favorites')
        .set('x-access-token', expiringToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);

      expect(axiosGet).toHaveBeenCalledWith(
        'http://mock-auth-server.com/api/user/favorites',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer new-refreshed-token' }),
        })
      );
    });
  });
});
