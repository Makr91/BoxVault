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

const mockEvents = { notifyProfileUpdated: jest.fn() };
jest.unstable_mockModule('../app/utils/events.js', () => mockEvents);

const { updatePreferences } = await import('../app/controllers/user/preferences.js');

const buildRequest = (body, hostname) => ({
  body,
  hostname,
  userId: 42,
  headers: {},
  __: (key, replacements) => (replacements ? `${key}:${replacements.invalidField}` : key),
});

const buildResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const buildStoredUser = (stored = {}) => {
  const user = {
    id: 42,
    authProvider: 'local',
    preferredLanguage: 'en',
    preferredMode: 'light',
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

    for (const mode of ['light', 'dark', 'auto']) {
      it(`should accept the ${mode} mode`, async () => {
        const user = buildStoredUser({ preferredMode: null });
        mockDb.user.findByPk.mockResolvedValue(user);
        const res = buildResponse();

        await updatePreferences(buildRequest({ mode }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(user.update).toHaveBeenCalledWith({ preferredMode: mode });
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

    it('should reject a composed mode name', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ mode: 'nomadservices-dark' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://auth.startcloud.com/probs/bad-request',
          title: 'users.preferenceInvalid:mode',
        })
      );
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should reject a mode that is not a string', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ mode: 7 }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://auth.startcloud.com/probs/bad-request',
          title: 'users.preferenceInvalid:mode',
        })
      );
    });

    it('should reject a timezone that names no real zone', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ timezone: 'Nowhere/Imaginary' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://auth.startcloud.com/probs/bad-request',
          title: 'users.preferenceInvalid:timezone',
        })
      );
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should reject a timezone that is not a string', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ timezone: 3600 }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://auth.startcloud.com/probs/bad-request',
          title: 'users.preferenceInvalid:timezone',
        })
      );
    });

    it('should reject a language that is not a string', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: 42 }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://auth.startcloud.com/probs/bad-request',
          title: 'users.preferenceInvalid:language',
        })
      );
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should reject a malformed language tag', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: 'en_US' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://auth.startcloud.com/probs/bad-request',
          title: 'users.preferenceInvalid:language',
        })
      );
    });

    it('should reject a language subtag longer than BCP 47 allows', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: 'englishlanguage' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://auth.startcloud.com/probs/bad-request',
          title: 'users.preferenceInvalid:language',
        })
      );
    });

    it('should reject before looking the user up', async () => {
      const res = buildResponse();

      await updatePreferences(buildRequest({ mode: 'sepia' }), res);

      expect(mockDb.user.findByPk).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/user/preferences - omit versus clear', () => {
    it('should leave an omitted key untouched', async () => {
      const user = buildStoredUser({
        preferredLanguage: 'en',
        preferredMode: 'light',
        timezone: 'America/Chicago',
      });
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ mode: 'dark' }), res);

      expect(user.update).toHaveBeenCalledWith({ preferredMode: 'dark' });
      expect(res.send).toHaveBeenCalledWith({
        language: 'en',
        mode: 'dark',
        theme: null,
        motion: null,
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
        mode: 'light',
        theme: null,
        motion: null,
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
        mode: 'light',
        theme: null,
        motion: null,
        timezone: null,
      });
    });

    it('should clear only the keys the caller named', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ language: null, mode: '' }), res);

      expect(user.update).toHaveBeenCalledWith({ preferredLanguage: null, preferredMode: null });
      expect(Object.keys(user.update.mock.calls[0][0])).not.toContain('timezone');
    });

    it('should not treat a cleared mode as an invalid mode', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ mode: null }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ preferredMode: null });
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
      expect(mockEvents.notifyProfileUpdated).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({
        language: 'en',
        mode: 'light',
        theme: null,
        motion: null,
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

  describe('PATCH /api/user/preferences - the motion switch', () => {
    for (const motion of ['auto', 'reduce']) {
      it(`should accept the ${motion} motion and answer it back`, async () => {
        const user = buildStoredUser({ preferredMotion: null });
        mockDb.user.findByPk.mockResolvedValue(user);
        const res = buildResponse();

        await updatePreferences(buildRequest({ motion }), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(user.update).toHaveBeenCalledWith({ preferredMotion: motion });
        expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ motion }));
        expect(mockEvents.notifyProfileUpdated).toHaveBeenCalledWith(42);
      });
    }

    it('should reject a motion outside auto and reduce like an invalid mode', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ motion: 'none' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'users.preferenceInvalid:motion' })
      );
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should clear the motion passed as null or blank', async () => {
      const user = buildStoredUser({ preferredMotion: 'reduce' });
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ motion: '' }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ preferredMotion: null });
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ motion: null }));
    });

    it('should delegate the motion to the identity provider for a federated account', async () => {
      const user = buildStoredUser({ authProvider: 'oidc', preferredMotion: null });
      mockDb.user.findByPk.mockResolvedValue(user);
      mockFavoriteHelpers.extractOidcAccessToken.mockReturnValue('oidc-token');
      mockAxios.patch.mockResolvedValue({ status: 204 });
      const res = buildResponse();

      await updatePreferences(buildRequest({ motion: 'reduce' }), res);

      expect(mockAxios.patch).toHaveBeenCalledWith(
        'https://idp.example.com/api/user/preferences',
        { motion: 'reduce' },
        expect.anything()
      );
      expect(user.update).toHaveBeenCalledWith({ preferredMotion: 'reduce' });
    });
  });

  describe('PATCH /api/user/preferences - the theme', () => {
    it('should accept a theme the hostname offers and answer it back', async () => {
      const user = buildStoredUser({ preferredTheme: null });
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'othertheme' }, 'downloads.test'), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ preferredTheme: 'othertheme' });
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ theme: 'othertheme' }));
    });

    it('should refuse a theme the hostname does not offer as 422 enum at /theme', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'sibling' }, 'downloads.test'), res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://auth.startcloud.com/probs/validation',
          errors: [
            expect.objectContaining({
              pointer: '/theme',
              rule: 'enum',
              params: { enum: 'testtheme, othertheme' },
            }),
          ],
        })
      );
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should accept any bare name on a hostname without a themes key', async () => {
      const user = buildStoredUser({ preferredTheme: null });
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'anytheme-9' }, 'face.test'), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ preferredTheme: 'anytheme-9' });
    });

    it('should refuse a name that is not bare on a hostname without a themes key', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'Not A Theme' }, 'face.test'), res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: [
            expect.objectContaining({
              pointer: '/theme',
              rule: 'pattern',
              params: { pattern: 'themeName' },
            }),
          ],
        })
      );
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should refuse every theme on a hostname whose themes key is empty', async () => {
      const user = buildStoredUser();
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: 'testtheme' }, 'bare.test'), res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: [
            expect.objectContaining({ pointer: '/theme', rule: 'enum', params: { enum: '' } }),
          ],
        })
      );
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should clear the theme passed as null', async () => {
      const user = buildStoredUser({ preferredTheme: 'testtheme' });
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ theme: null }, 'downloads.test'), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(user.update).toHaveBeenCalledWith({ preferredTheme: null });
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ theme: null }));
    });

    it('should leave the theme untouched when omitted', async () => {
      const user = buildStoredUser({ preferredTheme: 'testtheme' });
      mockDb.user.findByPk.mockResolvedValue(user);
      const res = buildResponse();

      await updatePreferences(buildRequest({ mode: 'dark' }, 'downloads.test'), res);

      expect(user.update).toHaveBeenCalledWith({ preferredMode: 'dark' });
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ theme: 'testtheme' }));
    });
  });

  describe('PATCH /api/user/preferences - federated accounts', () => {
    it('should refuse to write locally when the account has no identity provider session', async () => {
      const user = buildStoredUser({ authProvider: 'oidc' });
      mockDb.user.findByPk.mockResolvedValue(user);
      mockFavoriteHelpers.extractOidcAccessToken.mockReturnValue(null);
      const res = buildResponse();

      await updatePreferences(buildRequest({ mode: 'dark' }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://auth.startcloud.com/probs/bad-request',
          title: 'users.preferencesRequireIdpSession',
        })
      );
      expect(user.update).not.toHaveBeenCalled();
    });

    it('should mirror locally only after the identity provider accepts the write', async () => {
      const user = buildStoredUser({ authProvider: 'oidc' });
      mockDb.user.findByPk.mockResolvedValue(user);
      mockFavoriteHelpers.extractOidcAccessToken.mockReturnValue('oidc-token');
      mockAxios.patch.mockResolvedValue({ status: 204 });
      const res = buildResponse();

      await updatePreferences(buildRequest({ mode: 'dark' }), res);

      expect(mockAxios.patch).toHaveBeenCalledWith(
        'https://idp.example.com/api/user/preferences',
        { mode: 'dark' },
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer oidc-token' }),
        })
      );
      expect(user.update).toHaveBeenCalledWith({ preferredMode: 'dark' });
    });

    it('should not mirror locally when the identity provider rejects the write', async () => {
      const user = buildStoredUser({ authProvider: 'oidc' });
      mockDb.user.findByPk.mockResolvedValue(user);
      mockFavoriteHelpers.extractOidcAccessToken.mockReturnValue('oidc-token');
      mockAxios.patch.mockRejectedValue({ response: { status: 500 } });
      const res = buildResponse();

      await updatePreferences(buildRequest({ mode: 'dark' }), res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'https://auth.startcloud.com/probs/internal' })
      );
      expect(user.update).not.toHaveBeenCalled();
    });
  });
});
