import { jest } from '@jest/globals';

// Mock nodemailer
const mockVerify = jest.fn().mockResolvedValue(true);
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
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
  t: jest.fn((key, locale, replacements) => {
    void locale;
    const translations = {
      'invitations.sent': 'Invitation sent successfully!',
      'invitations.valid': 'Invitation token is valid.',
      'invitations.deleted': 'Invitation deleted successfully.',
      'mail.invitationSubject': `Invitation to join ${replacements?.organizationName}`,
    };
    return translations[key] || key;
  }),
  configAwareI18nMiddleware: (req, res, next) => {
    void res;
    req.__ = (key, replacements) => mockI18n.t(key, 'en', replacements);
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

// Mock config-loader to provide valid configuration
const mockableConfigLoader = {
  loadConfig: jest.fn(name => {
    if (name === 'mail') {
      return {
        smtp_connect: {
          host: { value: 'smtp.example.com' },
          port: { value: 587 },
          secure: { value: false },
          rejectUnauthorized: { value: false },
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
const { default: app } = await import('../server.js');
const { default: db } = await import('../app/models/index.js');
const bcrypt = (await import('bcryptjs')).default;
const jwt = (await import('jsonwebtoken')).default;
const { sendInvitationMail } = await import('../app/controllers/mail/invitation.js');
const { sendInvitation } = await import('../app/controllers/auth/invitation/send.js');
const { validateInvitationToken } = await import('../app/controllers/auth/invitation/validate.js');
const { deleteInvitation } = await import('../app/controllers/auth/invitation/delete.js');
const { getActiveInvitations } = await import('../app/controllers/auth/invitation/get.js');

describe('Invitation API', () => {
  let adminToken;
  let userToken;
  let adminUser;
  let regularUser;
  let testOrg;
  let invitationToken;
  let invitationId;

  const uniqueId = Date.now().toString(36);
  const orgName = `InviteOrg_${uniqueId}`;
  const adminName = `InviteAdmin_${uniqueId}`;
  const userName = `InviteUser_${uniqueId}`;
  const inviteeEmail = `invitee-${uniqueId}@example.com`;

  beforeAll(async () => {
    const hashedPassword = await bcrypt.hash('password', 8);

    // Create Org
    testOrg = await db.organization.create({ name: orgName });

    // Create Admin User and link to Org
    adminUser = await db.user.create({
      username: adminName,
      email: `${adminName}@example.com`,
      password: hashedPassword,
      verified: true,
    });
    const adminRole = await db.role.findOne({ where: { name: 'admin' } });
    const moderatorRole = await db.role.findOne({ where: { name: 'moderator' } });
    await adminUser.setRoles([adminRole, moderatorRole]);
    await db.UserOrg.create({
      user_id: adminUser.id,
      organization_id: testOrg.id,
      role: 'admin',
      is_primary: true,
    });

    // Create Regular User and link to Org
    regularUser = await db.user.create({
      username: userName,
      email: `${userName}@example.com`,
      password: hashedPassword,
      verified: true,
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
    await db.invitation.destroy({ where: { email: inviteeEmail } });
  });

  beforeEach(() => {
    mockSendMail.mockClear();
  });

  describe('POST /api/auth/invite', () => {
    it('should fail for a regular user trying to send an invitation', async () => {
      const res = await request(app)
        .post('/api/auth/invite')
        .set('x-access-token', userToken)
        .send({
          email: inviteeEmail,
          organizationName: orgName,
        });
      expect(res.statusCode).toBe(403);
    });

    it('should allow an admin to send an invitation', async () => {
      const res = await request(app)
        .post('/api/auth/invite')
        .set('x-access-token', adminToken)
        .send({
          email: inviteeEmail,
          organizationName: orgName,
          inviteRole: 'user',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Invitation sent successfully!');
      expect(res.body).toHaveProperty('invitationToken');
      ({ invitationToken } = res.body); // Save for next test

      // Verify email was sent
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: inviteeEmail,
          subject: expect.stringContaining(orgName),
        })
      );
    });

    it('should return 404 if organization not found', async () => {
      const res = await request(app)
        .post('/api/auth/invite')
        .set('x-access-token', adminToken)
        .send({
          email: 'test@test.com',
          organizationName: 'NonExistentOrg',
        });
      expect(res.statusCode).toBe(404);
    });

    it('should return 400 if invalid role', async () => {
      const res = await request(app)
        .post('/api/auth/invite')
        .set('x-access-token', adminToken)
        .send({
          email: 'test@test.com',
          organizationName: orgName,
          inviteRole: 'admin', // Only user/moderator allowed
        });
      expect(res.statusCode).toBe(400);
    });

    it('should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .post('/api/auth/invite')
        .set('x-access-token', adminToken)
        .send({});
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });

    it('should handle app config loading failure', async () => {
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'app') {
          throw new Error('App Config Load Error');
        }
        return originalLoadConfig(name);
      });

      const res = await request(app)
        .post('/api/auth/invite')
        .set('x-access-token', adminToken)
        .send({ email: 'app-config-fail@example.com', organizationName: orgName });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('invitations.send.error');

      mockableConfigLoader.loadConfig = originalLoadConfig;
    });

    it('should handle SMTP config loading failure', async () => {
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'mail') {
          return {}; // Invalid config
        }
        return originalLoadConfig(name);
      });

      const res = await request(app)
        .post('/api/auth/invite')
        .set('x-access-token', adminToken)
        .send({ email: 'smtp-fail@example.com', organizationName: orgName });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toContain('invitations.send.error');

      mockableConfigLoader.loadConfig = originalLoadConfig;
    });

    it('should handle mail sending transport error', async () => {
      mockCreateTransport.mockImplementation(() => {
        throw new Error('Transport Error');
      });

      const res = await request(app)
        .post('/api/auth/invite')
        .set('x-access-token', adminToken)
        .send({ email: 'transport-fail@example.com', organizationName: orgName });

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('invitations.send.error');

      // Restore mock
      mockCreateTransport.mockReturnValue({ sendMail: mockSendMail, verify: mockVerify });
    });
  });

  describe('GET /api/auth/validate-invitation/:token', () => {
    it('should validate a correct invitation token', async () => {
      const res = await request(app).get(`/api/auth/validate-invitation/${invitationToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Invitation token is valid.');
      expect(res.body).toHaveProperty('email', inviteeEmail);
      expect(res.body).toHaveProperty('organizationName', orgName);
    });

    it('should return 400 or 404 for an invalid invitation token', async () => {
      const res = await request(app).get('/api/auth/validate-invitation/invalidtoken');
      expect([400, 404]).toContain(res.statusCode);
    });

    it('should handle database errors', async () => {
      jest.spyOn(db.invitation, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app).get(`/api/auth/validate-invitation/${invitationToken}`);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });
  });

  describe('GET /api/invitations/active/:organization', () => {
    it('should list active invitations for an organization moderator/admin', async () => {
      const res = await request(app)
        .get(`/api/invitations/active/${orgName}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      const sentInvitation = res.body.find(inv => inv.email === inviteeEmail);
      expect(sentInvitation).toBeDefined();
      invitationId = sentInvitation.id; // Save for delete test
    });

    it('should return 404 if organization not found', async () => {
      const res = await request(app)
        .get('/api/invitations/active/NonExistentOrg')
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(404);
    });

    it('should handle database errors', async () => {
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .get(`/api/invitations/active/${orgName}`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });
  });

  describe('DELETE /api/invitations/:invitationId', () => {
    it('should allow an admin to delete an invitation', async () => {
      const res = await request(app)
        .delete(`/api/invitations/${invitationId}`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Invitation deleted successfully.');
    });

    it('should return 404 when trying to delete a non-existent invitation', async () => {
      const res = await request(app)
        .delete(`/api/invitations/99999`)
        .set('x-access-token', adminToken);

      expect(res.statusCode).toBe(404);
    });

    it('should handle database errors', async () => {
      jest.spyOn(db.invitation, 'findByPk').mockRejectedValue(new Error('DB Error'));
      const res = await request(app)
        .delete(`/api/invitations/${invitationId}`)
        .set('x-access-token', adminToken);
      expect(res.statusCode).toBe(500);
      jest.restoreAllMocks();
    });
  });

  describe('Invitation Controller Unit Tests', () => {
    let req;
    let res;
    beforeEach(() => {
      req = { body: {}, params: {}, __: key => key, getLocale: () => 'en' };
      res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
    });

    it('sendInvitation should handle missing body', async () => {
      req.body = undefined;
      const findSpy = jest.spyOn(db.organization, 'findOne').mockResolvedValue(null);
      await sendInvitation(req, res);
      // Should fail validation or organization lookup
      expect(res.status).toHaveBeenCalledWith(404); // Org not found (undefined)
      findSpy.mockRestore();
    });

    it('sendInvitation should default to user role', async () => {
      req.body = { email: 'test@test.com', organizationName: orgName };
      // Mock organization find
      jest.spyOn(db.organization, 'findOne').mockResolvedValue({ id: 1 });
      // Mock create
      jest.spyOn(db.invitation, 'create').mockResolvedValue({});

      await sendInvitation(req, res);

      expect(db.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({ invited_role: 'user' })
      );
    });

    it('validateInvitationToken should return 400 if token missing', async () => {
      req.params.token = undefined;
      await validateInvitationToken(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('deleteInvitation should handle fallback error message', async () => {
      req.params.invitationId = 1;
      jest.spyOn(db.invitation, 'findByPk').mockRejectedValue(new Error(''));
      await deleteInvitation(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'invitations.delete.error' })
      );
    });

    it('getActiveInvitations should handle fallback error message', async () => {
      req.params.organization = orgName;
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      await getActiveInvitations(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'invitations.get.error' })
      );
    });

    it('sendInvitation should handle fallback error message', async () => {
      req.body = { email: 'test@test.com', organizationName: orgName };
      jest.spyOn(db.organization, 'findOne').mockRejectedValue(new Error(''));
      await sendInvitation(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'invitations.send.error' })
      );
    });

    it('validateInvitationToken should handle database errors', async () => {
      req.params.token = 'valid-token';
      jest.spyOn(db.invitation, 'findOne').mockRejectedValue(new Error('DB Error'));
      await validateInvitationToken(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('validateInvitationToken should handle error with fallback message', async () => {
      req.params.token = 'valid-token';
      jest.spyOn(db.invitation, 'findOne').mockRejectedValue(new Error(''));
      await validateInvitationToken(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Error validating invitation.' })
      );
    });
  });

  describe('Mail Controller Unit Tests', () => {
    it('should use default locale if not provided', async () => {
      mockI18n.t.mockClear();
      await sendInvitationMail('default-locale@test.com', 'token', 'OrgName', Date.now() + 10000);
      expect(mockI18n.t).toHaveBeenCalledWith(expect.any(String), 'en', expect.any(Object));
    });

    it('should use fallback URL if app config origin is missing', async () => {
      const originalLoadConfig = mockableConfigLoader.loadConfig;
      mockableConfigLoader.loadConfig = jest.fn(name => {
        if (name === 'app') {
          return { boxvault: {} }; // Missing origin
        }
        return originalLoadConfig(name);
      });

      const link = await sendInvitationMail(
        'fallback-url@test.com',
        'token',
        'OrgName',
        Date.now() + 10000
      );

      expect(link).toContain('http://localhost:3000');

      mockableConfigLoader.loadConfig = originalLoadConfig;
    });
  });
});
