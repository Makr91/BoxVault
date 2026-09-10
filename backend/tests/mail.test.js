import { jest } from '@jest/globals';

// Define mockLog globally
const mockLog = {
  error: { error: jest.fn() },
  app: { info: jest.fn(), warn: jest.fn() },
  api: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  database: { error: jest.fn(), info: jest.fn() },
  auth: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
};

// Mock nodemailer
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const mockVerify = jest.fn().mockResolvedValue(true);
const mockCreateTransport = jest.fn().mockReturnValue({
  sendMail: mockSendMail,
  verify: mockVerify,
});
const mockGetTestMessageUrl = jest.fn().mockReturnValue('http://ethereal.email/message/test-id');

jest.unstable_mockModule('nodemailer', () => ({
  createTransport: mockCreateTransport,
  getTestMessageUrl: mockGetTestMessageUrl,
  default: { createTransport: mockCreateTransport, getTestMessageUrl: mockGetTestMessageUrl },
}));

// Mock i18n to avoid config loading issues and provide req.__
const mockI18n = {
  t: jest.fn(key => {
    const translations = {
      'mail.testEmailSent': 'Test email sent successfully',
      'auth.verificationEmailResent': 'Verification email resent',
      'auth.userAlreadyVerified': 'User is already verified.',
    };
    return translations[key] || key;
  }),
  configAwareI18nMiddleware: (req, res, next) => {
    void res;
    req.__ = key => mockI18n.t(key);
    req.getLocale = () => 'en';
    next();
  },
  i18nMiddleware: (req, res, next) => {
    void req;
    void res;
    next();
  },
  getDefaultLocale: () => 'en',
  getSupportedLocales: () => ['en'],
  findBestMatchingLocale: (requestedLocale, supportedLocales) => {
    if (!requestedLocale) {
      return 'en';
    }
    const lowered = requestedLocale.toLowerCase();
    if (supportedLocales.includes(lowered)) {
      return lowered;
    }
    const [prefix] = lowered.split('-');
    return supportedLocales.find(locale => locale.startsWith(prefix)) || 'en';
  },
  initI18n: jest.fn(),
};
jest.unstable_mockModule('../app/config/i18n.js', () => mockI18n);

jest.unstable_mockModule('../app/utils/Logger.js', () => ({
  log: mockLog,
  morganMiddleware: (req, res, next) => {
    void req;
    void res;
    next();
  },
}));

// Mock config-loader to provide valid configuration
const mockableConfigLoader = {
  loadConfig: jest.fn(name => {
    if (name === 'mail') {
      return {
        smtp_connect: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
        },
        smtp_settings: {
          from: 'noreply@example.com',
          alert_emails: [],
        },
        smtp_auth: {
          user: 'user',
          password: 'pass',
        },
      };
    }
    if (name === 'auth') {
      return {
        auth: {
          jwt: { jwt_secret: 'test-secret', jwt_expiration: '1h' },
        },
      };
    }
    if (name === 'app') {
      return {
        boxvault: {
          origin: 'http://localhost:3000',
          box_max_file_size: 10,
          api_listen_port_unencrypted: 5000,
          api_listen_port_encrypted: 5001,
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
  getSetupTokenPath: jest.fn().mockReturnValue('/tmp/setup.token'),
  getRateLimitConfig: jest.fn().mockReturnValue({ window_minutes: 15, max_requests: 100 }),
  getI18nConfig: jest.fn().mockReturnValue({ default_language: 'en' }),
  saveConfig: jest.fn().mockResolvedValue([]),
  reloadConfig: jest.fn().mockResolvedValue(),
  getConfigDir: jest.fn().mockReturnValue('/tmp'),
  setupTokenGuard: jest.fn((req, res) => {
    void req;
    res.status(403).end();
  }),
  isProduction: false,
  CONFIG_NAMES: ['app', 'auth', 'db', 'mail'],
};

jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
  loadConfig: (...args) => mockableConfigLoader.loadConfig(...args),
  getConfigPath: (...args) => mockableConfigLoader.getConfigPath(...args),
  getSetupTokenPath: (...args) => mockableConfigLoader.getSetupTokenPath(...args),
  setupTokenGuard: (...args) => mockableConfigLoader.setupTokenGuard(...args),
  getRateLimitConfig: (...args) => mockableConfigLoader.getRateLimitConfig(...args),
  getI18nConfig: (...args) => mockableConfigLoader.getI18nConfig(...args),
  saveConfig: (...args) => mockableConfigLoader.saveConfig(...args),
  reloadConfig: (...args) => mockableConfigLoader.reloadConfig(...args),
  getConfigDir: (...args) => mockableConfigLoader.getConfigDir(...args),
  isProduction: mockableConfigLoader.isProduction,
  CONFIG_NAMES: mockableConfigLoader.CONFIG_NAMES,
  default: mockableConfigLoader,
}));

const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const jwt = (await import('jsonwebtoken')).default;
const bcrypt = (await import('bcryptjs')).default;
const { sendVerificationMail } = await import('../app/controllers/mail/verification.js');

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

describe('Mail API', () => {
  let adminToken;
  let userToken;
  let adminUser;
  let regularUser;
  let testOrg;

  const uniqueId = Date.now().toString(36);

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);

    const hashedPassword = await bcrypt.hash('password', 8);

    // Create Org
    testOrg = await db.organization.create({ name: `MailOrg-${uniqueId}` });

    // Create Admin User
    adminUser = await db.user.create({
      username: `MailAdmin-${uniqueId}`,
      email: `mail-admin-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: true,
      primary_organization_id: testOrg.id,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    await adminUser.setRoles([adminRole]);
    await db.UserOrg.create({
      user_id: adminUser.id,
      organization_id: testOrg.id,
      role: 'owner',
      is_primary: true,
    });

    // Create Regular User (Unverified)
    regularUser = await db.user.create({
      username: `MailUser-${uniqueId}`,
      email: `mail-user-${uniqueId}@example.com`,
      password: hashedPassword,
      verified: false,
      primary_organization_id: testOrg.id,
    });
    const userRole = await db.role.findOne({ where: { name: 'user' } });
    await regularUser.setRoles([userRole]);
    await db.UserOrg.create({
      user_id: regularUser.id,
      organization_id: testOrg.id,
      role: 'member',
      is_primary: true,
    });

    // Get tokens
    adminToken = jwt.sign({ id: adminUser.id }, 'test-secret', {
      expiresIn: '1h',
      ...TEST_JWT_CLAIMS,
    });
    userToken = jwt.sign({ id: regularUser.id }, 'test-secret', {
      expiresIn: '1h',
      ...TEST_JWT_CLAIMS,
    });
  });

  afterAll(async () => {
    await db.user.destroy({ where: { id: [adminUser.id, regularUser.id] } });
    await db.organization.destroy({ where: { id: testOrg.id } });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLog.error.error.mockClear();
  });

  describe('POST /api/mail/test-smtp', () => {
    it('should send the test message to the caller with the form values laid over the file', async () => {
      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', adminToken)
        .send({ smtp_connect: { host: 'form.example', port: 2525 } });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Test email sent successfully');
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'form.example', port: 2525, secure: false })
      );
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: adminUser.email,
          from: 'noreply@example.com',
          subject: expect.any(String),
        })
      );
    });

    it('should fail for non-admin user', async () => {
      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', userToken)
        .send({});

      expect(res.statusCode).toBe(403);
    });

    it('should handle SMTP errors', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP Connection Failed'));

      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', adminToken)
        .send({});

      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBe('60');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/send-failed');
      expect(res.body.title).toBe('mail.errorSendingEmail');
    });

    it('should handle SMTP errors with response object', async () => {
      const error = new Error('SMTP Error with Response');
      error.response = '550 Blocked';
      mockSendMail.mockRejectedValueOnce(error);

      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', adminToken)
        .send({});

      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBe('60');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/send-failed');
      expect(res.body.title).toBe('mail.errorSendingEmail');
    });

    it('should refuse a form without a host or a sender as send-failed', async () => {
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'mail') {
          return { smtp_settings: { from: 'test@from.com' } };
        }
        return originalLoadConfig(name);
      });

      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', adminToken)
        .send({});

      mockableConfigLoader.loadConfig = originalLoadConfig;

      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBe('60');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/send-failed');
      expect(res.body.title).toBe('mail.errorSendingEmail');
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    it('should resend verification email for unverified user', async () => {
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Verification email resent');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: regularUser.email,
        })
      );
    });

    it('should fail if user is already verified', async () => {
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', adminToken); // Admin is verified

      expect(res.statusCode).toBe(400);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/bad-request');
      expect(res.body.title).toContain('already verified');
    });

    it('should handle email sending errors', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Email Send Error'));

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBe('60');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/send-failed');
    });

    it('should handle database errors', async () => {
      const findSpy = jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      findSpy.mockRestore();
      expect(res.statusCode).toBe(500);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
      expect(res.body.title).toBe('auth.verificationError');
    });

    it('should handle database errors', async () => {
      const findSpy = jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      findSpy.mockRestore();
      expect(res.statusCode).toBe(500);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
      expect(res.body.title).toBe('auth.verificationError');
    });

    it('should return 401 if user does not exist in DB', async () => {
      const nonExistentUserToken = jwt.sign({ id: 999999 }, 'test-secret', {
        expiresIn: '1h',
        ...TEST_JWT_CLAIMS,
      });
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', nonExistentUserToken);

      expect(res.statusCode).toBe(401);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/authentication');
      expect(res.body.title).toContain('users.userNotFound');
    });

    it('should return 403 if user has no roles', async () => {
      const noPrimOrgUser = await db.user.create({
        username: `no-prim-org-${uniqueId}`,
        email: `no-prim-org-${uniqueId}@example.com`,
        password: 'password',
        verified: false,
        primary_organization_id: null,
      });
      const noPrimOrgToken = jwt.sign({ id: noPrimOrgUser.id }, 'test-secret', {
        expiresIn: '1h',
        ...TEST_JWT_CLAIMS,
      });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', noPrimOrgToken);

      expect(res.statusCode).toBe(403);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/forbidden');
      expect(res.body.title).toContain('auth.requireUserOrAdmin');

      await noPrimOrgUser.destroy();
    });

    it('should handle database errors on user lookup', async () => {
      const findSpy = jest
        .spyOn(db.user, 'findByPk')
        .mockRejectedValue(new Error('DB Lookup Failed'));
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      findSpy.mockRestore();
      expect(res.statusCode).toBe(500);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
      expect(res.body.title).toBe('auth.verificationError');
    });

    it('should handle mail config loading failure', async () => {
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'mail') {
          throw new Error('Mail Config Read Error');
        }
        return originalLoadConfig(name);
      });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBe('60');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/send-failed');
      expect(res.body.title).toContain('mail.errorSendingEmail');
      mockableConfigLoader.loadConfig = originalLoadConfig;
    });

    it('should handle auth config loading failure', async () => {
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'auth') {
          throw new Error('Auth Config Read Error');
        }
        return originalLoadConfig(name);
      });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/internal');
      expect(res.body.title).toContain('auth.verificationError');
      mockableConfigLoader.loadConfig = originalLoadConfig;
    });

    it('should handle app config loading failure', async () => {
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'app') {
          throw new Error('App Config Read Error');
        }
        return originalLoadConfig(name);
      });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBe('60');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/send-failed');
      expect(res.body.title).toContain('mail.errorSendingEmail');
      mockableConfigLoader.loadConfig = originalLoadConfig;
    });

    it('should handle invalid mail config object to cover verification.js branch', async () => {
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'mail') {
          return { smtp_settings: {} };
        } // Return partially invalid object
        return originalLoadConfig(name);
      });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBe('60');
      expect(res.body.type).toBe('https://auth.startcloud.com/probs/send-failed');
      expect(res.body.title).toContain('mail.errorSendingEmail');
      mockableConfigLoader.loadConfig = originalLoadConfig;
    });
  });

  describe('Mail Controller Unit Tests (Verification)', () => {
    it('should use default locale if not provided', async () => {
      const user = { email: 'default-locale@test.com' };
      mockI18n.t.mockClear();
      await sendVerificationMail(user, 'token', Date.now() + 10000);
      expect(mockI18n.t).toHaveBeenCalledWith(expect.any(String), 'en');
    });

    it('should use fallback URL if app config origin is missing', async () => {
      const user = { email: 'fallback-url@test.com' };
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'app') {
          return { boxvault: {} }; // Missing origin
        }
        return originalLoadConfig(name);
      });

      mockSendMail.mockClear();
      await sendVerificationMail(user, 'token', Date.now() + 10000);

      const [[callArgs]] = mockSendMail.mock.calls;
      expect(callArgs.html).toContain('http://localhost:3000');

      mockableConfigLoader.loadConfig = originalLoadConfig;
    });

    it('should log preview URL in non-production environment', async () => {
      const user = { email: 'preview-url@test.com' };
      await sendVerificationMail(user, 'token', Date.now() + 10000);
      expect(mockLog.app.info).toHaveBeenCalledWith(
        'Preview URL: %s',
        'http://ethereal.email/message/test-id'
      );
    });
  });
});
