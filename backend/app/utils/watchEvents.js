import { sendHubNotification } from './notifyHub.js';
import { sendPushToUsers } from './webPush.js';
import { organizationLanguage, resolveUserLanguages } from './userLanguage.js';
import { getSupportedLocales, t } from '../config/i18n.js';
import db from '../models/index.js';

const ORG_ROLES = ['owner', 'admin', 'member'];

const findOrgMemberUserIds = async organizationId => {
  const memberships = await db.UserOrg.findAll({ where: { organization_id: organizationId } });
  return memberships.map(membership => membership.user_id);
};

const resolveWatcherRecipients = async (organization, watcherUserIds) => {
  if (watcherUserIds.length === 0) {
    return [];
  }
  const { Op } = db.Sequelize;
  const providerFilter = organization.external_issuer
    ? organization.external_issuer
    : { [Op.startsWith]: 'https://' };
  const credentials = await db.credential.findAll({
    where: { user_id: { [Op.in]: watcherUserIds }, provider: providerFilter },
  });

  const seenUserIds = new Set();
  const recipients = [];
  for (const credential of credentials) {
    if (!seenUserIds.has(credential.user_id)) {
      seenUserIds.add(credential.user_id);
      recipients.push({
        userId: credential.user_id,
        issuer: credential.provider,
        uuid: credential.subject,
      });
    }
  }
  return recipients;
};

const composeForHub = message => {
  const title = {};
  const body = message.bodyKey ? {} : null;

  for (const language of getSupportedLocales()) {
    title[language] = t(message.titleKey, language, message.replacements);
    if (body) {
      body[language] = t(message.bodyKey, language, message.replacements);
    }
  }

  return {
    title,
    body: body || message.body,
    navigate: message.navigate,
    tag: message.tag,
  };
};

const composeForPush = (languages, message) => {
  const byLanguage = new Map();
  for (const language of new Set(languages)) {
    byLanguage.set(language, {
      title: t(message.titleKey, language, message.replacements),
      body: message.bodyKey ? t(message.bodyKey, language, message.replacements) : message.body,
      navigate: message.navigate,
      tag: message.tag,
    });
  }
  return byLanguage;
};

const notifyWatchers = ({ recipients, notification, type, severity, idempotencyKeyBase }) =>
  Promise.all(
    recipients.map(({ issuer, uuid }) =>
      sendHubNotification({
        issuer,
        recipient: { user_uuid: uuid },
        notification,
        type,
        severity,
        idempotencyKey: `${idempotencyKeyBase}:user:${uuid}`,
      })
    )
  );

/**
 * Fan an event about a watched item out to everyone who should hear it: the
 * organization on the hub when it is externally managed, every watcher on the
 * hub through their identity-provider credential, and every watcher and
 * organization member as a browser push in their own language. The hub form
 * carries the title and body as language maps and resolves them per
 * recipient; the push form is resolved here, one variant per language.
 * @param {Object} params
 * @param {Object} params.organization - Organization row
 * @param {number[]} params.watcherUserIds - Users watching the item
 * @param {boolean} params.isExternal - Whether the organization is hub-managed
 * @param {Object} params.message - titleKey, bodyKey or body, replacements, navigate, tag
 * @param {string} params.type - Hub notification type
 * @param {string} params.severity - Hub notification severity
 * @param {string} params.key - Idempotency key base
 * @returns {Promise<void>}
 */
const fanOutWatchEvent = async ({
  organization,
  watcherUserIds,
  isExternal,
  message,
  type,
  severity,
  key,
}) => {
  const orgMemberUserIds = await findOrgMemberUserIds(organization.id);
  const fallbackLanguage = organizationLanguage(organization);
  const languagesByUserId = await resolveUserLanguages(
    [...watcherUserIds, ...orgMemberUserIds],
    organization
  );
  const hubNotification = composeForHub(message);

  if (isExternal) {
    await sendHubNotification({
      issuer: organization.external_issuer,
      recipient: { org_uuid: organization.external_org_id, roles: ORG_ROLES },
      notification: hubNotification,
      type,
      severity,
      idempotencyKey: key,
    });
  }

  const recipients = await resolveWatcherRecipients(organization, watcherUserIds);
  await notifyWatchers({
    recipients,
    notification: hubNotification,
    type,
    severity,
    idempotencyKeyBase: key,
  });

  const localized = composeForPush([fallbackLanguage, ...languagesByUserId.values()], message);
  const pushGroups = new Map();
  for (const userId of new Set([...watcherUserIds, ...orgMemberUserIds])) {
    const language = languagesByUserId.get(userId) || fallbackLanguage;
    if (!pushGroups.has(language)) {
      pushGroups.set(language, []);
    }
    pushGroups.get(language).push(userId);
  }

  await Promise.all(
    [...pushGroups.entries()].map(([language, userIds]) =>
      sendPushToUsers(userIds, localized.get(language) || localized.get(fallbackLanguage))
    )
  );
};

export { fanOutWatchEvent };
