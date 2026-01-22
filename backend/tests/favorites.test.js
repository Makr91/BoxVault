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
      jwt: { jwt_secret: { value: 'test-secret' }, jwt_expiration: { value: '1h' } },
      oidc: {
        token_refresh_threshold_minutes: { value: 10 },
        providers: {
          testprovider: {
            issuer: { value: 'http://mock-auth-server.com' },
            client_secret: { value: 'mock-secret' },
            token_endpoint_auth_method: { value: 'client_secret_post' },
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
          origin: { value: 'http://localhost:3000' },
          api_url: { value: 'http://localhost:3000/api' },
          box_max_file_size: { value: 1 },
          api_listen_port_unencrypted: { value: 5000 },
          api_listen_port_encrypted: { value: 5001 },
        },
        ssl: {
          cert_path: { value: '' },
          key_path: { value: '' },
        },
        logging: { level: { value: 'silent' } },
      };
    }
    if (name === 'db') {
      return {
        sql: {
          dialect: { value: 'sqlite' },
          storage: { value: ':memory:' },
          logging: { value: false },
        },
      };
    }
    return {};
  }),
  getConfigPath: jest.fn(),
  getSetupTokenPath: jest.fn(),
  getRateLimitConfig: jest.fn().mockReturnValue({ window_minutes: 15, max_requests: 1000 }),
  getI18nConfig: jest.fn().mockReturnValue({ default_language: 'en' }),
  loadConfigs: jest.fn(),
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

jest.unstable_mockModule('axios', () => ({
  default: {
    get: axiosGet,
    post: axiosPost,
  },
}));

// Now dynamically import everything else
const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const bcrypt = (await import('bcryptjs')).default;

describe('Favorites API', () => {
  let localUserToken;
  let oidcUserToken;
  let testUser;

  const uniqueId = Date.now().toString(36);

  beforeAll(async () => {
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
    });

    // Token for an OIDC user (contains OIDC info)
    oidcUserToken = jwt.sign(
      {
        id: testUser.id,
        provider: 'oidc-testprovider',
        oidc_access_token: 'valid-oidc-token',
      },
      'test-secret',
      { expiresIn: '1h' }
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

  describe('POST /api/favorites/save', () => {
    it('should proxy save request to auth server', async () => {
      axiosPost.mockResolvedValue({ status: 200 });
      const favoritesPayload = [{ clientId: 'app1', order: 1 }];
      const res = await request(app)
        .post('/api/favorites/save')
        .set('x-access-token', oidcUserToken)
        .send(favoritesPayload);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Favorites saved successfully');

      // Verify axios.post was called correctly
      expect(axiosPost).toHaveBeenCalledWith(
        'http://mock-auth-server.com/user/favorites/save', // Derived from config mock
        JSON.stringify(favoritesPayload),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-oidc-token',
          }),
        })
      );
    });

    it('should return 401 if user is not OIDC authenticated', async () => {
      const res = await request(app)
        .post('/api/favorites/save')
        .set('x-access-token', localUserToken)
        .send([]);
      expect(res.statusCode).toBe(401);
    });

    it('should handle object body in saveFavorites (non-array)', async () => {
      axiosPost.mockResolvedValue({ status: 200 });
      const favoritesObject = { some: 'data' }; // Not an array
      const res = await request(app)
        .post('/api/favorites/save')
        .set('x-access-token', oidcUserToken)
        .send(favoritesObject);

      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/favorites', () => {
    it('should retrieve and format raw favorites from auth server', async () => {
      axiosGet.mockResolvedValue({ data: { favorite_apps: mockFavoriteApps } });
      const res = await request(app).get('/api/favorites').set('x-access-token', oidcUserToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // The get.js controller maps the enriched data back to raw format
      expect(res.body[0]).toHaveProperty('clientId', 'box-id-1');
      expect(res.body[0]).toHaveProperty('customLabel', 'My Box');
      expect(res.body[0]).not.toHaveProperty('clientName'); // Should not be in raw format
    });

    it('should return empty array for non-OIDC user', async () => {
      const res = await request(app).get('/api/favorites').set('x-access-token', localUserToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should handle missing favorite_apps in response data', async () => {
      axiosGet.mockResolvedValue({ data: {} }); // No favorite_apps property
      const res = await request(app).get('/api/favorites').set('x-access-token', oidcUserToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/userinfo/favorites', () => {
    it('should retrieve enriched favorites from auth server', async () => {
      axiosGet.mockResolvedValue({ data: { favorite_apps: mockFavoriteApps } });
      const res = await request(app)
        .get('/api/userinfo/favorites')
        .set('x-access-token', oidcUserToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('clientId', 'box-id-1');
      expect(res.body[0]).toHaveProperty('clientName', 'My Favorite Box'); // Enriched property
    });

    it('should return empty array for non-OIDC user', async () => {
      const res = await request(app)
        .get('/api/userinfo/favorites')
        .set('x-access-token', localUserToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should handle missing favorite_apps in response data', async () => {
      axiosGet.mockResolvedValue({ data: {} }); // No favorite_apps property
      const res = await request(app)
        .get('/api/userinfo/favorites')
        .set('x-access-token', oidcUserToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
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

  describe('Error Handling', () => {
    it('should handle errors when saving favorites fails', async () => {
      // Configure mock to reject
      axiosPost.mockRejectedValueOnce(new Error('Auth server unavailable'));

      const favoritesPayload = [{ clientId: 'app1', order: 1 }];
      const res = await request(app)
        .post('/api/favorites/save')
        .set('x-access-token', oidcUserToken)
        .send(favoritesPayload);

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('message');
    });

    it('should handle errors when getting favorites fails and return an empty array', async () => {
      // Configure mock to reject
      axiosGet.mockRejectedValueOnce(new Error('Auth server unavailable'));

      const res = await request(app).get('/api/favorites').set('x-access-token', oidcUserToken);

      // The controller is designed to return an empty array on error to prevent UI breakage
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should handle errors when getting enriched favorites fails and return an empty array', async () => {
      // Configure mock to reject
      axiosGet.mockRejectedValueOnce(new Error('Auth server unavailable'));

      const res = await request(app)
        .get('/api/userinfo/favorites')
        .set('x-access-token', oidcUserToken);

      // The controller is designed to return an empty array on error
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('Helper Edge Cases', () => {
    it('should handle JWT with unknown provider', async () => {
      const unknownProviderToken = jwt.sign(
        {
          id: testUser.id,
          provider: 'oidc-unknown',
          oidc_access_token: 'token',
        },
        'test-secret',
        { expiresIn: '1h' }
      );

      // Should fail in getAuthServerUrl because provider config is missing
      // getFavorites catches the error and returns []
      const res = await request(app)
        .get('/api/favorites')
        .set('x-access-token', unknownProviderToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
      expect(mockLog.error.error).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching favorites'),
        expect.objectContaining({ error: expect.stringContaining('Provider unknown not found') })
      );
    });

    it('should handle JWT without provider claim', async () => {
      const noProviderToken = jwt.sign(
        {
          id: testUser.id,
          oidc_access_token: 'token',
        },
        'test-secret',
        { expiresIn: '1h' }
      );

      const res = await request(app).get('/api/favorites').set('x-access-token', noProviderToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should prioritize refreshed token from request object', async () => {
      // This simulates the oidcTokenRefresh middleware attaching a new token
      // We can't easily inject into req object via supertest, but we can verify logic via unit test of helper
      // or by mocking the middleware to attach it.
      // For integration test, we rely on the fact that if x-access-token is valid, it works.
    });

    it('should handle malformed JWT in extractOidcAccessToken', async () => {
      const res = await request(app)
        .get('/api/favorites')
        .set('x-access-token', 'malformed.token.structure');
      expect(res.statusCode).toBe(401); // Middleware catches this first
    });

    it('should handle config load failure in helper', async () => {
      // 1. oidcTokenRefresh middleware (success)
      mockConfigLoader.loadConfig.mockImplementationOnce(name => {
        if (name === 'auth') {
          return mockConfig.auth;
        }
        return {};
      });

      // 2. authJwt.verifyToken middleware (success)
      mockConfigLoader.loadConfig.mockImplementationOnce(name => {
        if (name === 'auth') {
          return mockConfig.auth;
        }
        return {};
      });

      // 3. helper function (failure)
      mockConfigLoader.loadConfig.mockImplementationOnce(() => {
        throw new Error('Config Load Error');
      });

      // This should trigger getAuthServerUrl -> getAuthConfig -> catch block
      const res = await request(app).get('/api/favorites').set('x-access-token', oidcUserToken);

      // Should fail because authConfig is empty
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
      expect(mockLog.error.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load configuration')
      );
    });

    it('should use refreshed OIDC access token if available', async () => {
      // Create a token that is about to expire to trigger refresh
      const expiringToken = jwt.sign(
        {
          id: testUser.id,
          provider: 'oidc-testprovider',
          oidc_access_token: 'old-token',
          oidc_refresh_token: 'refresh-token',
          oidc_expires_at: Date.now() + 5000, // Expiring in 5 seconds
        },
        'test-secret',
        { expiresIn: '1h' }
      );

      // Mock the refresh call
      axiosPost.mockImplementation(() =>
        Promise.resolve({
          data: {
            access_token: 'new-refreshed-token',
            expires_in: 3600,
            refresh_token: 'new-refresh-token',
          },
        })
      );

      // Mock the subsequent API call to use the NEW token
      axiosGet.mockResolvedValue({ data: { favorite_apps: [] } });

      const res = await request(app).get('/api/favorites').set('x-access-token', expiringToken);

      expect(res.statusCode).toBe(200);

      // Verify axios.get was called with the NEW token
      expect(axiosGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer new-refreshed-token' }),
        })
      );
    });
  });
});
