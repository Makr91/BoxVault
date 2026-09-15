import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { fanOutWatchEvent } from '../../utils/watchEvents.js';
import db from '../../models/index.js';

const findDownloadWatcherUserIds = async downloadId => {
  const watchers = await db.downloadWatcher.findAll({ where: { download_id: downloadId } });
  return watchers.map(watcher => watcher.user_id);
};

/**
 * Notify the org's hub members and the download's watchers that a download
 * was published. Fire-and-forget: never throws.
 * @param {Object} organization - Organization row
 * @param {Object} download - Download row, after the publish
 * @returns {Promise<void>}
 */
const notifyDownloadPublished = async (organization, download) => {
  try {
    const { origin } = loadConfig('app').boxvault;
    const orgSegment = organization.external_org_id || organization.name;
    await fanOutWatchEvent({
      organization,
      watcherUserIds: await findDownloadWatcherUserIds(download.id),
      isExternal: Boolean(organization.external_issuer && organization.external_org_id),
      message: {
        titleKey: 'notifications.downloadPublished.title',
        bodyKey: 'notifications.downloadPublished.body',
        replacements: {
          organization: organization.name,
          download: download.name,
        },
        navigate: `${origin}/${organization.name}/downloads/${download.name}`,
        tag: 'boxvault-download',
      },
      type: 'SYSTEM',
      severity: 'INFO',
      key: `boxvault:download-published:${orgSegment}:${download.id}:${download.updatedAt.toISOString()}`,
    });
  } catch (err) {
    log.app.warn('Download-published notification skipped', { error: err.message });
  }
};

export { notifyDownloadPublished };
