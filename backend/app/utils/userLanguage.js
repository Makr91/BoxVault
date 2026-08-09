// userLanguage.js — resolves which language a message should be written in.
//
// Anything BoxVault composes FOR someone else (notifications fanned out to
// watchers, invitation and verification mail) must use the recipient's
// language, not the requester's. req.getLocale() answers the wrong question
// there, so these helpers resolve from stored state instead.
//
// Chain: the user's stored preferredLanguage, then their locale, then the
// organization's locale (SCIM-synced on the Group extension, so it is
// populated for customer orgs and is the only signal available for an invitee
// who has no account yet), then the configured default.
import { findBestMatchingLocale, getSupportedLocales, getDefaultLocale } from '../config/i18n.js';
import db from '../models/index.js';

/**
 * Narrow any BCP 47 tag to a locale this deployment actually ships, using RFC
 * 4647 lookup (exact tag, then primary subtag, then the default).
 * @param {string|null|undefined} tag - Requested language tag
 * @returns {string} A supported locale
 */
const toSupportedLanguage = tag =>
  tag ? findBestMatchingLocale(tag, getSupportedLocales()) : getDefaultLocale();

/**
 * The language an organization's messages default to.
 * @param {Object|null|undefined} organization - Organization row
 * @returns {string} A supported locale
 */
const organizationLanguage = organization => toSupportedLanguage(organization?.locale);

/**
 * Resolve one language per user id, falling back to the organization's
 * language and then the configured default.
 * @param {number[]} userIds - BoxVault user ids
 * @param {Object|null} [organization] - Organization providing the fallback
 * @returns {Promise<Map<number, string>>} user id -> supported locale
 */
const resolveUserLanguages = async (userIds, organization = null) => {
  const fallback = organizationLanguage(organization);
  const unique = [...new Set(userIds)].filter(Boolean);

  if (unique.length === 0) {
    return new Map();
  }

  const { Op } = db.Sequelize;
  const users = await db.user.findAll({
    where: { id: { [Op.in]: unique } },
    attributes: ['id', 'preferredLanguage', 'locale'],
  });

  const byUserId = new Map(unique.map(id => [id, fallback]));
  for (const user of users) {
    const stored = user.preferredLanguage || user.locale;
    byUserId.set(user.id, stored ? toSupportedLanguage(stored) : fallback);
  }
  return byUserId;
};

/**
 * Resolve the language for a single user id.
 * @param {number} userId - BoxVault user id
 * @param {Object|null} [organization] - Organization providing the fallback
 * @returns {Promise<string>} A supported locale
 */
const resolveUserLanguage = async (userId, organization = null) => {
  const languages = await resolveUserLanguages([userId], organization);
  return languages.get(userId) || organizationLanguage(organization);
};

/**
 * Resolve the language for an email recipient who may not have an account —
 * an invitee, for instance. Falls back to the organization's language.
 * @param {string} email - Recipient address
 * @param {Object|null} [organization] - Organization providing the fallback
 * @returns {Promise<string>} A supported locale
 */
const resolveEmailLanguage = async (email, organization = null) => {
  const fallback = organizationLanguage(organization);

  if (!email) {
    return fallback;
  }

  const user = await db.user.findOne({
    where: { email },
    attributes: ['preferredLanguage', 'locale'],
  });
  const stored = user?.preferredLanguage || user?.locale;
  return stored ? toSupportedLanguage(stored) : fallback;
};

export {
  toSupportedLanguage,
  organizationLanguage,
  resolveUserLanguages,
  resolveUserLanguage,
  resolveEmailLanguage,
};
