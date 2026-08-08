import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { sendHubNotification } from '../../utils/notifyHub.js';
import { sendPushToUsers } from '../../utils/webPush.js';
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
      recipients.push({ issuer: credential.provider, uuid: credential.subject });
    }
  }
  return recipients;
};

const notifyBoxWatchers = async ({
  organization,
  watcherUserIds,
  notification,
  type,
  severity,
  idempotencyKeyBase,
}) => {
  const recipients = await resolveWatcherRecipients(organization, watcherUserIds);
  await Promise.all(
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
};

const findOrgMemberUserIds = async organizationId => {
  const memberships = await db.UserOrg.findAll({ where: { organization_id: organizationId } });
  return memberships.map(membership => membership.user_id);
};

const fanOutVersionEvent = async ({
  organization,
  boxName,
  isExternal,
  notification,
  type,
  severity,
  key,
}) => {
  const watcherUserIds = await findBoxWatcherUserIds(organization.id, boxName);

  if (isExternal) {
    await sendHubNotification({
      issuer: organization.external_issuer,
      recipient: { org_uuid: organization.external_org_id, roles: ORG_ROLES },
      notification,
      type,
      severity,
      idempotencyKey: key,
    });
  }
  await notifyBoxWatchers({
    organization,
    watcherUserIds,
    notification,
    type,
    severity,
    idempotencyKeyBase: key,
  });

  const orgMemberUserIds = await findOrgMemberUserIds(organization.id);
  await sendPushToUsers([...watcherUserIds, ...orgMemberUserIds], notification);
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
      notification: {
        title: `New version of ${organization.name}/${boxName}`,
        body: `${versionNumber} was published.`,
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
      notification: {
        title: `Version deprecated: ${organization.name}/${boxName} ${versionNumber}`,
        body: reason,
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
