// notifications.js — hub producers for version lifecycle events. Only boxes
// in externally-managed organizations (external_issuer + external_org_id set)
// fan out through the IdP's notification hub; local orgs have no hub. Both
// producers are fire-and-forget and never throw into their controllers.
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { sendHubNotification } from '../../utils/notifyHub.js';

const ORG_ROLES = ['owner', 'admin', 'member'];

/**
 * Build the shared hub-notification context for a version event, or null when
 * the organization is local (no IdP fan-out).
 * @param {Object} organization - Organization row (external ids + name)
 * @param {string} boxName - Box name (URL slug)
 * @param {string} versionNumber - Version number the event is about
 * @returns {Object|null} { issuer, orgUuid, recipient, navigate } or null
 */
const buildVersionEventContext = (organization, boxName, versionNumber) => {
  if (!organization.external_issuer || !organization.external_org_id) {
    return null;
  }
  const origin = loadConfig('app').boxvault.origin.value;
  return {
    issuer: organization.external_issuer,
    orgUuid: organization.external_org_id,
    recipient: { org_uuid: organization.external_org_id, roles: ORG_ROLES },
    navigate: `${origin}/${organization.name}/${boxName}/${versionNumber}`,
  };
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
    const context = buildVersionEventContext(organization, boxName, versionNumber);
    if (!context) {
      return;
    }
    await sendHubNotification({
      issuer: context.issuer,
      recipient: context.recipient,
      notification: {
        title: `New version of ${organization.name}/${boxName}`,
        body: `${versionNumber} was published.`,
        navigate: context.navigate,
        tag: 'boxvault-version',
      },
      type: 'SYSTEM',
      severity: 'INFO',
      idempotencyKey: `boxvault:version-created:${context.orgUuid}:${boxName}:${versionNumber}`,
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
    const context = buildVersionEventContext(organization, boxName, versionNumber);
    if (!context) {
      return;
    }
    await sendHubNotification({
      issuer: context.issuer,
      recipient: context.recipient,
      notification: {
        title: `Version deprecated: ${organization.name}/${boxName} ${versionNumber}`,
        body: reason,
        navigate: context.navigate,
        tag: 'boxvault-deprecation',
      },
      type: 'SYSTEM',
      severity: 'WARNING',
      idempotencyKey: `boxvault:version-deprecated:${context.orgUuid}:${boxName}:${versionNumber}`,
    });
  } catch (err) {
    log.app.warn('Version-deprecated notification skipped', { error: err.message });
  }
};

export { notifyVersionCreated, notifyVersionDeprecated };
