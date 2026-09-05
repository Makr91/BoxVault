import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configDir = path.join(__dirname, '../app/config');

const ISSUER = 'https://notify-idp.example';

const axiosGet = jest.fn();
const axiosPost = jest.fn();
const axiosDelete = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { get: axiosGet, post: axiosPost, delete: axiosDelete },
}));

const mockWebpush = {
  generateVAPIDKeys: jest.fn(),
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
};
jest.unstable_mockModule('web-push', () => ({ default: mockWebpush }));

const request = (await import('supertest')).default;
const app = (await import('../server.js')).default;
const db = (await import('../app/models/index.js')).default;
const jwt = (await import('jsonwebtoken')).default;

const TEST_JWT_CLAIMS = { issuer: 'boxvault', audience: 'boxvault-api' };

const updateConfig = (configName, mutate) => {
  const configPath = path.join(configDir, `${configName}.test.config.yaml`);
  const original = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(original);
  mutate(config);
  fs.writeFileSync(configPath, yaml.dump(config));
  return () => fs.writeFileSync(configPath, original);
};

describe('Notifications API', () => {
  const uniqueId = Date.now().toString(36);
  const endpoint = `https://push.example/${uniqueId}`;
  let localUser;
  let oidcUser;
  let localToken;
  let oidcToken;
  let restoreAuth;

  const signFor = (account, claims = {}) =>
    jwt.sign({ id: account.id, ...claims }, 'test-secret', { expiresIn: '1h', ...TEST_JWT_CLAIMS });

  beforeAll(async () => {
    await global.testHelpers.waitForAppReady(app);
    restoreAuth = updateConfig('auth', config => {
      config.auth.oidc.providers = {
        notifyidp: { enabled: { value: true }, issuer: { value: ISSUER } },
      };
    });

    const role = await db.role.findOne({ where: { name: 'user' } });
    localUser = await db.user.create({
      username: `notify-local-${uniqueId}`,
      email: `notify-local-${uniqueId}@example.com`,
      password: 'password',
      verified: true,
    });
    await localUser.setRoles([role]);
    oidcUser = await db.user.create({
      username: `notify-oidc-${uniqueId}`,
      email: `notify-oidc-${uniqueId}@example.com`,
      password: 'external',
      verified: true,
      authProvider: 'oidc',
    });
    await oidcUser.setRoles([role]);
    await db.credential.create({
      user_id: oidcUser.id,
      provider: ISSUER,
      subject: `notify-subject-${uniqueId}`,
      external_email: oidcUser.email,
    });

    localToken = signFor(localUser, { provider: 'local' });
    oidcToken = signFor(oidcUser, {
      provider: 'oidc-notifyidp',
      oidc_access_token: 'idp-access-token',
      oidc_expires_at: Date.now() + 60 * 60 * 1000,
    });
  });

  afterAll(async () => {
    restoreAuth();
    await db.pushSubscription.destroy({ where: { user_id: [localUser.id, oidcUser.id] } });
    await localUser.destroy();
    await oidcUser.destroy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockWebpush.sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  describe('before push notifications are configured', () => {
    it('should answer 503 for the public key', async () => {
      const res = await request(app).get('/api/notifications/vapid-key');
      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ error: 'PUSH_NOT_CONFIGURED' });
    });

    it('should answer 503 for a test toast', async () => {
      const res = await request(app)
        .post('/api/notifications/test/toast')
        .set('x-access-token', localToken);
      expect(res.statusCode).toBe(503);
    });
  });

  describe('push subscriptions', () => {
    let restoreApp;

    beforeAll(() => {
      restoreApp = updateConfig('app', config => {
        config.notifications = {
          enabled: { value: true },
          vapid_subject: { value: 'mailto:ops@example.com' },
          vapid_public_key: { value: 'public-key' },
          vapid_private_key: { value: 'private-key' },
        };
      });
    });

    afterAll(() => {
      restoreApp();
    });

    it('should expose the configured public key', async () => {
      const res = await request(app).get('/api/notifications/vapid-key');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ publicKey: 'public-key' });
    });

    it('should reject a malformed subscription', async () => {
      const cases = [
        {},
        { endpoint: 'http://insecure.example/x', keys: { p256dh: 'a', auth: 'b' } },
        { endpoint: `https://x.example/${'a'.repeat(600)}`, keys: { p256dh: 'a', auth: 'b' } },
        { endpoint, keys: { p256dh: 'a' } },
      ];
      const responses = await Promise.all(
        cases.map(body =>
          request(app)
            .post('/api/notifications/subscriptions')
            .set('x-access-token', localToken)
            .send(body)
        )
      );
      responses.forEach(res => {
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'INVALID_SUBSCRIPTION' });
      });
    });

    it('should store a subscription and move it to the newest owner', async () => {
      const created = await request(app)
        .post('/api/notifications/subscriptions')
        .set('x-access-token', localToken)
        .send({ endpoint, keys: { p256dh: 'p256dh-1', auth: 'auth-1' } });
      expect(created.statusCode).toBe(204);
      const stored = await db.pushSubscription.findOne({ where: { endpoint } });
      expect(stored.user_id).toBe(localUser.id);

      const moved = await request(app)
        .post('/api/notifications/subscriptions')
        .set('x-access-token', oidcToken)
        .send({ endpoint, keys: { p256dh: 'p256dh-2', auth: 'auth-2' } });
      expect(moved.statusCode).toBe(204);
      await stored.reload();
      expect(stored.user_id).toBe(oidcUser.id);
      expect(stored.p256dh).toBe('p256dh-2');
    });

    it('should deliver a test toast to every device of the caller', async () => {
      const res = await request(app)
        .post('/api/notifications/test/toast')
        .set('x-access-token', oidcToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ delivered: 1 });
      expect(mockWebpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:ops@example.com',
        'public-key',
        'private-key'
      );
      const [[subscription, payload]] = mockWebpush.sendNotification.mock.calls;
      expect(subscription).toEqual({ endpoint, keys: { p256dh: 'p256dh-2', auth: 'auth-2' } });
      expect(JSON.parse(payload).tag).toBe('boxvault-test');
    });

    it('should count nothing for a caller without devices', async () => {
      const res = await request(app)
        .post('/api/notifications/test/toast')
        .set('x-access-token', localToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ delivered: 0 });
      expect(mockWebpush.sendNotification).not.toHaveBeenCalled();
    });

    it('should prune a device the push service reports as gone', async () => {
      mockWebpush.sendNotification.mockRejectedValue(
        Object.assign(new Error('Gone'), { statusCode: 410 })
      );
      const res = await request(app)
        .post('/api/notifications/test/toast')
        .set('x-access-token', oidcToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ delivered: 0 });
      expect(await db.pushSubscription.findOne({ where: { endpoint } })).toBeNull();
    });

    it('should require an endpoint to remove a subscription', async () => {
      const res = await request(app)
        .delete('/api/notifications/subscriptions')
        .set('x-access-token', localToken)
        .send({});
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'ENDPOINT_REQUIRED' });
    });

    it('should remove a subscription of the caller', async () => {
      await db.pushSubscription.create({
        user_id: localUser.id,
        endpoint: `${endpoint}/second`,
        p256dh: 'p',
        auth: 'a',
      });
      const res = await request(app)
        .delete('/api/notifications/subscriptions')
        .set('x-access-token', localToken)
        .send({ endpoint: `${endpoint}/second` });
      expect(res.statusCode).toBe(204);
      expect(
        await db.pushSubscription.findOne({ where: { endpoint: `${endpoint}/second` } })
      ).toBeNull();
    });

    it('should answer 500 when the subscription table fails', async () => {
      jest.spyOn(db.pushSubscription, 'findOne').mockRejectedValueOnce(new Error('down'));
      const store = await request(app)
        .post('/api/notifications/subscriptions')
        .set('x-access-token', localToken)
        .send({ endpoint: `${endpoint}/third`, keys: { p256dh: 'p', auth: 'a' } });
      expect(store.statusCode).toBe(500);
      expect(store.body).toEqual({ error: 'SUBSCRIPTION_STORE_FAILED' });
      jest.spyOn(db.pushSubscription, 'destroy').mockRejectedValueOnce(new Error('down'));
      const remove = await request(app)
        .delete('/api/notifications/subscriptions')
        .set('x-access-token', localToken)
        .send({ endpoint: `${endpoint}/third` });
      expect(remove.statusCode).toBe(500);
      expect(remove.body).toEqual({ error: 'SUBSCRIPTION_DELETE_FAILED' });
      jest.restoreAllMocks();
    });
  });

  describe('POST /api/notifications/test/channel', () => {
    it('should answer 404 for a caller without an identity-provider credential', async () => {
      const res = await request(app)
        .post('/api/notifications/test/channel')
        .set('x-access-token', localToken);
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'NO_HUB_IDENTITY' });
    });

    it('should answer 502 while the hub refuses the write', async () => {
      const res = await request(app)
        .post('/api/notifications/test/channel')
        .set('x-access-token', oidcToken);
      expect(res.statusCode).toBe(502);
      expect(res.body).toEqual({ error: 'HUB_UNAVAILABLE' });
    });
  });

  describe('bell feed proxy', () => {
    it('should require an identity-provider session', async () => {
      const res = await request(app).get('/api/notifications').set('x-access-token', localToken);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'OIDC_ACCESS_TOKEN_REQUIRED' });
    });

    it('should relay the feed with the paging query', async () => {
      axiosGet.mockResolvedValue({ status: 200, data: { items: [{ id: 'n1' }] } });
      const res = await request(app)
        .get('/api/notifications')
        .query({ page: 2, size: 10, unreadOnly: 'true' })
        .set('x-access-token', oidcToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ items: [{ id: 'n1' }] });
      expect(axiosGet).toHaveBeenCalledWith(
        `${ISSUER}/api/notifications?page=2&size=10&unreadOnly=true`,
        {
          headers: { Authorization: 'Bearer idp-access-token', 'Content-Type': 'application/json' },
        }
      );
    });

    it('should relay an empty body as an empty object', async () => {
      axiosGet.mockResolvedValue({ status: 200 });
      const res = await request(app).get('/api/notifications').set('x-access-token', oidcToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({});
      expect(axiosGet).toHaveBeenCalledWith(`${ISSUER}/api/notifications`, expect.any(Object));
    });

    it('should relay the unread count', async () => {
      axiosGet.mockResolvedValue({ status: 200, data: { count: 4 } });
      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('x-access-token', oidcToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ count: 4 });
      expect(axiosGet).toHaveBeenCalledWith(
        `${ISSUER}/api/notifications/unread-count`,
        expect.any(Object)
      );
    });

    it('should pass the hub authorization answer through', async () => {
      axiosGet.mockRejectedValue({ message: 'Forbidden', response: { status: 403, data: {} } });
      const res = await request(app).get('/api/notifications').set('x-access-token', oidcToken);
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: 'NOTIFICATIONS_NOT_AUTHORIZED' });
    });

    it('should answer 502 when the hub fails or is unreachable', async () => {
      axiosGet.mockRejectedValue({ message: 'Boom', response: { status: 500 } });
      const failed = await request(app).get('/api/notifications').set('x-access-token', oidcToken);
      expect(failed.statusCode).toBe(502);
      expect(failed.body).toEqual({ error: 'AUTH_SERVER_UNAVAILABLE' });

      axiosGet.mockRejectedValue(new Error('ECONNREFUSED'));
      const unreachable = await request(app)
        .get('/api/notifications')
        .set('x-access-token', oidcToken);
      expect(unreachable.statusCode).toBe(502);
    });

    it('should mark one notification read and refresh the unread count', async () => {
      axiosPost.mockResolvedValue({ status: 200, data: { read: true } });
      axiosGet.mockResolvedValue({ status: 200, data: { count: 1 } });
      const res = await request(app)
        .post('/api/notifications/n%2F1/read')
        .set('x-access-token', oidcToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ read: true });
      expect(axiosPost).toHaveBeenCalledWith(
        `${ISSUER}/api/notifications/n%2F1/read`,
        null,
        expect.any(Object)
      );
      expect(axiosGet).toHaveBeenCalledWith(
        `${ISSUER}/api/notifications/unread-count`,
        expect.any(Object)
      );
    });

    it('should mark everything read even when the count refresh fails', async () => {
      axiosPost.mockResolvedValue({ status: 200, data: { updated: 3 } });
      axiosGet.mockRejectedValue(new Error('count down'));
      const res = await request(app)
        .post('/api/notifications/read-all')
        .set('x-access-token', oidcToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ updated: 3 });
      expect(axiosPost).toHaveBeenCalledWith(
        `${ISSUER}/api/notifications/read-all`,
        null,
        expect.any(Object)
      );
    });

    it('should delete one notification', async () => {
      axiosDelete.mockResolvedValue({ status: 204 });
      axiosGet.mockResolvedValue({ status: 200, data: {} });
      const res = await request(app)
        .delete('/api/notifications/n1')
        .set('x-access-token', oidcToken);
      expect(res.statusCode).toBe(204);
      expect(axiosDelete).toHaveBeenCalledWith(
        `${ISSUER}/api/notifications/n1`,
        expect.any(Object)
      );
    });
  });
});
