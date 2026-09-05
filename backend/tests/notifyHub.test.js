import { jest } from '@jest/globals';

const mockAxios = {
  post: jest.fn(),
};

const mockLog = {
  app: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
};

const mockConfigLoader = {
  loadConfig: jest.fn(),
};

const mockExternalInvites = {
  getS2sToken: jest.fn(),
  createExternalInvite: jest.fn(),
  listExternalInvites: jest.fn(),
  deleteExternalInvite: jest.fn(),
};

jest.unstable_mockModule('axios', () => ({ default: mockAxios }));
jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));
jest.unstable_mockModule('../app/utils/config-loader.js', () => mockConfigLoader);
jest.unstable_mockModule('../app/utils/externalInvites.js', () => mockExternalInvites);

const { sendHubNotification } = await import('../app/utils/notifyHub.js');

const MAX_PAYLOAD_BYTES = 3800;
const ISSUER = 'https://idp.example.com';

const send = notification =>
  sendHubNotification({
    issuer: ISSUER,
    recipient: { user_uuid: 'u-1' },
    notification,
    type: 'SYSTEM',
    severity: 'INFO',
    idempotencyKey: 'event-1',
  });

const postedBody = () => {
  const [[, body]] = mockAxios.post.mock.calls;
  return body;
};

const postedNotification = () => JSON.parse(postedBody()).notification;

describe('Hub notification producer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigLoader.loadConfig.mockReturnValue({
      auth: { oidc: { notifications_enabled: { value: true } } },
    });
    mockExternalInvites.getS2sToken.mockResolvedValue('s2s-token');
    mockAxios.post.mockResolvedValue({ status: 201, data: { recipients: 1 } });
  });

  describe('transport', () => {
    it('should post to the hub endpoint with the minted service token', async () => {
      await send({ title: 'Hello', body: 'World', navigate: '/x', tag: 't' });

      expect(mockExternalInvites.getS2sToken).toHaveBeenCalledWith(ISSUER, 'notifications:write');
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://idp.example.com/api/notify',
        expect.any(String),
        {
          headers: {
            Authorization: 'Bearer s2s-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('should strip trailing slashes from the issuer', async () => {
      await sendHubNotification({
        issuer: 'https://idp.example.com///',
        recipient: { user_uuid: 'u-1' },
        notification: { title: 'Hello', body: 'World' },
        type: 'SYSTEM',
        severity: 'INFO',
        idempotencyKey: 'event-1',
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://idp.example.com/api/notify',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should not post at all while the hub knob is off', async () => {
      mockConfigLoader.loadConfig.mockReturnValue({ auth: { oidc: {} } });

      await send({ title: 'Hello', body: 'World' });

      expect(mockExternalInvites.getS2sToken).not.toHaveBeenCalled();
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should never throw when the hub rejects the notification', async () => {
      mockAxios.post.mockRejectedValue({
        message: 'Request failed',
        response: { status: 429, data: { type: 'https://hub.example.com/problems/rate-limit' } },
      });

      await expect(send({ title: 'Hello', body: 'World' })).resolves.toBe(false);
      expect(mockLog.app.warn).toHaveBeenCalledWith(
        'Hub notification failed',
        expect.objectContaining({
          status: 429,
          problemType: 'https://hub.example.com/problems/rate-limit',
        })
      );
    });

    it('should never throw when the service token cannot be minted', async () => {
      mockExternalInvites.getS2sToken.mockRejectedValue(new Error('token endpoint down'));

      await expect(send({ title: 'Hello', body: 'World' })).resolves.toBe(false);
      expect(mockAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('serializeWithinBudget with a plain string body', () => {
    it('should post a payload that already fits verbatim', async () => {
      await send({ title: 'Hello', body: 'World', navigate: '/x', tag: 't' });

      expect(postedNotification()).toEqual({
        title: 'Hello',
        body: 'World',
        navigate: '/x',
        tag: 't',
      });
    });

    it('should truncate an oversized body until the payload fits the budget', async () => {
      const longBody = 'a'.repeat(8000);

      await send({ title: 'Hello', body: longBody, navigate: '/x', tag: 't' });

      expect(Buffer.byteLength(postedBody(), 'utf8')).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
      expect(postedNotification().body.endsWith('…')).toBe(true);
      expect(postedNotification().body.length).toBeLessThan(longBody.length);
    });

    it('should spend the budget on the body rather than discard it', async () => {
      await send({ title: 'Hello', body: 'a'.repeat(8000), navigate: '/x', tag: 't' });

      expect(Buffer.byteLength(postedBody(), 'utf8')).toBeGreaterThan(3500);
      expect(postedNotification().body.length).toBeGreaterThan(3000);
    });

    it('should keep every other field intact while truncating', async () => {
      await send({ title: 'Hello', body: 'a'.repeat(8000), navigate: '/x', tag: 't' });

      const posted = JSON.parse(postedBody());
      expect(posted.notification.title).toBe('Hello');
      expect(posted.notification.navigate).toBe('/x');
      expect(posted.notification.tag).toBe('t');
      expect(posted.recipient).toEqual({ user_uuid: 'u-1' });
      expect(posted.type).toBe('SYSTEM');
      expect(posted.severity).toBe('INFO');
      expect(posted.idempotencyKey).toBe('event-1');
      expect(posted.delivery).toEqual({ ttl: 86400, urgency: 'normal' });
    });

    it('should stay within budget for a multi-byte body', async () => {
      await send({ title: 'Hello', body: '€'.repeat(4000), navigate: '/x' });

      expect(Buffer.byteLength(postedBody(), 'utf8')).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    });

    it('should never mutate the notification the caller passed in', async () => {
      const longBody = 'a'.repeat(8000);
      const notification = { title: 'Hello', body: longBody, navigate: '/x', tag: 't' };

      await send(notification);

      expect(notification.body).toBe(longBody);
      expect(notification.body.length).toBe(8000);
      expect(notification.body.endsWith('…')).toBe(false);
    });
  });

  describe('serializeWithinBudget with a per-language body map', () => {
    it('should post a map that already fits verbatim', async () => {
      await send({ title: 'Hello', body: { en: 'World', es: 'Mundo' }, navigate: '/x' });

      expect(postedNotification().body).toEqual({ en: 'World', es: 'Mundo' });
    });

    it('should trim every language variant until the payload fits the budget', async () => {
      const body = { en: 'a'.repeat(2500), es: 'b'.repeat(2500) };

      await send({ title: 'Hello', body, navigate: '/x' });

      const posted = postedNotification().body;
      expect(Buffer.byteLength(postedBody(), 'utf8')).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
      expect(Object.keys(posted).sort()).toEqual(['en', 'es']);
      expect(posted.en.endsWith('…')).toBe(true);
      expect(posted.es.endsWith('…')).toBe(true);
      expect(posted.en.length).toBeLessThan(2500);
      expect(posted.es.length).toBeLessThan(2500);
    });

    it('should leave a short variant alone when only another one is over budget', async () => {
      const body = { en: 'a'.repeat(6000), es: 'short spanish body' };

      await send({ title: 'Hello', body, navigate: '/x' });

      const posted = postedNotification().body;
      expect(Buffer.byteLength(postedBody(), 'utf8')).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
      expect(Object.keys(posted).sort()).toEqual(['en', 'es']);
      // The overage belongs to the English variant; charging Spanish for it
      // would destroy a translation that was never the problem.
      expect(posted.es).toBe('short spanish body');
      expect(posted.en.endsWith('…')).toBe(true);
    });

    it('should never mutate the map the caller passed in', async () => {
      const body = { en: 'a'.repeat(4000), es: 'b'.repeat(4000) };
      const notification = { title: 'Hello', body, navigate: '/x' };

      await send(notification);

      expect(notification.body).toBe(body);
      expect(body.en.length).toBe(4000);
      expect(body.es.length).toBe(4000);
      expect(body.en.endsWith('…')).toBe(false);
    });
  });
});
