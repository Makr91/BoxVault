import db from '../../models/index.js';
import { resolveJwtUser } from '../../utils/jwtUser.js';
import {
  reachOf,
  resolveViewer,
  uploadedBy,
  uploaderOrgIds,
  withinReach,
} from '../../utils/orgMembership.js';
import {
  extractBearerToken,
  findServiceAccountByRawToken,
} from '../../utils/serviceAccountAuth.js';

const { Sequelize } = db;
const { Op } = Sequelize;

const PUBLIC_ISO = { isPublic: true, published: true };

/**
 * Resolve who is reading ISOs, the same optional-auth rule the box read routes
 * apply: a service account, by raw key or session JWT, sees its own
 * organization at its effective role; a user already authenticated by an
 * earlier middleware, or resolved from the request's session JWT or
 * identity-provider token, sees every organization they belong to; anonymous
 * callers resolve to null and see only public, published ISOs.
 * @param {import('express').Request} req - The request carrying the credentials
 * @returns {Promise<{userId: number, isServiceAccount: boolean, orgIds: number[], guestOrgIds: number[], managedOrgIds: number[]}|null>}
 *   The viewer of resolveViewer, or null
 */
const resolveIsoViewer = async req => {
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
 * The where clause for the ISOs a viewer may list, the rule the box discover
 * route applies: anyone sees public published ISOs, a member sees every
 * published ISO of their organizations plus the unpublished ones they created,
 * a guest sees the published ISOs flagged for guests plus the ones they
 * created; a service account reads its creator's unpublished ISOs only where
 * it writes.
 * @param {{userId: number, isServiceAccount: boolean, orgIds: number[], guestOrgIds: number[]}|null} viewer - From resolveIsoViewer
 * @param {number} [organizationId] - Limit to one organization
 * @returns {Object} Sequelize where clause
 */
const isoWhereFor = (viewer, organizationId) => {
  if (organizationId !== undefined) {
    if (viewer && viewer.orgIds.includes(organizationId)) {
      return { organizationId, [Op.or]: [{ published: true }, { userId: viewer.userId }] };
    }
    if (viewer && viewer.guestOrgIds.includes(organizationId)) {
      return {
        organizationId,
        [Op.or]: [
          PUBLIC_ISO,
          { published: true, guestAccess: true },
          ...(viewer.isServiceAccount ? [] : [{ userId: viewer.userId }]),
        ],
      };
    }
    return { organizationId, ...PUBLIC_ISO };
  }
  if (!viewer) {
    return { ...PUBLIC_ISO };
  }
  return {
    [Op.or]: [
      PUBLIC_ISO,
      { published: true, organizationId: { [Op.in]: viewer.orgIds } },
      { published: true, guestAccess: true, organizationId: { [Op.in]: viewer.guestOrgIds } },
      { organizationId: { [Op.in]: uploaderOrgIds(viewer) }, userId: viewer.userId },
    ],
  };
};

/**
 * Whether a viewer may read one ISO: public and published, a member of its
 * organization when it is published or the viewer uploaded it, a guest of its
 * organization when it is published and flagged for guests or the viewer
 * uploaded it.
 * @param {{userId: number, isServiceAccount: boolean, orgIds: number[], guestOrgIds: number[]}|null} viewer - From resolveIsoViewer
 * @param {Object} iso - The ISO row
 * @returns {boolean} True when the ISO is visible to the viewer
 */
const canSeeIso = (viewer, iso) =>
  Boolean(iso.isPublic && iso.published) ||
  Boolean(viewer && viewer.orgIds.includes(iso.organizationId) && iso.published) ||
  Boolean(
    viewer && viewer.guestOrgIds.includes(iso.organizationId) && iso.published && iso.guestAccess
  ) ||
  uploadedBy(viewer, iso);

/**
 * Whether a viewer may read one version of an ISO they may read: the chain
 * ISO, version stands at the viewer's reach or wider.
 * @param {Object|null} viewer - From resolveIsoViewer
 * @param {Object} iso - The ISO row
 * @param {Object} version - The version row
 * @returns {boolean} True when the version is visible to the viewer
 */
const canSeeIsoVersion = (viewer, iso, version) => withinReach(reachOf(viewer, iso), version);

export { resolveIsoViewer, isoWhereFor, canSeeIso, canSeeIsoVersion };
