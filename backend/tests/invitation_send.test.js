import { jest } from '@jest/globals';

const mockLog = {
  error: { error: jest.fn() },
  app: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
};

const mockDb = {
  organization: { findOne: jest.fn() },
  invitation: { findAll: jest.fn(), create: jest.fn() },
  user: { findOne: jest.fn() },
  UserOrg: { findUserOrgRole: jest.fn() },
};

const mockConfigLoader = {
  loadConfig: jest.fn(() => ({ auth: { jwt: {} } })),
};

const mockMail = {
  sendVerificationMail: jest.fn(),
  resendVerificationMail: jest.fn(),
  sendInvitationMail: jest.fn().mockResolvedValue('https://boxvault.example.com/invite/token'),
  testSmtp: jest.fn(),
};

const mockExternalInvites = {
  getS2sToken: jest.fn(),
  createExternalInvite: jest.fn(),
  listExternalInvites: jest.fn(),
  deleteExternalInvite: jest.fn(),
};

const mockUserLanguage = {
  toSupportedLanguage: jest.fn(),
  organizationLanguage: jest.fn(),
  resolveUserLanguages: jest.fn(),
  resolveUserLanguage: jest.fn(),
  resolveEmailLanguage: jest.fn().mockResolvedValue('es'),
};

const mockFavoriteHelpers = {
  getAuthServerUrl: jest.fn(),
  extractOidcAccessToken: jest.fn().mockReturnValue(null),
};

jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));
jest.unstable_mockModule('../app/models/index.js', () => ({ default: mockDb }));
jest.unstable_mockModule('../app/utils/config-loader.js', () => mockConfigLoader);
jest.unstable_mockModule('../app/controllers/mail.controller.js', () => mockMail);
jest.unstable_mockModule('../app/utils/externalInvites.js', () => mockExternalInvites);
jest.unstable_mockModule('../app/utils/userLanguage.js', () => mockUserLanguage);
jest.unstable_mockModule('../app/controllers/favorites/helpers.js', () => mockFavoriteHelpers);

const { sendInvitation } = await import('../app/controllers/auth/invitation/send.js');

const HOUR_MS = 60 * 60 * 1000;
const ORG_NAME = 'AcmeOrg';
const INVITEE = 'invitee@example.com';

const buildRequest = (body, overrides = {}) => ({
  body,
  userId: 5,
  userOrgRole: 'owner',
  headers: {},
  __: key => key,
  ...overrides,
});

const buildResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const sentPayload = res => {
  const [[payload]] = res.send.mock.calls;
  return payload;
};

describe('Invitation send - one live invitation per organization and address', () => {
  let organization;

  beforeEach(() => {
    jest.clearAllMocks();

    organization = {
      id: 3,
      name: ORG_NAME,
      locale: 'es-MX',
      external_issuer: null,
      external_org_id: null,
    };

    mockConfigLoader.loadConfig.mockReturnValue({ auth: { jwt: {} } });
    mockDb.organization.findOne.mockResolvedValue(organization);
    mockDb.user.findOne.mockResolvedValue(null);
    mockDb.invitation.findAll.mockResolvedValue([]);
    mockDb.invitation.create.mockResolvedValue({});
    mockUserLanguage.resolveEmailLanguage.mockResolvedValue('es');
    mockMail.sendInvitationMail.mockResolvedValue('https://boxvault.example.com/invite/token');
  });

  it('should scope the live-invitation lookup to the organization and unaccepted state', async () => {
    const res = buildResponse();

    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);

    // The address is matched in JS rather than in the WHERE clause, because
    // collation decides case-sensitivity otherwise and a differently-cased
    // re-invite would slip past on SQLite and Postgres.
    expect(mockDb.invitation.findAll).toHaveBeenCalledWith({
      where: { organizationId: 3, accepted: false },
    });
  });

  it('should reuse a pending row whose address differs only by case', async () => {
    const pending = { id: 9, email: INVITEE.toUpperCase(), token: 'stale', update: jest.fn() };
    pending.update.mockResolvedValue({});
    mockDb.invitation.findAll.mockResolvedValue([pending]);
    const res = buildResponse();

    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);

    expect(pending.update).toHaveBeenCalledTimes(1);
    expect(mockDb.invitation.create).not.toHaveBeenCalled();
  });

  it('should create the first invitation for an address', async () => {
    const res = buildResponse();

    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);

    expect(mockDb.invitation.create).toHaveBeenCalledTimes(1);
    expect(mockDb.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: INVITEE,
        organizationId: 3,
        invited_role: 'member',
        invited_by: 5,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(sentPayload(res).invitationToken).toMatch(/^[0-9a-f]{40}$/);
  });

  it('should reuse the pending row instead of creating a second one', async () => {
    const pending = {
      id: 9,
      email: INVITEE,
      token: 'stale-token',
      update: jest.fn().mockResolvedValue({}),
    };
    mockDb.invitation.findAll.mockResolvedValue([pending]);
    const res = buildResponse();

    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);

    expect(mockDb.invitation.create).not.toHaveBeenCalled();
    expect(pending.update).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should rotate the token on the reused row', async () => {
    const pending = {
      id: 9,
      email: INVITEE,
      token: 'stale-token',
      update: jest.fn().mockResolvedValue({}),
    };
    mockDb.invitation.findAll.mockResolvedValue([pending]);
    const res = buildResponse();

    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);

    const [[patch]] = pending.update.mock.calls;
    expect(patch.token).toMatch(/^[0-9a-f]{40}$/);
    expect(patch.token).not.toBe('stale-token');
    expect(sentPayload(res).invitationToken).toBe(patch.token);
    expect(mockMail.sendInvitationMail).toHaveBeenCalledWith(
      INVITEE,
      patch.token,
      ORG_NAME,
      patch.expires,
      'es'
    );
  });

  it('should reset the expiry and clear the expired flag on the reused row', async () => {
    const pending = {
      id: 9,
      email: INVITEE,
      token: 'stale-token',
      expired: true,
      update: jest.fn(),
    };
    pending.update.mockResolvedValue({});
    mockDb.invitation.findAll.mockResolvedValue([pending]);
    const res = buildResponse();

    const before = Date.now();
    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);
    const after = Date.now();

    const [[patch]] = pending.update.mock.calls;
    expect(patch.expired).toBe(false);
    expect(patch.expires).toBeGreaterThanOrEqual(before + 24 * HOUR_MS);
    expect(patch.expires).toBeLessThanOrEqual(after + 24 * HOUR_MS);
  });

  it('should honour the configured invitation expiry when reusing a row', async () => {
    mockConfigLoader.loadConfig.mockReturnValue({
      auth: { jwt: { invitation_token_expiry_hours: { value: 72 } } },
    });
    const pending = {
      id: 9,
      email: INVITEE,
      token: 'stale-token',
      update: jest.fn().mockResolvedValue({}),
    };
    mockDb.invitation.findAll.mockResolvedValue([pending]);
    const res = buildResponse();

    const before = Date.now();
    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);
    const after = Date.now();

    const [[patch]] = pending.update.mock.calls;
    expect(patch.expires).toBeGreaterThanOrEqual(before + 72 * HOUR_MS);
    expect(patch.expires).toBeLessThanOrEqual(after + 72 * HOUR_MS);
  });

  it('should update the invited role on the reused row', async () => {
    const pending = {
      id: 9,
      email: INVITEE,
      token: 'stale-token',
      update: jest.fn().mockResolvedValue({}),
    };
    mockDb.invitation.findAll.mockResolvedValue([pending]);
    const res = buildResponse();

    await sendInvitation(
      buildRequest({ email: INVITEE, organizationName: ORG_NAME, inviteRole: 'admin' }),
      res
    );

    expect(pending.update).toHaveBeenCalledWith(
      expect.objectContaining({ invited_role: 'admin', invited_by: 5 })
    );
    expect(mockDb.invitation.create).not.toHaveBeenCalled();
  });

  it('should record the current inviter on the reused row', async () => {
    const pending = {
      id: 9,
      email: INVITEE,
      token: 'stale-token',
      update: jest.fn().mockResolvedValue({}),
    };
    mockDb.invitation.findAll.mockResolvedValue([pending]);
    const res = buildResponse();

    await sendInvitation(
      buildRequest({ email: INVITEE, organizationName: ORG_NAME }, { userId: 77 }),
      res
    );

    expect(pending.update).toHaveBeenCalledWith(expect.objectContaining({ invited_by: 77 }));
  });

  it('should mail the invitee in the language resolved for their address', async () => {
    mockUserLanguage.resolveEmailLanguage.mockResolvedValue('es');
    const res = buildResponse();

    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);

    expect(mockUserLanguage.resolveEmailLanguage).toHaveBeenCalledWith(INVITEE, organization);
    expect(mockMail.sendInvitationMail).toHaveBeenCalledWith(
      INVITEE,
      expect.stringMatching(/^[0-9a-f]{40}$/),
      ORG_NAME,
      expect.any(Number),
      'es'
    );
  });

  it('should return the rotated token, expiry and organization id to the caller', async () => {
    const pending = {
      id: 9,
      email: INVITEE,
      token: 'stale-token',
      update: jest.fn().mockResolvedValue({}),
    };
    mockDb.invitation.findAll.mockResolvedValue([pending]);
    const res = buildResponse();

    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);

    const [[patch]] = pending.update.mock.calls;
    expect(sentPayload(res)).toEqual({
      message: 'invitations.sent',
      invitationToken: patch.token,
      invitationTokenExpires: patch.expires,
      organizationId: 3,
      invitationLink: 'https://boxvault.example.com/invite/token',
    });
  });

  it('should refuse a second invitation for someone who already belongs to the organization', async () => {
    mockDb.user.findOne.mockResolvedValue({ id: 21 });
    mockDb.UserOrg.findUserOrgRole.mockResolvedValue({ role: 'member' });
    const res = buildResponse();

    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockDb.invitation.findAll).not.toHaveBeenCalled();
    expect(mockDb.invitation.create).not.toHaveBeenCalled();
  });

  it('should write no local invitation for an organization the identity provider owns', async () => {
    organization.external_issuer = 'https://idp.example.com';
    organization.external_org_id = 'org-uuid';
    mockFavoriteHelpers.extractOidcAccessToken.mockReturnValue('oidc-token');
    mockExternalInvites.createExternalInvite.mockResolvedValue({ expires_at: 1234 });
    const res = buildResponse();

    await sendInvitation(buildRequest({ email: INVITEE, organizationName: ORG_NAME }), res);

    expect(mockDb.invitation.findAll).not.toHaveBeenCalled();
    expect(mockDb.invitation.create).not.toHaveBeenCalled();
    expect(sentPayload(res)).toEqual({
      message: 'invitations.sent',
      invitationToken: null,
      invitationTokenExpires: 1234,
      organizationId: 3,
      invitationLink: null,
    });
  });
});
