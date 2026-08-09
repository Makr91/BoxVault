// preferences.js — language / theme / timezone for the signed-in user.
//
// Federated accounts: the identity provider owns these, so a write is
// delegated to its PATCH /api/user/preferences on the acting user's own token
// and only mirrored locally once it succeeds. Its SCIM push converges every
// other consumer; the local mirror just avoids a visible lag before that lands.
//
// Local accounts have no provider, so the BoxVault columns are the whole story.
import axios from 'axios';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { getAuthServerUrl, extractOidcAccessToken } from '../favorites/helpers.js';

const { user: User } = db;

const THEMES = ['light', 'dark', 'auto'];
// RFC 5646 shape check only — the provider validates the tag itself.
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;
// The provider's contract caps a language tag at 10 characters. Matching it
// means a tag we accept is a tag it accepts, so a local account can never be
// set to something a federated one would be refused.
const MAX_LANGUAGE_LENGTH = 10;

const isClearing = value => value === null || value === '';

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
  const { language, theme, timezone } = body;

  if (typeof language !== 'undefined' && !isClearing(language)) {
    if (
      typeof language !== 'string' ||
      language.length > MAX_LANGUAGE_LENGTH ||
      !LANGUAGE_PATTERN.test(language)
    ) {
      return 'language';
    }
  }
  if (typeof theme !== 'undefined' && !isClearing(theme) && !THEMES.includes(theme)) {
    return 'theme';
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
    theme: 'preferredTheme',
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
  theme: user.preferredTheme || null,
  timezone: user.timezone || null,
});

/**
 * @swagger
 * /api/user/preferences:
 *   get:
 *     summary: Get the signed-in user's preferences
 *     description: Language, colour-scheme variant, and timezone as stored by BoxVault.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current preferences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 language:
 *                   type: string
 *                   nullable: true
 *                 theme:
 *                   type: string
 *                   nullable: true
 *                   enum: [light, dark, auto]
 *                 timezone:
 *                   type: string
 *                   nullable: true
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
export const getPreferences = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }
    return res.status(200).send(toWireShape(user));
  } catch (err) {
    log.error.error('Error reading preferences:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

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
 *     description: Every key is optional. An omitted key is left unchanged; null or an empty string clears it. For accounts backed by an identity provider the write is delegated there first and mirrored locally only on success.
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
 *               theme:
 *                 type: string
 *                 nullable: true
 *                 enum: [light, dark, auto]
 *               timezone:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Updated preferences
 *       400:
 *         description: A supplied value failed validation
 *       404:
 *         description: User not found
 *       502:
 *         description: The identity provider rejected or could not be reached
 *       500:
 *         description: Internal server error
 */
export const updatePreferences = async (req, res) => {
  const body = req.body || {};
  const invalidField = findInvalidField(body);

  if (invalidField) {
    return res.status(400).send({ message: req.__('users.preferenceInvalid', { invalidField }) });
  }

  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
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
          return res.status(400).send({ message: req.__('users.preferencesRequireIdpSession') });
        }
      } catch (delegationErr) {
        const upstreamStatus = delegationErr.response?.status;
        const upstreamMessage = delegationErr.response?.data?.error;
        if (upstreamStatus === 400 && upstreamMessage) {
          return res.status(400).send({ message: upstreamMessage });
        }
        log.error.error('Failed to delegate preferences to auth server:', delegationErr);
        return res.status(502).send({ message: req.__('users.preferencesDelegationFailed') });
      }
    }

    await user.update(patch);
    return res.status(200).send(toWireShape(user));
  } catch (err) {
    log.error.error('Error updating preferences:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
