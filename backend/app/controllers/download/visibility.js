import db from '../../models/index.js';
import { resolveJwtUser } from '../../utils/jwtUser.js';
import { resolveViewer } from '../../utils/orgMembership.js';
import {
  extractBearerToken,
  findServiceAccountByRawToken,
} from '../../utils/serviceAccountAuth.js';

const { Sequelize } = db;
const { Op } = Sequelize;

const PUBLIC_DOWNLOAD = { isPublic: true, published: true };

/**
 * Resolve who is reading downloads, the same optional-auth rule the ISO read
 * routes apply: a service account, by raw key or session JWT, sees its own
 * organization at its effective role; a user already authenticated by an
 * earlier middleware, or resolved from the request's session JWT or
 * identity-provider token, sees every organization they belong to; anonymous
 * callers resolve to null and see only public, published downloads.
 * @param {import('express').Request} req - The request carrying the credentials
 * @returns {Promise<{userId: number, isServiceAccount: boolean, orgIds: number[], guestOrgIds: number[], managedOrgIds: number[]}|null>}
 *   The viewer of resolveViewer, or null
 */
const resolveDownloadViewer = async req => {
  const rawToken = extractBearerToken(req) || req.headers['x-access-token'];
  const serviceAccount = await findServiceAccountByRawToken(rawToken);
  if (serviceAccount) {
    return resolveViewer({
      userId: serviceAccount.userId,
      isServiceAccount: true,
      serviceAccountId: serviceAccount.id,
    });
  }
  if (req.userId) {
    return resolveViewer(req);
  }
  return resolveJwtUser(req);
};

/**
 * The where clause for the downloads a viewer may list: anyone sees public
 * published downloads, a member sees every published download of their
 * organizations plus the unpublished ones they created, a guest sees the
 * published downloads flagged for guests plus the ones they created.
 * @param {{userId: number, orgIds: number[], guestOrgIds: number[]}|null} viewer - From resolveDownloadViewer
 * @param {number} [organizationId] - Limit to one organization
 * @returns {Object} Sequelize where clause
 */
const downloadWhereFor = (viewer, organizationId) => {
  if (organizationId !== undefined) {
    if (viewer && viewer.orgIds.includes(organizationId)) {
      return { organizationId, [Op.or]: [{ published: true }, { userId: viewer.userId }] };
    }
    if (viewer && viewer.guestOrgIds.includes(organizationId)) {
      return {
        organizationId,
        [Op.or]: [
          PUBLIC_DOWNLOAD,
          { published: true, guestAccess: true },
          { userId: viewer.userId },
        ],
      };
    }
    return { organizationId, ...PUBLIC_DOWNLOAD };
  }
  if (!viewer) {
    return { ...PUBLIC_DOWNLOAD };
  }
  return {
    [Op.or]: [
      PUBLIC_DOWNLOAD,
      { published: true, organizationId: { [Op.in]: viewer.orgIds } },
      { organizationId: { [Op.in]: viewer.orgIds }, userId: viewer.userId },
      { published: true, guestAccess: true, organizationId: { [Op.in]: viewer.guestOrgIds } },
      { organizationId: { [Op.in]: viewer.guestOrgIds }, userId: viewer.userId },
    ],
  };
};

/**
 * Whether a viewer may read one download: public and published, a member of
 * its organization when it is published or the viewer created it, a guest of
 * its organization when it is published and flagged for guests or the viewer
 * created it.
 * @param {{userId: number, orgIds: number[], guestOrgIds: number[]}|null} viewer - From resolveDownloadViewer
 * @param {Object} download - The download row
 * @returns {boolean} True when the download is visible to the viewer
 */
const canSeeDownload = (viewer, download) =>
  Boolean(download.isPublic && download.published) ||
  Boolean(
    viewer &&
    viewer.orgIds.includes(download.organizationId) &&
    (download.published || download.userId === viewer.userId)
  ) ||
  Boolean(
    viewer &&
    viewer.guestOrgIds.includes(download.organizationId) &&
    ((download.published && download.guestAccess) || download.userId === viewer.userId)
  );

/**
 * Whether a viewer is a writing member of an organization, the rule the
 * download counts are answered by: the number to a member, null to a guest
 * and to anyone else.
 * @param {{orgIds: number[]}|null} viewer - From resolveDownloadViewer
 * @param {number} organizationId - Organization id
 * @returns {boolean} True when the viewer belongs to the organization
 */
const isMemberOf = (viewer, organizationId) =>
  Boolean(viewer && viewer.orgIds.includes(organizationId));

export { resolveDownloadViewer, downloadWhereFor, canSeeDownload, isMemberOf };
