import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { fanOutWatchEvent } from '../../utils/watchEvents.js';
import db from '../../models/index.js';

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

const fanOutVersionEvent = async ({
  organization,
  boxName,
  isExternal,
  message,
  type,
  severity,
  key,
}) =>
  fanOutWatchEvent({
    organization,
    watcherUserIds: await findBoxWatcherUserIds(organization.id, boxName),
    isExternal,
    message,
    type,
    severity,
    key,
  });

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
