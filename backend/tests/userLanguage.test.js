import db from '../app/models/index.js';
import {
  toSupportedLanguage,
  organizationLanguage,
  resolveUserLanguages,
  resolveUserLanguage,
  resolveEmailLanguage,
} from '../app/utils/userLanguage.js';

describe('User Language Resolution', () => {
  const uniqueId = Date.now().toString(36);
  const missingEmail = `lang-nobody-${uniqueId}@example.com`;
  const unknownUserId = 987654;
  const otherUnknownUserId = 987655;

  let spanishOrg;
  let localelessOrg;
  let preferredUser;
  let localeOnlyUser;
  let unsetUser;
  let unsupportedUser;

  beforeAll(async () => {
    spanishOrg = await db.organization.create({
      name: `LangOrg-${uniqueId}`,
      locale: 'es-MX',
    });
    localelessOrg = await db.organization.create({
      name: `LangOrgNoLocale-${uniqueId}`,
    });

    preferredUser = await db.user.create({
      username: `LangPreferred-${uniqueId}`,
      email: `lang-preferred-${uniqueId}@example.com`,
      password: 'external',
      preferredLanguage: 'es',
      locale: 'en-US',
    });
    localeOnlyUser = await db.user.create({
      username: `LangLocaleOnly-${uniqueId}`,
      email: `lang-locale-${uniqueId}@example.com`,
      password: 'external',
      preferredLanguage: null,
      locale: 'es-MX',
    });
    unsetUser = await db.user.create({
      username: `LangUnset-${uniqueId}`,
      email: `lang-unset-${uniqueId}@example.com`,
      password: 'external',
      preferredLanguage: null,
      locale: null,
    });
    unsupportedUser = await db.user.create({
      username: `LangUnsupported-${uniqueId}`,
      email: `lang-unsupported-${uniqueId}@example.com`,
      password: 'external',
      preferredLanguage: 'fr-CA',
      locale: null,
    });
  });

  afterAll(async () => {
    await db.user.destroy({
      where: {
        id: [preferredUser.id, localeOnlyUser.id, unsetUser.id, unsupportedUser.id],
      },
    });
    await db.organization.destroy({ where: { id: [spanishOrg.id, localelessOrg.id] } });
  });

  describe('toSupportedLanguage', () => {
    it('should keep a tag this deployment ships', () => {
      expect(toSupportedLanguage('es')).toBe('es');
      expect(toSupportedLanguage('en')).toBe('en');
    });

    it('should narrow a regional tag to its shipped primary subtag', () => {
      expect(toSupportedLanguage('es-MX')).toBe('es');
      expect(toSupportedLanguage('es-419')).toBe('es');
      expect(toSupportedLanguage('en-GB')).toBe('en');
    });

    it('should match a shipped tag regardless of case', () => {
      expect(toSupportedLanguage('ES')).toBe('es');
    });

    it('should fall back to the default for a tag this deployment does not ship', () => {
      expect(toSupportedLanguage('fr-CA')).toBe('en');
      expect(toSupportedLanguage('de')).toBe('en');
    });

    it('should fall back to the default for a missing tag', () => {
      expect(toSupportedLanguage(null)).toBe('en');
      expect(toSupportedLanguage(undefined)).toBe('en');
      expect(toSupportedLanguage('')).toBe('en');
    });
  });

  describe('organizationLanguage', () => {
    it('should narrow the organization locale to a shipped language', () => {
      expect(organizationLanguage(spanishOrg)).toBe('es');
    });

    it('should fall back to the default when the organization has no locale', () => {
      expect(organizationLanguage(localelessOrg)).toBe('en');
    });

    it('should fall back to the default when there is no organization', () => {
      expect(organizationLanguage(null)).toBe('en');
      expect(organizationLanguage(undefined)).toBe('en');
    });
  });

  describe('resolveUserLanguages', () => {
    it('should return an empty map for an empty list', async () => {
      const languages = await resolveUserLanguages([], spanishOrg);
      expect(languages.size).toBe(0);
    });

    it('should return an empty map when every id is falsy', async () => {
      const languages = await resolveUserLanguages([null, undefined, 0], spanishOrg);
      expect(languages.size).toBe(0);
    });

    it('should prefer the stored preferredLanguage over the stored locale', async () => {
      const languages = await resolveUserLanguages([preferredUser.id], spanishOrg);
      expect(languages.get(preferredUser.id)).toBe('es');
    });

    it('should fall back to the stored locale when no preferredLanguage is set', async () => {
      const languages = await resolveUserLanguages([localeOnlyUser.id], localelessOrg);
      expect(languages.get(localeOnlyUser.id)).toBe('es');
    });

    it('should fall back to the organization language when the user stores neither', async () => {
      const languages = await resolveUserLanguages([unsetUser.id], spanishOrg);
      expect(languages.get(unsetUser.id)).toBe('es');
    });

    it('should fall back to the configured default when there is no organization', async () => {
      const languages = await resolveUserLanguages([unsetUser.id]);
      expect(languages.get(unsetUser.id)).toBe('en');
    });

    it('should narrow an unsupported stored tag rather than use the organization language', async () => {
      const languages = await resolveUserLanguages([unsupportedUser.id], spanishOrg);
      expect(languages.get(unsupportedUser.id)).toBe('en');
    });

    it('should map unknown ids onto the organization language', async () => {
      const languages = await resolveUserLanguages([unknownUserId, otherUnknownUserId], spanishOrg);
      expect(languages.size).toBe(2);
      expect(languages.get(unknownUserId)).toBe('es');
      expect(languages.get(otherUnknownUserId)).toBe('es');
    });

    it('should map unknown ids onto the configured default without an organization', async () => {
      const languages = await resolveUserLanguages([unknownUserId]);
      expect(languages.get(unknownUserId)).toBe('en');
    });

    it('should resolve a mix of known and unknown ids independently', async () => {
      const languages = await resolveUserLanguages(
        [preferredUser.id, unsupportedUser.id, unsetUser.id, unknownUserId],
        spanishOrg
      );

      expect(languages.size).toBe(4);
      expect(languages.get(preferredUser.id)).toBe('es');
      expect(languages.get(unsupportedUser.id)).toBe('en');
      expect(languages.get(unsetUser.id)).toBe('es');
      expect(languages.get(unknownUserId)).toBe('es');
    });

    it('should collapse duplicate ids into a single entry', async () => {
      const languages = await resolveUserLanguages(
        [preferredUser.id, preferredUser.id, preferredUser.id],
        spanishOrg
      );
      expect(languages.size).toBe(1);
      expect(languages.get(preferredUser.id)).toBe('es');
    });
  });

  describe('resolveUserLanguage', () => {
    it('should resolve the stored language of one user', async () => {
      await expect(resolveUserLanguage(unsupportedUser.id, spanishOrg)).resolves.toBe('en');
    });

    it('should fall back to the organization language for an unknown id', async () => {
      await expect(resolveUserLanguage(unknownUserId, spanishOrg)).resolves.toBe('es');
    });

    it('should fall back to the organization language for a missing id', async () => {
      await expect(resolveUserLanguage(null, spanishOrg)).resolves.toBe('es');
    });
  });

  describe('resolveEmailLanguage', () => {
    it('should fall back to the organization language for an address with no account', async () => {
      await expect(resolveEmailLanguage(missingEmail, spanishOrg)).resolves.toBe('es');
    });

    it('should fall back to the configured default with no account and no organization', async () => {
      await expect(resolveEmailLanguage(missingEmail)).resolves.toBe('en');
    });

    it('should fall back to the organization language for a missing address', async () => {
      await expect(resolveEmailLanguage('', spanishOrg)).resolves.toBe('es');
      await expect(resolveEmailLanguage(null, spanishOrg)).resolves.toBe('es');
    });

    it('should prefer the account language over the organization language', async () => {
      await expect(resolveEmailLanguage(unsupportedUser.email, spanishOrg)).resolves.toBe('en');
    });

    it('should narrow the stored locale when the account has no preferredLanguage', async () => {
      await expect(resolveEmailLanguage(localeOnlyUser.email, localelessOrg)).resolves.toBe('es');
    });

    it('should fall back to the organization for an account that stores neither', async () => {
      await expect(resolveEmailLanguage(unsetUser.email, spanishOrg)).resolves.toBe('es');
    });
  });
});
