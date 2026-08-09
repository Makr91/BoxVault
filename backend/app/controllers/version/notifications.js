import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { sendHubNotification } from '../../utils/notifyHub.js';
import { sendPushToUsers } from '../../utils/webPush.js';
import { organizationLanguage, resolveUserLanguages } from '../../utils/userLanguage.js';
import { getSupportedLocales, t } from '../../config/i18n.js';
import db from '../../models/index.js';

const ORG_ROLES = ['owner', 'admin', 'member'];

const buildVersionEvent = (organization, boxName, versionNumber) => {
  const origin = loadConfig('app').boxvault.origin.value;
  return {
    isExternal: Boolean(organization.external_issuer && organization.external_org_id),
    orgSegment: organization.external_org_id || organization.name,
    navigate: `${origin}/${organization.name}/${boxName}/${versionNumber}`,
  };
};

const findBoxWatcherUserIds = async (organizationId, boxName) => {
  const box = await db.box.findOne({ where: { name: boxName, organizationId } });
  if (!box) {
    return [];
  }
  const watchers = await db.boxWatcher.findAll({ where: { box_id: box.id } });
  return watchers.map(watcher => watcher.user_id);
};

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

// Hub form: title and body travel as BCP 47 maps and the hub resolves per
// recipient at delivery. That is what makes the ORG-ADDRESSED send correct —
// those recipients are chosen by the hub and BoxVault never enumerates them,
// so grouping by language here could never have covered them.
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
    // A deprecation reason is operator-authored free text, so it stays a plain
    // string — the contract takes either form per field.
    body: body || message.body,
    navigate: message.navigate,
    tag: message.tag,
  };
};

// BoxVault sends its own OS toasts, so those are resolved here rather than by
// the hub, one variant per recipient language.
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

const notifyBoxWatchers = ({ recipients, notification, type, severity, idempotencyKeyBase }) =>
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

const fanOutVersionEvent = async ({
  organization,
  boxName,
  isExternal,
  message,
  type,
  severity,
  key,
}) => {
  const watcherUserIds = await findBoxWatcherUserIds(organization.id, boxName);
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
  await notifyBoxWatchers({
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

/**
 * Notify the org's hub members that a new version was published on a box.
 * Fire-and-forget: never throws.
 * @param {Object} organization - Organization row
 * @param {string} boxName - Box name
 * @param {string} versionNumber - Newly created version number
 * @returns {Promise<void>}
 */
const notifyVersionCreated = async (organization, boxName, versionNumber) => {
  try {
    const event = buildVersionEvent(organization, boxName, versionNumber);
    await fanOutVersionEvent({
      organization,
      boxName,
      isExternal: event.isExternal,
      message: {
        titleKey: 'notifications.versionCreated.title',
        bodyKey: 'notifications.versionCreated.body',
        replacements: {
          organization: organization.name,
          box: boxName,
          version: versionNumber,
        },
        navigate: event.navigate,
        tag: 'boxvault-version',
      },
      type: 'SYSTEM',
      severity: 'INFO',
      key: `boxvault:version-created:${event.orgSegment}:${boxName}:${versionNumber}`,
    });
  } catch (err) {
    log.app.warn('Version-created notification skipped', { error: err.message });
  }
};

/**
 * Notify the org's hub members that a version was deprecated.
 * Fire-and-forget: never throws.
 * @param {Object} organization - Organization row
 * @param {string} boxName - Box name
 * @param {string} versionNumber - Version number (post-update)
 * @param {string} reason - Deprecation reason (notification body)
 * @returns {Promise<void>}
 */
const notifyVersionDeprecated = async (organization, boxName, versionNumber, reason) => {
  try {
    const event = buildVersionEvent(organization, boxName, versionNumber);
    await fanOutVersionEvent({
      organization,
      boxName,
      isExternal: event.isExternal,
      message: {
        titleKey: 'notifications.versionDeprecated.title',
        // The reason is operator-authored free text, so it is never translated.
        body: reason,
        replacements: {
          organization: organization.name,
          box: boxName,
          version: versionNumber,
        },
        navigate: event.navigate,
        tag: 'boxvault-deprecation',
      },
      type: 'SYSTEM',
      severity: 'WARNING',
      key: `boxvault:version-deprecated:${event.orgSegment}:${boxName}:${versionNumber}`,
    });
  } catch (err) {
    log.app.warn('Version-deprecated notification skipped', { error: err.message });
  }
};

export { notifyVersionCreated, notifyVersionDeprecated };
