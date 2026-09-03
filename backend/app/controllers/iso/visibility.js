import db from '../../models/index.js';
import { resolveJwtUser } from '../../utils/jwtUser.js';
import {
  extractBearerToken,
  findServiceAccountByRawToken,
} from '../../utils/serviceAccountAuth.js';

const { UserOrg, Sequelize } = db;
const { Op } = Sequelize;

const PUBLIC_ISO = { isPublic: true, published: true };

/**
 * Resolve who is reading ISOs, the same optional-auth rule the box read routes
 * apply: a raw service-account key sees its own organization; a user already
 * authenticated by an earlier middleware, or resolved from the request's
 * session JWT or identity-provider token, sees every organization they belong
 * to; anonymous callers resolve to null and see only public, published ISOs.
 * @param {import('express').Request} req - The request carrying the credentials
 * @returns {Promise<{userId: number, orgIds: number[]}|null>} The viewer and the
 *   ids of every organization the viewer belongs to, or null
 */
const resolveIsoViewer = async req => {
  const rawToken = extractBearerToken(req) || req.headers['x-access-token'];
  const serviceAccount = await findServiceAccountByRawToken(rawToken);
  if (serviceAccount) {
    return { userId: serviceAccount.userId, orgIds: [serviceAccount.organization_id] };
  }
  if (req.userId) {
    const memberships = await UserOrg.getUserOrganizations(req.userId);
    return {
      userId: req.userId,
      orgIds: memberships.map(membership => membership.organization_id),
    };
  }
  return resolveJwtUser(req);
};

/**
 * The where clause for the ISOs a viewer may list.
 * @param {{userId: number, orgIds: number[]}|null} viewer - From resolveIsoViewer
 * @param {number} [organizationId] - Limit to one organization
 * @returns {Object} Sequelize where clause
 */
const isoWhereFor = (viewer, organizationId) => {
  if (organizationId !== undefined) {
    return viewer && viewer.orgIds.includes(organizationId)
      ? { organizationId }
      : { organizationId, ...PUBLIC_ISO };
  }
  if (!viewer) {
    return { ...PUBLIC_ISO };
  }
  return { [Op.or]: [PUBLIC_ISO, { organizationId: { [Op.in]: viewer.orgIds } }] };
};

/**
 * Whether a viewer may read one ISO: public and published, or a member of its
 * organization.
 * @param {{userId: number, orgIds: number[]}|null} viewer - From resolveIsoViewer
 * @param {Object} iso - The ISO row
 * @returns {boolean} True when the ISO is visible to the viewer
 */
const canSeeIso = (viewer, iso) =>
  Boolean(iso.isPublic && iso.published) ||
  Boolean(viewer && viewer.orgIds.includes(iso.organizationId));

export { resolveIsoViewer, isoWhereFor, canSeeIso };
