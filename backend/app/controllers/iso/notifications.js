import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { fanOutWatchEvent } from '../../utils/watchEvents.js';
import db from '../../models/index.js';

const findIsoWatcherUserIds = async isoId => {
  const watchers = await db.isoWatcher.findAll({ where: { iso_id: isoId } });
  return watchers.map(watcher => watcher.user_id);
};

/**
 * Notify the org's hub members and the ISO's watchers that an ISO was
 * published. Fire-and-forget: never throws.
 * @param {Object} organization - Organization row
 * @param {Object} iso - ISO row, after the publish
 * @returns {Promise<void>}
 */
const notifyIsoPublished = async (organization, iso) => {
  try {
    const origin = loadConfig('app').boxvault.origin.value;
    const orgSegment = organization.external_org_id || organization.name;
    await fanOutWatchEvent({
      organization,
      watcherUserIds: await findIsoWatcherUserIds(iso.id),
      isExternal: Boolean(organization.external_issuer && organization.external_org_id),
      message: {
        titleKey: 'notifications.isoPublished.title',
        bodyKey: 'notifications.isoPublished.body',
        replacements: {
          organization: organization.name,
          iso: iso.name,
        },
        navigate: `${origin}/${organization.name}/isos/${iso.name}`,
        tag: 'boxvault-iso',
      },
      type: 'SYSTEM',
      severity: 'INFO',
      key: `boxvault:iso-published:${orgSegment}:${iso.id}:${iso.updatedAt.toISOString()}`,
    });
  } catch (err) {
    log.app.warn('ISO-published notification skipped', { error: err.message });
  }
};

export { notifyIsoPublished };
