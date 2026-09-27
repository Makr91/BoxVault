// preferences.js — language / mode / theme / motion / timezone for the signed-in user.
//
// Federated accounts: the identity provider owns these, so a write is
// delegated to its PATCH /api/user/preferences on the acting user's own token
// and only mirrored locally once it succeeds. Its SCIM push converges every
// other consumer; the local mirror just avoids a visible lag before that lands.
//
// Local accounts have no provider, so the BoxVault columns are the whole story.
import axios from 'axios';
import { log } from '../../utils/Logger.js';
import { problem, refuse } from '../../utils/problem.js';
import { getSiteConfig } from '../../utils/config-loader.js';
import db from '../../models/index.js';
import { getAuthServerUrl, extractOidcAccessToken } from '../favorites/helpers.js';
import { notifyProfileUpdated } from '../../utils/events.js';

const { user: User } = db;

const badRequest = (req, res, title) =>
  problem(res, req, { status: 400, type: 'bad-request', title });

const MODES = ['light', 'dark', 'auto'];
const MOTIONS = ['auto', 'reduce'];
// RFC 5646 shape check only — the provider validates the tag itself.
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;
// The provider's contract caps a language tag at 10 characters. Matching it
// means a tag we accept is a tag it accepts, so a local account can never be
// set to something a federated one would be refused.
const MAX_LANGUAGE_LENGTH = 10;

const THEME_NAME_PATTERN = /^[a-z0-9-]+$/;

const isClearing = value => value === null || value === '';

/**
 * The themes a hostname lets a person choose: the bare names of its sites
 * entry's brand.themes in order, an empty list for an empty key, and null for
 * the unnamed hostname or a site without the key, which offers every theme of
 * the build.
 * @param {string} hostname - The request's hostname
 * @returns {string[]|null} The offered theme names, or null for every theme
 */
const offeredThemes = hostname => {
  const themes = getSiteConfig(hostname)?.brand?.themes;
  return Array.isArray(themes)
    ? themes.filter(name => typeof name === 'string' && name.trim() !== '')
    : null;
};

/**
 * The failing rule of the theme member: an absent or clearing value passes;
 * without a brand.themes key any bare name passes and another shape is refused
 * pattern at /theme; with the key a name outside the list is refused enum at
 * /theme, every name when the list is empty.
 * @param {Object} body - Request body
 * @param {string} hostname - The request's hostname
 * @returns {{pointer: string, rule: string, params: Object}|null} The failing rule, or null
 */
const themeError = (body, hostname) => {
  const { theme } = body;
  if (typeof theme === 'undefined' || isClearing(theme)) {
    return null;
  }
  const bareName = typeof theme === 'string' && THEME_NAME_PATTERN.test(theme);
  const offered = offeredThemes(hostname);
  if (offered === null) {
    return bareName
      ? null
      : { pointer: '/theme', rule: 'pattern', params: { pattern: 'themeName' } };
  }
  if (bareName && offered.includes(theme)) {
    return null;
  }
  return { pointer: '/theme', rule: 'enum', params: { enum: offered.join(', ') } };
};

// Asking the runtime beats pattern-matching the string: plenty of valid IANA
// zone ids carry no region prefix (UTC, GMT, EST5EDT), so any shape rule
// rejects real zones.
const isKnownTimezone = value => {
  try {
    Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate the incoming patch. Absent keys mean "unchanged", null or empty
 * string mean "clear" — the identity provider's semantics, mirrored here so
 * both paths behave identically.
 * @param {Object} body - Request body
 * @returns {string|null} Invalid field name, or null when acceptable
 */
const findInvalidField = body => {
  const { language, mode, motion, timezone } = body;

  if (typeof language !== 'undefined' && !isClearing(language)) {
    if (
      typeof language !== 'string' ||
      language.length > MAX_LANGUAGE_LENGTH ||
      !LANGUAGE_PATTERN.test(language)
    ) {
      return 'language';
    }
  }
  if (typeof mode !== 'undefined' && !isClearing(mode) && !MODES.includes(mode)) {
    return 'mode';
  }
  if (typeof motion !== 'undefined' && !isClearing(motion) && !MOTIONS.includes(motion)) {
    return 'motion';
  }
  if (typeof timezone !== 'undefined' && !isClearing(timezone)) {
    if (typeof timezone !== 'string' || !isKnownTimezone(timezone)) {
      return 'timezone';
    }
  }
  return null;
};

/**
 * Map the wire keys onto the stored columns, skipping absent ones so an
 * omitted key leaves the stored value untouched.
 * @param {Object} body - Validated request body
 * @returns {Object} Sequelize update patch
 */
const buildPatch = body => {
  const patch = {};
  const columns = {
    language: 'preferredLanguage',
    mode: 'preferredMode',
    theme: 'preferredTheme',
    motion: 'preferredMotion',
    timezone: 'timezone',
  };

  for (const [key, column] of Object.entries(columns)) {
    if (typeof body[key] !== 'undefined') {
      patch[column] = isClearing(body[key]) ? null : body[key];
    }
  }
  return patch;
};

const toWireShape = user => ({
  language: user.preferredLanguage || null,
  mode: user.preferredMode || null,
  theme: user.preferredTheme || null,
  motion: user.preferredMotion || null,
  timezone: user.timezone || null,
});

const delegateToProvider = async (req, body) => {
  const oidcAccessToken = extractOidcAccessToken(req);
  if (!oidcAccessToken) {
    return false;
  }

  await axios.patch(`${getAuthServerUrl(req)}/api/user/preferences`, body, {
    headers: {
      Authorization: `Bearer ${oidcAccessToken}`,
      'Content-Type': 'application/json',
    },
  });
  return true;
};

/**
 * @swagger
 * /api/user/preferences:
 *   patch:
 *     summary: Update the signed-in user's preferences
 *     description: Every key is optional. An omitted key is left unchanged; null or an empty string clears it. mode is light, dark or auto, auto following the operating system, refused 400 otherwise. motion is the person's reduced-motion switch, auto following the device and reduce turning every animation off, refused 400 like an invalid mode otherwise. theme is a bare theme name setting the person's look. A hostname whose sites entry has no brand.themes key offers every theme of the UI build, so any bare name is accepted there and another shape is refused 422 pattern at /theme; a hostname with the key accepts exactly the listed names and refuses any other 422 enum at /theme, every name when the list is empty. For accounts backed by an identity provider the write is delegated there first and mirrored locally only on success.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               language:
 *                 type: string
 *                 nullable: true
 *               mode:
 *                 type: string
 *                 nullable: true
 *                 enum: [light, dark, auto]
 *                 description: The mode; null follows the operating system
 *               theme:
 *                 type: string
 *                 nullable: true
 *                 description: A bare theme name, any theme of the build on a hostname without brand.themes and one of the listed names on a hostname with it; null follows the hostname's own theme
 *               motion:
 *                 type: string
 *                 nullable: true
 *                 enum: [auto, reduce]
 *                 description: The reduced-motion switch that follows the person; null follows the device
 *               timezone:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Updated preferences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 language:
 *                   type: string
 *                   nullable: true
 *                 mode:
 *                   type: string
 *                   nullable: true
 *                 theme:
 *                   type: string
 *                   nullable: true
 *                 motion:
 *                   type: string
 *                   nullable: true
 *                 timezone:
 *                   type: string
 *                   nullable: true
 *       422:
 *         description: The theme is not a bare name, or not one this hostname offers
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       400:
 *         description: A supplied value failed validation, or the identity provider refused it
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: User not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       502:
 *         description: The identity provider could not be reached
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const updatePreferences = async (req, res) => {
  const body = req.body || {};
  const invalidField = findInvalidField(body);

  if (invalidField) {
    return badRequest(req, res, req.__('users.preferenceInvalid', { invalidField }));
  }
  const themeFailure = themeError(body, req.hostname);
  if (themeFailure) {
    return refuse(res, req, [themeFailure]);
  }

  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('users.userNotFound'),
      });
    }

    const patch = buildPatch(body);

    // Nothing to change means nothing to delegate — otherwise an empty body
    // would demand an identity-provider session to accomplish nothing.
    if (Object.keys(patch).length === 0) {
      return res.status(200).send(toWireShape(user));
    }

    if (user.authProvider && user.authProvider !== 'local') {
      try {
        const delegated = await delegateToProvider(req, body);
        if (!delegated) {
          return badRequest(req, res, req.__('users.preferencesRequireIdpSession'));
        }
      } catch (delegationErr) {
        const upstreamStatus = delegationErr.response?.status;
        const upstreamMessage = delegationErr.response?.data?.error;
        if (upstreamStatus === 400 && upstreamMessage) {
          return badRequest(req, res, upstreamMessage);
        }
        log.error.error('Failed to delegate preferences to auth server:', delegationErr);
        return problem(res, req, {
          status: 502,
          type: 'internal',
          title: req.__('users.preferencesDelegationFailed'),
        });
      }
    }

    await user.update(patch);
    notifyProfileUpdated(user.id);
    return res.status(200).send(toWireShape(user));
  } catch (err) {
    log.error.error('Error updating preferences:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
