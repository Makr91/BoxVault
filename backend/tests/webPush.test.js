import { jest } from '@jest/globals';

const mockWebpush = {
  generateVAPIDKeys: jest.fn(),
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
};

const mockLog = {
  app: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
};

const mockConfigLoader = {
  loadConfig: jest.fn(),
  getConfigPath: jest.fn().mockReturnValue('/etc/boxvault/app.config.yaml'),
};

const mockConfigHelpers = {
  writeConfig: jest.fn(),
  maskSecrets: jest.fn(),
  restoreSecretSentinels: jest.fn(),
  SECRET_SENTINEL: '__SECRET__',
};

const mockDb = {
  pushSubscription: { findAll: jest.fn() },
  Sequelize: { Op: { in: 'in' } },
};

jest.unstable_mockModule('web-push', () => ({ default: mockWebpush }));
jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));
jest.unstable_mockModule('../app/utils/config-loader.js', () => mockConfigLoader);
jest.unstable_mockModule('../app/controllers/config/helpers.js', () => mockConfigHelpers);
jest.unstable_mockModule('../app/models/index.js', () => ({ default: mockDb }));

const { getVapidPublicKey, sendPushToUsers } = await import('../app/utils/webPush.js');

const NOTIFICATION = {
  title: 'New version',
  body: 'ubuntu/jammy 1.2.0 is available',
  navigate: '/boxes/ubuntu/jammy',
  tag: 'box-version',
  icon: '/logo.png',
};

const configuredAppConfig = () => ({
  notifications: {
    enabled: { value: true },
    vapid_subject: { value: 'mailto:ops@example.com' },
    vapid_public_key: { value: 'public-key' },
    vapid_private_key: { value: 'private-key' },
  },
});

const buildSubscription = (id, statusCode = null) => ({
  id,
  endpoint: `https://push.example.com/${id}`,
  p256dh: `p256dh-${id}`,
  auth: `auth-${id}`,
  destroy: jest.fn(),
  failWith: statusCode,
});

const rejectByEndpoint = subscriptions =>
  jest.fn(subscription => {
    const match = subscriptions.find(s => s.endpoint === subscription.endpoint);
    if (match && match.failWith !== null) {
      return Promise.reject(
        Object.assign(new Error('Push rejected'), { statusCode: match.failWith })
      );
    }
    return Promise.resolve({ statusCode: 201 });
  });

describe('Web Push', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigLoader.loadConfig.mockReturnValue(configuredAppConfig());
    mockWebpush.sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  describe('getVapidPublicKey', () => {
    it('should expose the configured public key', () => {
      expect(getVapidPublicKey()).toBe('public-key');
    });

    it('should be null when the keypair has not been generated yet', () => {
      mockConfigLoader.loadConfig.mockReturnValue({
        notifications: {
          enabled: { value: true },
          vapid_public_key: { value: '' },
          vapid_private_key: { value: '' },
        },
      });
      expect(getVapidPublicKey()).toBeNull();
    });

    it('should be null when the feature is switched off', () => {
      const config = configuredAppConfig();
      config.notifications.enabled.value = false;
      mockConfigLoader.loadConfig.mockReturnValue(config);
      expect(getVapidPublicKey()).toBeNull();
    });
  });

  describe('sendPushToUsers with no usable VAPID configuration', () => {
    it('should send nothing when no VAPID keypair is configured', async () => {
      mockConfigLoader.loadConfig.mockReturnValue({
        notifications: {
          enabled: { value: true },
          vapid_public_key: { value: '' },
          vapid_private_key: { value: '' },
        },
      });

      await expect(sendPushToUsers([1, 2], NOTIFICATION)).resolves.toBe(0);
      expect(mockDb.pushSubscription.findAll).not.toHaveBeenCalled();
      expect(mockWebpush.setVapidDetails).not.toHaveBeenCalled();
      expect(mockWebpush.sendNotification).not.toHaveBeenCalled();
    });

    it('should send nothing when only the private key is missing', async () => {
      const config = configuredAppConfig();
      config.notifications.vapid_private_key.value = '';
      mockConfigLoader.loadConfig.mockReturnValue(config);

      await expect(sendPushToUsers([1], NOTIFICATION)).resolves.toBe(0);
      expect(mockWebpush.sendNotification).not.toHaveBeenCalled();
    });

    it('should send nothing when the notifications section is absent entirely', async () => {
      mockConfigLoader.loadConfig.mockReturnValue({});

      await expect(sendPushToUsers([1], NOTIFICATION)).resolves.toBe(0);
      expect(mockDb.pushSubscription.findAll).not.toHaveBeenCalled();
    });

    it('should send nothing when the feature is switched off', async () => {
      const config = configuredAppConfig();
      config.notifications.enabled.value = false;
      mockConfigLoader.loadConfig.mockReturnValue(config);

      await expect(sendPushToUsers([1], NOTIFICATION)).resolves.toBe(0);
      expect(mockWebpush.sendNotification).not.toHaveBeenCalled();
    });

    it('should send nothing when the config cannot be read', async () => {
      mockConfigLoader.loadConfig.mockImplementation(() => {
        throw new Error('Config Error');
      });

      await expect(sendPushToUsers([1], NOTIFICATION)).resolves.toBe(0);
      expect(mockWebpush.sendNotification).not.toHaveBeenCalled();
    });

    it('should send nothing when the caller passes no recipients', async () => {
      await expect(sendPushToUsers([], NOTIFICATION)).resolves.toBe(0);
      await expect(sendPushToUsers([null, undefined, 0], NOTIFICATION)).resolves.toBe(0);
      expect(mockDb.pushSubscription.findAll).not.toHaveBeenCalled();
    });
  });

  describe('sendPushToUsers delivery', () => {
    it('should look up subscriptions for the deduplicated recipient list', async () => {
      mockDb.pushSubscription.findAll.mockResolvedValue([]);

      await sendPushToUsers([3, 3, null, 4], NOTIFICATION);

      expect(mockDb.pushSubscription.findAll).toHaveBeenCalledWith({
        where: { user_id: { in: [3, 4] } },
      });
    });

    it('should return zero when no device is registered', async () => {
      mockDb.pushSubscription.findAll.mockResolvedValue([]);

      await expect(sendPushToUsers([3], NOTIFICATION)).resolves.toBe(0);
      expect(mockWebpush.sendNotification).not.toHaveBeenCalled();
    });

    it('should sign with the configured VAPID details and deliver one message per device', async () => {
      const subscriptions = [buildSubscription(1), buildSubscription(2)];
      mockDb.pushSubscription.findAll.mockResolvedValue(subscriptions);

      await expect(sendPushToUsers([3], NOTIFICATION)).resolves.toBe(2);

      expect(mockWebpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:ops@example.com',
        'public-key',
        'private-key'
      );
      expect(mockWebpush.sendNotification).toHaveBeenCalledTimes(2);
      expect(mockWebpush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: 'https://push.example.com/1',
          keys: { p256dh: 'p256dh-1', auth: 'auth-1' },
        },
        expect.any(String)
      );
    });

    it('should carry the notification through as the service worker payload', async () => {
      mockDb.pushSubscription.findAll.mockResolvedValue([buildSubscription(1)]);

      await sendPushToUsers([3], NOTIFICATION);

      const [[, payload]] = mockWebpush.sendNotification.mock.calls;
      expect(JSON.parse(payload)).toEqual({
        title: 'New version',
        body: 'ubuntu/jammy 1.2.0 is available',
        icon: '/logo.png',
        tag: 'box-version',
        data: { navigate: '/boxes/ubuntu/jammy' },
      });
    });

    it('should fall back to the default subject when none is configured', async () => {
      const config = configuredAppConfig();
      delete config.notifications.vapid_subject;
      mockConfigLoader.loadConfig.mockReturnValue(config);
      mockDb.pushSubscription.findAll.mockResolvedValue([buildSubscription(1)]);

      await sendPushToUsers([3], NOTIFICATION);

      expect(mockWebpush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@localhost',
        'public-key',
        'private-key'
      );
    });

    it('should never throw when the subscription lookup fails', async () => {
      mockDb.pushSubscription.findAll.mockRejectedValue(new Error('DB Error'));

      await expect(sendPushToUsers([3], NOTIFICATION)).resolves.toBe(0);
    });
  });

  describe('sendPushToUsers pruning', () => {
    for (const statusCode of [403, 404, 410]) {
      it(`should destroy a subscription rejected with ${statusCode}`, async () => {
        const dead = buildSubscription(1, statusCode);
        const alive = buildSubscription(2);
        const subscriptions = [dead, alive];
        mockDb.pushSubscription.findAll.mockResolvedValue(subscriptions);
        mockWebpush.sendNotification.mockImplementation(rejectByEndpoint(subscriptions));

        await expect(sendPushToUsers([3], NOTIFICATION)).resolves.toBe(1);

        expect(dead.destroy).toHaveBeenCalledTimes(1);
        expect(alive.destroy).not.toHaveBeenCalled();
      });
    }

    it('should keep a subscription whose delivery failed for another reason', async () => {
      const failing = buildSubscription(1, 500);
      const alive = buildSubscription(2);
      const subscriptions = [failing, alive];
      mockDb.pushSubscription.findAll.mockResolvedValue(subscriptions);
      mockWebpush.sendNotification.mockImplementation(rejectByEndpoint(subscriptions));

      await expect(sendPushToUsers([3], NOTIFICATION)).resolves.toBe(1);

      expect(failing.destroy).not.toHaveBeenCalled();
      expect(alive.destroy).not.toHaveBeenCalled();
    });

    it('should keep a subscription whose delivery failed without a status code', async () => {
      const failing = buildSubscription(1);
      mockDb.pushSubscription.findAll.mockResolvedValue([failing]);
      mockWebpush.sendNotification.mockImplementation(() =>
        Promise.reject(new Error('Socket hang up'))
      );

      await expect(sendPushToUsers([3], NOTIFICATION)).resolves.toBe(0);

      expect(failing.destroy).not.toHaveBeenCalled();
    });

    it('should prune every dead subscription in one fan-out', async () => {
      const forbidden = buildSubscription(1, 403);
      const notFound = buildSubscription(2, 404);
      const gone = buildSubscription(3, 410);
      const subscriptions = [forbidden, notFound, gone];
      mockDb.pushSubscription.findAll.mockResolvedValue(subscriptions);
      mockWebpush.sendNotification.mockImplementation(rejectByEndpoint(subscriptions));

      await expect(sendPushToUsers([3], NOTIFICATION)).resolves.toBe(0);

      expect(forbidden.destroy).toHaveBeenCalledTimes(1);
      expect(notFound.destroy).toHaveBeenCalledTimes(1);
      expect(gone.destroy).toHaveBeenCalledTimes(1);
    });
  });
});
