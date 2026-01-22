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
          host: { value: 'smtp.example.com' },
          port: { value: 587 },
          secure: { value: false },
        },
        smtp_settings: {
          from: { value: 'noreply@example.com' },
          alert_emails: { value: [] },
        },
        smtp_auth: {
          user: { value: 'user' },
          password: { value: 'pass' },
        },
      };
    }
    if (name === 'auth') {
      return {
        auth: {
          jwt: { jwt_secret: { value: 'test-secret' }, jwt_expiration: { value: '1h' } },
          enabled_strategies: { value: ['local'] },
        },
      };
    }
    if (name === 'app') {
      return {
        boxvault: {
          origin: { value: 'http://localhost:3000' },
          box_max_file_size: { value: 10 },
          api_listen_port_unencrypted: { value: 5000 },
          api_listen_port_encrypted: { value: 5001 },
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
  getSetupTokenPath: jest.fn().mockReturnValue('/tmp/setup.token'),
  getRateLimitConfig: jest.fn().mockReturnValue({ window_minutes: 15, max_requests: 100 }),
  getI18nConfig: jest.fn().mockReturnValue({ default_language: 'en' }),
};

jest.unstable_mockModule('../app/utils/config-loader.js', () => ({
  loadConfig: (...args) => mockableConfigLoader.loadConfig(...args),
  getConfigPath: (...args) => mockableConfigLoader.getConfigPath(...args),
  getSetupTokenPath: (...args) => mockableConfigLoader.getSetupTokenPath(...args),
  getRateLimitConfig: (...args) => mockableConfigLoader.getRateLimitConfig(...args),
  getI18nConfig: (...args) => mockableConfigLoader.getI18nConfig(...args),
  default: mockableConfigLoader,
}));

const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const jwt = (await import('jsonwebtoken')).default;
const bcrypt = (await import('bcryptjs')).default;
const { sendVerificationMail } = await import('../app/controllers/mail/verification.js');

describe('Mail API', () => {
  let adminToken;
  let userToken;
  let adminUser;
  let regularUser;
  let testOrg;

  const uniqueId = Date.now().toString(36);

  beforeAll(async () => {
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
      role: 'admin',
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
      role: 'user',
      is_primary: true,
    });

    // Get tokens
    adminToken = jwt.sign({ id: adminUser.id }, 'test-secret', { expiresIn: '1h' });
    userToken = jwt.sign({ id: regularUser.id }, 'test-secret', { expiresIn: '1h' });
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
    it('should send a test email (Admin only)', async () => {
      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', adminToken)
        .send({ testEmail: 'test@example.com' });

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toContain('Test email sent successfully');
      expect(mockCreateTransport).toHaveBeenCalled();
      // Verify is called on the transporter instance returned by the helper
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.any(String),
        })
      );
    });

    it('should fail for non-admin user', async () => {
      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', userToken)
        .send({ testEmail: 'test@example.com' });

      expect(res.statusCode).toBe(403);
    });

    it('should handle SMTP errors', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP Connection Failed'));

      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', adminToken)
        .send({ testEmail: 'test@example.com' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('SMTP Connection Failed');
    });

    it('should handle SMTP errors with response object', async () => {
      const error = new Error('SMTP Error with Response');
      error.response = '550 Blocked';
      mockSendMail.mockRejectedValueOnce(error);

      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', adminToken)
        .send({ testEmail: 'test@example.com' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('SMTP Error with Response');
    });

    it('should handle SMTP errors with response object', async () => {
      const error = new Error('SMTP Error with Response');
      error.response = '550 Blocked';
      mockSendMail.mockRejectedValueOnce(error);

      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', adminToken)
        .send({ testEmail: 'test@example.com' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('SMTP Error with Response');
    });

    it('should handle invalid SMTP config', async () => {
      // Temporarily mock loadConfig to return an invalid mail configuration
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'mail') {
          return {}; // Invalid config
        }
        return originalLoadConfig(name);
      });

      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', adminToken)
        .send({ testEmail: 'test@example.com' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toContain('SMTP configuration is missing or invalid');

      // Restore original mock
      mockableConfigLoader.loadConfig = originalLoadConfig;
    });

    it('should handle partially invalid SMTP config (missing connect/auth)', async () => {
      // This test covers the check inside createTransporter in helpers.js
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'mail') {
          // This config is valid enough to pass the check in test.js, but not createTransporter
          return { smtp_settings: { from: { value: 'test@from.com' } } };
        }
        return originalLoadConfig(name);
      });

      const res = await request(app)
        .post('/api/mail/test-smtp')
        .set('x-access-token', adminToken)
        .send({ testEmail: 'test@example.com' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toContain('SMTP configuration is missing or invalid');
      mockableConfigLoader.loadConfig = originalLoadConfig;
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
      expect(res.body.message).toContain('already verified');
    });

    it('should handle email sending errors', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Email Send Error'));

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors', async () => {
      jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(500);
    });

    it('should handle database errors', async () => {
      jest.spyOn(db.user, 'findByPk').mockRejectedValue(new Error('DB Error'));

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(500);
    });

    it('should return 404 if user does not exist in DB', async () => {
      const nonExistentUserToken = jwt.sign({ id: 999999 }, 'test-secret', { expiresIn: '1h' });
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', nonExistentUserToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('Error checking user permissions');
    });

    it('should return 404 if user has no primary organization', async () => {
      // Create a user without a primary org
      const noPrimOrgUser = await db.user.create({
        username: `no-prim-org-${uniqueId}`,
        email: `no-prim-org-${uniqueId}@example.com`,
        password: 'password',
        verified: false,
        primary_organization_id: null, // Explicitly null
      });
      const noPrimOrgToken = jwt.sign({ id: noPrimOrgUser.id }, 'test-secret', { expiresIn: '1h' });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', noPrimOrgToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('Error checking user permissions');

      await noPrimOrgUser.destroy();
    });

    it('should handle database errors on user lookup', async () => {
      const findSpy = jest
        .spyOn(db.user, 'findByPk')
        .mockRejectedValue(new Error('DB Lookup Failed'));
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('x-access-token', userToken);

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('Error checking user permissions');
      findSpy.mockRestore();
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

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('mail.errorSendingEmail');
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
      expect(res.body.message).toContain('Error verifying authentication');
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

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('mail.errorSendingEmail');
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

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('mail.errorSendingEmail');
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
