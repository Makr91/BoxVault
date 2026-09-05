import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authConfigPath = path.join(__dirname, '../app/config/auth.test.config.yaml');

const ISSUER = 'https://hub-idp.example';
const UNDISCOVERED_ISSUER = 'https://undiscovered-hub.example';
const TOKEN_ENDPOINT = `${ISSUER}/oauth/token`;
const NOTIFY_ENDPOINT = `${ISSUER}/api/notify`;

const axiosGet = jest.fn();
const axiosPost = jest.fn();
const axiosDelete = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { get: axiosGet, post: axiosPost, delete: axiosDelete },
}));

const passThrough = () => (req, res, next) => {
  void req;
  void res;
  next();
};

jest.unstable_mockModule('../app/auth/passport.js', () => ({
  passport: { initialize: passThrough, session: passThrough, use: jest.fn() },
  initializeStrategies: jest.fn().mockResolvedValue(),
  getOidcConfiguration: jest.fn(name =>
    name === 'hubidp' ? { serverMetadata: () => ({ token_endpoint: TOKEN_ENDPOINT }) } : undefined
  ),
  buildAuthorizationUrl: jest.fn(),
  buildEndSessionUrl: jest.fn(),
  handleOidcCallback: jest.fn(),
}));

const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const jwt = (await import('jsonwebtoken')).default;
const { getS2sToken } = await import('../app/utils/externalInvites.js');
const { sendHubNotification } = await import('../app/utils/notifyHub.js');

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const writeAuthConfig = mutate => {
  const original = fs.readFileSync(authConfigPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(authConfigPath, yaml.dump(config));
  return () => fs.writeFileSync(authConfigPath, original);
};

const mintingTokenEndpoint = () => {
  axiosPost.mockImplementation(url =>
    url === TOKEN_ENDPOINT
      ? Promise.resolve({ data: { access_token: 'hub-token', expires_in: 3600 } })
      : Promise.resolve({ status: 201, data: { recipients: 1 } })
  );
};

const notifyCalls = () => axiosPost.mock.calls.filter(([url]) => url === NOTIFY_ENDPOINT);

describe('Identity-provider delegation', () => {
  const uniqueId = Date.now().toString(36);
  const externalOrgName = `ExtOrg-${uniqueId}`;
  const noUuidOrgName = `NoUuid-${uniqueId}`;
  const localOrgName = `LocalReq-${uniqueId}`;
  let restoreConfig;
  let externalOrg;
  let noUuidOrg;
  let localOrg;
  let owner;
  let localAdmin;
  let requester;
  let ownerToken;
  let localToken;
  let requesterToken;

  const signFor = (account, claims = {}) =>
    jwt.sign({ id: account.id, ...claims }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  const createUser = async label => {
    const account = await db.user.create({
      username: `${label}-${uniqueId}`,
      email: `${label}-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    const role = await db.role.findOne({ where: { name: 'user' } });
    await account.setRoles([role]);
    return account;
  };

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    restoreConfig = writeAuthConfig(config => {
      config.auth.oidc.providers = {
        hubidp: { enabled: { value: true }, issuer: { value: ISSUER } },
        undiscovered: { enabled: { value: true }, issuer: { value: UNDISCOVERED_ISSUER } },
      };
    });

    externalOrg = await db.organization.create({
      name: externalOrgName,
      external_issuer: ISSUER,
      external_org_id: `org-uuid-${uniqueId}`,
      access_mode: 'request_to_join',
    });
    noUuidOrg = await db.organization.create({ name: noUuidOrgName, external_issuer: ISSUER });
    localOrg = await db.organization.create({ name: localOrgName, access_mode: 'request_to_join' });

    owner = await createUser('hub-owner');
    localAdmin = await createUser('hub-local');
    requester = await createUser('hub-requester');
    await db.credential.create({
      user_id: owner.id,
      provider: ISSUER,
      subject: `owner-uuid-${uniqueId}`,
      external_email: owner.email,
    });
    for (const org of [externalOrg, noUuidOrg, localOrg]) {
      await db.UserOrg.create({ user_id: owner.id, organization_id: org.id, role: 'owner' });
    }
    await db.UserOrg.create({
      user_id: localAdmin.id,
      organization_id: externalOrg.id,
      role: 'admin',
    });
    await db.UserOrg.create({
      user_id: localAdmin.id,
      organization_id: noUuidOrg.id,
      role: 'admin',
    });

    ownerToken = signFor(owner, {
      provider: 'oidc-hubidp',
      oidc_access_token: 'owner-access-token',
      oidc_expires_at: Date.now() + 60 * 60 * 1000,
    });
    localToken = signFor(localAdmin, { provider: 'local' });
    requesterToken = signFor(requester, { provider: 'local' });
  });

  afterAll(async () => {
    restoreConfig();
    await db.Request.destroy({ where: { user_id: [requester.id, localAdmin.id] } });
    await db.organization.destroy({ where: { id: [externalOrg.id, noUuidOrg.id, localOrg.id] } });
    await db.user.destroy({ where: { id: [owner.id, localAdmin.id, requester.id] } });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getS2sToken', () => {
    it('should refuse an issuer without an enabled provider', async () => {
      await expect(getS2sToken('https://stranger.example', 'org:invite')).rejects.toThrow(
        'No enabled OIDC provider configured for issuer https://stranger.example'
      );
    });

    it('should refuse a provider that is not discovered yet', async () => {
      await expect(getS2sToken(UNDISCOVERED_ISSUER, 'org:invite')).rejects.toThrow(
        'has not completed discovery yet'
      );
    });

    it('should refuse to mint without a configured client secret', async () => {
      await expect(getS2sToken(ISSUER, `scope-${uniqueId}-nosecret`)).rejects.toThrow(
        'auth.oidc.s2s_client_secret is not configured'
      );
      expect(axiosPost).not.toHaveBeenCalled();
    });

    it('should mint with the client credentials and cache the token per scope', async () => {
      const restore = writeAuthConfig(config => {
        config.auth.oidc.s2s_client_id = { value: 'boxvault-s2s' };
        config.auth.oidc.s2s_client_secret = { value: 'shared-secret' };
      });
      try {
        axiosPost.mockResolvedValueOnce({ data: { access_token: 'tok-1', expires_in: 3600 } });
        const scope = `scope-${uniqueId}-cached`;
        await expect(getS2sToken(ISSUER, scope)).resolves.toBe('tok-1');
        expect(axiosPost).toHaveBeenCalledWith(
          TOKEN_ENDPOINT,
          `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            auth: { username: 'boxvault-s2s', password: 'shared-secret' },
          }
        );
        await expect(getS2sToken(ISSUER, scope)).resolves.toBe('tok-1');
        expect(axiosPost).toHaveBeenCalledTimes(1);
      } finally {
        restore();
      }
    });

    it('should mint again when the cached token is about to expire', async () => {
      const restore = writeAuthConfig(config => {
        config.auth.oidc.s2s_client_secret = { value: 'shared-secret' };
      });
      try {
        const scope = `scope-${uniqueId}-short`;
        axiosPost.mockResolvedValueOnce({ data: { access_token: 'short-1', expires_in: 1 } });
        axiosPost.mockResolvedValueOnce({ data: { access_token: 'short-2' } });
        await expect(getS2sToken(ISSUER, scope)).resolves.toBe('short-1');
        await expect(getS2sToken(ISSUER, scope)).resolves.toBe('short-2');
        await expect(getS2sToken(ISSUER, scope)).resolves.toBe('short-2');
        expect(axiosPost).toHaveBeenCalledTimes(2);
        expect(axiosPost.mock.calls[0][2].auth.username).toBe('boxvault_s2s');
      } finally {
        restore();
      }
    });
  });

  describe('sendHubNotification', () => {
    const notification = { title: 'Hello', body: 'World', navigate: '/', tag: 'boxvault-test' };
    const send = (overrides = {}) =>
      sendHubNotification({
        issuer: ISSUER,
        recipient: { user_uuid: 'someone' },
        notification,
        type: 'SYSTEM',
        severity: 'INFO',
        idempotencyKey: `boxvault:test:${uniqueId}`,
        ...overrides,
      });

    it('should stay silent while the hub knob is off', async () => {
      await expect(send()).resolves.toBe(false);
      expect(axiosPost).not.toHaveBeenCalled();
    });

    it('should report failure when no service token can be minted', async () => {
      const restore = writeAuthConfig(config => {
        config.auth.oidc.notifications_enabled = { value: true };
      });
      try {
        await expect(send()).resolves.toBe(false);
        expect(axiosPost).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    describe('with the hub enabled', () => {
      let restoreHub;

      beforeAll(() => {
        restoreHub = writeAuthConfig(config => {
          config.auth.oidc.notifications_enabled = { value: true };
          config.auth.oidc.s2s_client_secret = { value: 'shared-secret' };
        });
      });

      afterAll(() => {
        restoreHub();
      });

      it('should post the payload with the minted token', async () => {
        mintingTokenEndpoint();
        await expect(send()).resolves.toBe(true);
        const [[url, body, options]] = notifyCalls();
        expect(url).toBe(NOTIFY_ENDPOINT);
        expect(options.headers.Authorization).toBe('Bearer hub-token');
        expect(JSON.parse(body)).toEqual({
          recipient: { user_uuid: 'someone' },
          notification,
          type: 'SYSTEM',
          severity: 'INFO',
          delivery: { ttl: 86400, urgency: 'normal' },
          idempotencyKey: `boxvault:test:${uniqueId}`,
        });
      });

      it('should report a refused write', async () => {
        axiosPost.mockRejectedValue({
          message: 'Bad Request',
          response: { status: 400, data: { type: 'urn:problem:bad' } },
        });
        await expect(send()).resolves.toBe(false);
      });

      it('should trim a plain body until the payload fits the hub budget', async () => {
        mintingTokenEndpoint();
        await expect(
          send({ notification: { ...notification, body: 'x'.repeat(5000) } })
        ).resolves.toBe(true);
        const [[, body]] = notifyCalls();
        expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(3800);
        expect(JSON.parse(body).notification.body.endsWith('…')).toBe(true);
      });

      it('should trim only the longest language of a body map', async () => {
        mintingTokenEndpoint();
        await expect(
          send({ notification: { ...notification, body: { en: 'é'.repeat(3000), es: 'corto' } } })
        ).resolves.toBe(true);
        const [[, body]] = notifyCalls();
        const parsed = JSON.parse(body);
        expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(3800);
        expect(parsed.notification.body.es).toBe('corto');
        expect(parsed.notification.body.en.endsWith('…')).toBe(true);
      });

      it('should give up trimming a body map without text', async () => {
        mintingTokenEndpoint();
        await expect(
          send({ notification: { ...notification, title: 't'.repeat(4000), body: { en: 5 } } })
        ).resolves.toBe(true);
        const [[, body]] = notifyCalls();
        expect(JSON.parse(body).notification.body).toEqual({ en: 5 });
      });

      it('should deliver a test channel notification to the caller', async () => {
        mintingTokenEndpoint();
        const res = await request(app)
          .post('/api/notifications/test/channel')
          .set('x-access-token', ownerToken);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ delivered: 1 });
        const [[, body]] = notifyCalls();
        expect(JSON.parse(body).recipient).toEqual({ user_uuid: `owner-uuid-${uniqueId}` });
      });
    });
  });

  describe('join request notifications', () => {
    let restoreHub;
    let externalRequestId;

    beforeAll(() => {
      restoreHub = writeAuthConfig(config => {
        config.auth.oidc.notifications_enabled = { value: true };
        config.auth.oidc.s2s_client_secret = { value: 'shared-secret' };
      });
    });

    afterAll(() => {
      restoreHub();
    });

    it('should address the organization on the hub for an external organization', async () => {
      mintingTokenEndpoint();
      const res = await request(app)
        .post(`/api/organization/${externalOrgName}/requests`)
        .set('x-access-token', requesterToken)
        .send({ message: 'let me in' });
      expect(res.statusCode).toBe(201);
      externalRequestId = res.body.request.id;
      const [[, body]] = notifyCalls();
      expect(JSON.parse(body).recipient).toEqual({
        org_uuid: externalOrg.external_org_id,
        roles: ['owner', 'admin'],
      });
    });

    it('should address every manager with a hub identity for a local organization', async () => {
      mintingTokenEndpoint();
      const res = await request(app)
        .post(`/api/organization/${localOrgName}/requests`)
        .set('x-access-token', localToken)
        .send({});
      expect(res.statusCode).toBe(201);
      const [[, body]] = notifyCalls();
      expect(JSON.parse(body).recipient).toEqual({ user_uuid: `owner-uuid-${uniqueId}` });
    });

    describe('approving on an external organization', () => {
      const approve = token =>
        request(app)
          .post(`/api/organization/${externalOrgName}/requests/${externalRequestId}/approve`)
          .set('x-access-token', token)
          .send({ assignedRole: 'member' });

      it('should require an identity-provider session', async () => {
        const res = await approve(localToken);
        expect(res.statusCode).toBe(400);
      });

      it('should surface the hub refusal', async () => {
        axiosPost.mockRejectedValue({ response: { status: 403, data: { message: 'not yours' } } });
        const res = await approve(ownerToken);
        expect(res.statusCode).toBe(403);
        expect(res.body.message).toBe('not yours');
      });

      it('should answer 502 when the hub fails', async () => {
        axiosPost.mockRejectedValue({ response: { status: 500 } });
        const res = await approve(ownerToken);
        expect(res.statusCode).toBe(502);
        const row = await db.Request.findByPk(externalRequestId);
        expect(row.status).toBe('pending');
      });

      it('should delegate the invite and finalize the request', async () => {
        axiosPost.mockResolvedValue({ data: { invite_id: 'inv-1' } });
        const res = await approve(ownerToken);
        expect(res.statusCode).toBe(200);
        expect(res.body.assignedRole).toBe('member');
        expect(axiosPost).toHaveBeenCalledWith(
          `${ISSUER}/api/org/invites`,
          { email: requester.email, org_uuid: externalOrg.external_org_id, role: 'member' },
          { headers: { Authorization: 'Bearer owner-access-token' } }
        );
        const row = await db.Request.findByPk(externalRequestId);
        expect(row.status).toBe('approved');
        expect(row.reviewed_by).toBe(owner.id);
      });
    });
  });

  describe('listing invitations of an external organization', () => {
    const list = token =>
      request(app).get(`/api/invitations/active/${externalOrgName}`).set('x-access-token', token);

    it('should require an identity-provider session', async () => {
      const res = await list(localToken);
      expect(res.statusCode).toBe(400);
      expect(axiosGet).not.toHaveBeenCalled();
    });

    it('should map the hub records into the local shape', async () => {
      axiosGet.mockResolvedValue({
        data: [
          { invite_id: 'i1', email: 'a@example.com', status: 'PENDING', expires_at: '2030-01-01' },
          {
            invite_id: 'i2',
            email: 'b@example.com',
            status: 'ACCEPTED',
            accepted_at: '2029-01-01',
          },
          { invite_id: 'i3', email: 'c@example.com', status: 'EXPIRED' },
          { invite_id: 'i4', email: 'd@example.com' },
        ],
      });
      const res = await list(ownerToken);
      expect(res.statusCode).toBe(200);
      expect(axiosGet).toHaveBeenCalledWith(`${ISSUER}/api/org/invites`, {
        params: { org_uuid: externalOrg.external_org_id },
        headers: { Authorization: 'Bearer owner-access-token' },
      });
      expect(res.body).toEqual([
        {
          id: `ext:${externalOrgName}:i1`,
          email: 'a@example.com',
          token: '',
          expires: '2030-01-01',
          accepted: false,
          accepted_at: null,
          expired: false,
          createdAt: null,
        },
        {
          id: `ext:${externalOrgName}:i2`,
          email: 'b@example.com',
          token: '',
          expires: null,
          accepted: true,
          accepted_at: '2029-01-01',
          expired: false,
          createdAt: null,
        },
        {
          id: `ext:${externalOrgName}:i3`,
          email: 'c@example.com',
          token: '',
          expires: null,
          accepted: false,
          accepted_at: null,
          expired: true,
          createdAt: null,
        },
        {
          id: `ext:${externalOrgName}:i4`,
          email: 'd@example.com',
          token: '',
          expires: null,
          accepted: false,
          accepted_at: null,
          expired: false,
          createdAt: null,
        },
      ]);
    });

    it('should unwrap a wrapped list and tolerate an empty answer', async () => {
      axiosGet.mockResolvedValueOnce({ data: { invites: [{ invite_id: 'w1', email: 'w@x.y' }] } });
      const wrapped = await list(ownerToken);
      expect(wrapped.body.map(invite => invite.id)).toEqual([`ext:${externalOrgName}:w1`]);

      axiosGet.mockResolvedValueOnce({ data: {} });
      const empty = await list(ownerToken);
      expect(empty.body).toEqual([]);
    });

    it('should answer 502 when the hub is unreachable', async () => {
      axiosGet.mockRejectedValue(new Error('ECONNREFUSED'));
      const res = await list(ownerToken);
      expect(res.statusCode).toBe(502);
    });
  });

  describe('sending an invitation for an external organization', () => {
    const invite = (token, organizationName = externalOrgName) =>
      request(app)
        .post('/api/auth/invite')
        .set('x-access-token', token)
        .send({ email: `invitee-${uniqueId}@example.com`, organizationName });

    it('should require an identity-provider session', async () => {
      const res = await invite(localToken);
      expect(res.statusCode).toBe(400);
      expect(axiosPost).not.toHaveBeenCalled();
    });

    it('should refuse an organization without a hub identifier', async () => {
      const res = await invite(ownerToken, noUuidOrgName);
      expect(res.statusCode).toBe(500);
      expect(axiosPost).not.toHaveBeenCalled();
    });

    it('should delegate the invite to the hub', async () => {
      axiosPost.mockResolvedValue({ data: { invite_id: 'inv-2', expires_at: '2031-01-01' } });
      const res = await invite(ownerToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        invitationToken: null,
        invitationTokenExpires: '2031-01-01',
        organizationId: externalOrg.id,
        invitationLink: null,
      });
    });

    it('should surface a hub validation or authorization refusal', async () => {
      axiosPost.mockRejectedValueOnce({
        response: { status: 400, data: { detail: 'bad address' } },
      });
      const validation = await invite(ownerToken);
      expect(validation.statusCode).toBe(400);
      expect(validation.body.message).toBe('bad address');

      axiosPost.mockRejectedValueOnce({ response: { status: 403, data: { error: 'forbidden' } } });
      const authorization = await invite(ownerToken);
      expect(authorization.statusCode).toBe(403);
      expect(authorization.body.message).toBe('forbidden');
    });

    it('should answer 502 for any other hub failure', async () => {
      axiosPost.mockRejectedValue({ response: { status: 503 } });
      const res = await invite(ownerToken);
      expect(res.statusCode).toBe(502);
    });
  });

  describe('deleting an invitation of an external organization', () => {
    const remove = (token, id) =>
      request(app).delete(`/api/invitations/${id}`).set('x-access-token', token);

    it('should answer 404 when the id carries no organization', async () => {
      const res = await remove(ownerToken, 'ext:');
      expect(res.statusCode).toBe(404);
    });

    it('should answer 404 for an unknown organization', async () => {
      const res = await remove(ownerToken, `ext:NoSuchOrg-${uniqueId}:i1`);
      expect(res.statusCode).toBe(404);
    });

    it('should answer 404 when the invite id is empty', async () => {
      const res = await remove(ownerToken, `ext:${externalOrgName}:`);
      expect(res.statusCode).toBe(404);
    });

    it('should answer 404 for an organization without a hub identifier', async () => {
      const res = await remove(ownerToken, `ext:${noUuidOrgName}:i1`);
      expect(res.statusCode).toBe(404);
    });

    it('should require an identity-provider session', async () => {
      const res = await remove(localToken, `ext:${externalOrgName}:i1`);
      expect(res.statusCode).toBe(400);
    });

    it('should delegate the deletion keeping colons inside the invite id', async () => {
      axiosDelete.mockResolvedValue({ status: 204 });
      const res = await remove(ownerToken, `ext:${externalOrgName}:a:b`);
      expect(res.statusCode).toBe(200);
      expect(axiosDelete).toHaveBeenCalledWith(`${ISSUER}/api/org/invites/a%3Ab`, {
        params: { org_uuid: externalOrg.external_org_id },
        headers: { Authorization: 'Bearer owner-access-token' },
      });
    });

    it('should answer 404 when the hub no longer holds the invite', async () => {
      axiosDelete.mockRejectedValue({ response: { status: 404, data: { error: 'not_found' } } });
      const res = await remove(ownerToken, `ext:${externalOrgName}:gone`);
      expect(res.statusCode).toBe(404);
    });

    it('should answer 502 for any other hub failure', async () => {
      axiosDelete.mockRejectedValue(new Error('boom'));
      const res = await remove(ownerToken, `ext:${externalOrgName}:i1`);
      expect(res.statusCode).toBe(502);
    });
  });
});
