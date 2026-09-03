import { jest } from '@jest/globals';

const mockLog = {
  error: { error: jest.fn() },
};

const mockAxios = {
  patch: jest.fn(),
};

const mockDb = {
  user: { findByPk: jest.fn() },
};

const mockFavoriteHelpers = {
  getAuthServerUrl: jest.fn().mockReturnValue('https://idp.example.com'),
  extractOidcAccessToken: jest.fn().mockReturnValue(null),
};

jest.unstable_mockModule('../app/utils/Logger.js', () => ({ log: mockLog }));
jest.unstable_mockModule('../app/models/index.js', () => ({ default: mockDb }));
jest.unstable_mockModule('axios', () => ({ default: mockAxios }));
jest.unstable_mockModule('../app/controllers/favorites/helpers.js', () => mockFavoriteHelpers);

const { updatePreferences } = await import('../app/controllers/user/preferences.js');

const buildRequest = body => ({
  body,
  userId: 42,
  headers: {},
  __: (key, replacements) => (replacements ? `${key}:${replacements.invalidField}` : key),
});

const buildResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const buildStoredUser = (stored = {}) => {
  const user = {
    authProvider: 'local',
    preferredLanguage: 'en',
    preferredTheme: 'light',
    timezone: 'America/Chicago',
    ...stored,
  };
  user.update = jest.fn(patch => {
    Object.assign(user, patch);
    return Promise.resolve(user);
  });
  return user;
};

describe('User Preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFavoriteHelpers.extractOidcAccessToken.mockReturnValue(null);
  });

  describe('PATCH /api/user/preferences - accepted values', () => {
    beforeEach(() => {
      mockDb.user.findByPk.mockResolvedValue(buildStoredUser());
    });

    it('should accept a bare language tag', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: 'es' }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ preferredLanguage: 'es' });
    });

    it('should accept a language tag carrying region and script subtags', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: 'zh-Hant-TW' }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ preferredLanguage: 'zh-Hant-TW' });
    });

    for (const theme of ['light', 'dark', 'auto']) {
      it(`should accept the ${theme} theme`, async () => {
        const user = buildStoredUser({ preferredTheme: null });
        mockDb.user.findByPk.mockResolvedValue(user);
        const res = buildResponse();

        await updatePreferences(buildRequest({ theme }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(user.update).toHaveBeenCalledWith({ preferredTheme: theme });
      });
    }

    for (const timezone of ['UTC', 'GMT', 'America/Chicago', 'Europe/Madrid', 'Asia/Kolkata']) {
      it(`should accept the IANA zone ${timezone}`, async () => {
        const user = buildStoredUser({ timezone: null });
        mockDb.user.findByPk.mockResolvedValue(user);
        const res = buildResponse();

        await updatePreferences(buildRequest({ timezone }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(user.update).toHaveBeenCalledWith({ timezone });
      });
    }
  });

  describe('PATCH /api/user/preferences - rejected values', () => {
    let user;

    beforeEach(() => {
      user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
    });

    it('should reject a composed theme name', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'nomadservices-dark' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({ message: 'users.preferenceInvalid:theme' });
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should reject a theme that is not a string', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 7 }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({ message: 'users.preferenceInvalid:theme' });
    });

    it('should reject a timezone that names no real zone', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ timezone: 'Nowhere/Imaginary' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({ message: 'users.preferenceInvalid:timezone' });
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should reject a timezone that is not a string', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ timezone: 3600 }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({ message: 'users.preferenceInvalid:timezone' });
    });

    it('should reject a language that is not a string', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: 42 }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({ message: 'users.preferenceInvalid:language' });
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should reject a malformed language tag', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: 'en_US' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({ message: 'users.preferenceInvalid:language' });
    });

    it('should reject a language subtag longer than BCP 47 allows', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: 'englishlanguage' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({ message: 'users.preferenceInvalid:language' });
    });

    it('should reject before looking the user up', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'sepia' }), res);

      expect(mockDb.user.findByPk).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/user/preferences - omit versus clear', () => {
    it('should leave an omitted key untouched', async () => {
      const user = buildStoredUser({
        preferredLanguage: 'en',
        preferredTheme: 'light',
        timezone: 'America/Chicago',
      });
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'dark' }), res);

      expect(user.update).toHaveBeenCalledWith({ preferredTheme: 'dark' });
      expect(res.send).toHaveBeenCalledWith({
        language: 'en',
        theme: 'dark',
        timezone: 'America/Chicago',
      });
    });

    it('should clear a value passed as null', async () => {
      const user = buildStoredUser({ preferredLanguage: 'es' });
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: null }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ preferredLanguage: null });
      expect(res.send).toHaveBeenCalledWith({
        language: null,
        theme: 'light',
        timezone: 'America/Chicago',
      });
    });

    it('should clear a value passed as an empty string', async () => {
      const user = buildStoredUser({ timezone: 'Europe/Madrid' });
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ timezone: '' }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ timezone: null });
      expect(res.send).toHaveBeenCalledWith({
        language: 'en',
        theme: 'light',
        timezone: null,
      });
    });

    it('should clear only the keys the caller named', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: null, theme: '' }), res);

      expect(user.update).toHaveBeenCalledWith({ preferredLanguage: null, preferredTheme: null });
      expect(Object.keys(user.update.mock.calls[0][0])).not.toContain('timezone');
    });

    it('should not treat a cleared theme as an invalid theme', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: null }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ preferredTheme: null });
    });

    it('should not treat a cleared timezone as an unknown zone', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ timezone: '' }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ timezone: null });
    });

    it('should write nothing for an empty body', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({}), res);

      expect(user.update).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({
        language: 'en',
        theme: 'light',
        timezone: 'America/Chicago',
      });
    });

    it('should write nothing for a missing body', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();
      const req = buildRequest({});
      req.body = undefined;

      await updatePreferences(req, res);

      expect(user.update).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('PATCH /api/user/preferences - federated accounts', () => {
    it('should refuse to write locally when the account has no identity provider session', async () => {
      const user = buildStoredUser({ authProvider: 'oidc' });
      mockDb.user.findByPk.mockResolvedValue(user);
      mockFavoriteHelpers.extractOidcAccessToken.mockReturnValue(null);
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'dark' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({ message: 'users.preferencesRequireIdpSession' });
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should mirror locally only after the identity provider accepts the write', async () => {
      const user = buildStoredUser({ authProvider: 'oidc' });
      mockDb.user.findByPk.mockResolvedValue(user);
      mockFavoriteHelpers.extractOidcAccessToken.mockReturnValue('oidc-token');
      mockAxios.patch.mockResolvedValue({ status: 204 });
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'dark' }), res);

      expect(mockAxios.patch).toHaveBeenCalledWith(
        'https://idp.example.com/api/user/preferences',
        { theme: 'dark' },
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer oidc-token' }),
        })
      );
      expect(user.update).toHaveBeenCalledWith({ preferredTheme: 'dark' });
    });

    it('should not mirror locally when the identity provider rejects the write', async () => {
      const user = buildStoredUser({ authProvider: 'oidc' });
      mockDb.user.findByPk.mockResolvedValue(user);
      mockFavoriteHelpers.extractOidcAccessToken.mockReturnValue('oidc-token');
      mockAxios.patch.mockRejectedValue({ response: { status: 500 } });
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'dark' }), res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(user.update).not.toHaveBeenCalled();
    });
  });
});
