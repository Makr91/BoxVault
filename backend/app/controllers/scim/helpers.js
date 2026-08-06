// helpers.js — shared logic for the SCIM receiver controllers
import fs from 'fs';
import { log } from '../../utils/Logger.js';
import { getSecureBoxPath } from '../../utils/paths.js';
import { scimError } from '../../middleware/scimAuth.js';

const SCIM_USER_EXTENSION = 'urn:startcloud:scim:schemas:extension:1.0:User';
const SCIM_GROUP_EXTENSION = 'urn:startcloud:scim:schemas:extension:1.0:Group';
const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const SCIM_LIST_RESPONSE_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';

const GROUP_ROLES = ['owner', 'admin', 'member'];

// Auth-server org roles ARE BoxVault's per-org role enum; precedence
// resolves overlapping group membership (highest privilege wins).
const GROUP_ROLE_PRECEDENCE = { owner: 3, admin: 2, member: 1 };

/**
 * Parse a SCIM Group externalId of the form `<org-uuid>:<owner|admin|member>`
 * (the auth server's identity for one role group).
 * @param {string} externalId - The externalId value
 * @returns {{orgUuid: string, role: string}|null} Parsed parts or null
 */
const parseGroupExternalId = externalId => {
  if (typeof externalId !== 'string') {
    return null;
  }
  const separator = externalId.lastIndexOf(':');
  if (separator <= 0) {
    return null;
  }
  const orgUuid = externalId.slice(0, separator);
  const role = externalId.slice(separator + 1).toLowerCase();
  if (!orgUuid || !GROUP_ROLES.includes(role)) {
    return null;
  }
  return { orgUuid, role };
};

/**
 * Parse a BoxVault-assigned SCIM resource id (a positive decimal integer
 * serialized as a string).
 * @param {string} rawId - The :id route parameter
 * @returns {number|null} The numeric id, or null when it can never match
 */
const parseResourceId = rawId => (/^\d+$/.test(rawId) ? Number(rawId) : null);

/**
 * Parse the single supported SCIM filter clause: `externalId eq "<value>"`
 * (RFC 7644 §3.4.2.2, restricted by contract to exactly this shape). The
 * clause travels URL-encoded and Express has already decoded it here.
 * @param {*} filter - Raw filter query parameter
 * @returns {string|null} The quoted value, or null when unsupported
 */
const parseExternalIdFilter = filter => {
  if (typeof filter !== 'string') {
    return null;
  }
  const match = /^externalId eq "(?<value>[^"]*)"$/.exec(filter);
  return match ? match.groups.value : null;
};

/**
 * Send a SCIM resource or message body with the SCIM media type
 * (application/scim+json, RFC 7644 §3.1).
 * @param {Object} res - Express response
 * @param {number} status - HTTP status code
 * @param {Object} body - SCIM resource or message
 * @returns {Object} The response
 */
const scimResponse = (res, status, body) =>
  res.status(status).type('application/scim+json').json(body);

/**
 * Send a SCIM ListResponse (RFC 7644 §3.4.2) carrying the matched resources:
 * totalResults is REQUIRED; Resources is REQUIRED when non-zero. The receiver
 * supports no pagination: every response is the complete result (0 or 1
 * resource by contract).
 * @param {Object} res - Express response
 * @param {Object[]} resources - Rendered SCIM resources
 * @returns {Object} The response
 */
const scimListResponse = (res, resources) =>
  scimResponse(res, 200, {
    schemas: [SCIM_LIST_RESPONSE_SCHEMA],
    totalResults: resources.length,
    Resources: resources,
  });

/**
 * Build the meta complex attribute (RFC 7643 §3.1): resourceType, created,
 * lastModified (SCIM DateTime), and the resource URI as location.
 * @param {string} resourceType - 'User' or 'Group'
 * @param {Date|string} created - Row creation timestamp
 * @param {Date|string} lastModified - Row update timestamp
 * @param {string} location - Absolute resource URI
 * @returns {Object}
 */
const scimMeta = (resourceType, created, lastModified, location) => ({
  resourceType,
  created: new Date(created).toISOString(),
  lastModified: new Date(lastModified).toISOString(),
  location,
});

/**
 * Absolute URI of one SCIM resource, derived from the request (works for both
 * the prod URL and dev test hosts; trust-proxy makes req.protocol accurate).
 * Returned as meta.location and, on 201, the Location header (RFC 7644 §3.3).
 * @param {Object} req - Express request (baseUrl is the /scim/v2 mount)
 * @param {string} collection - '/Users' or '/Groups'
 * @param {number|string} id - BoxVault-assigned resource id
 * @returns {string}
 */
const resourceLocation = (req, collection, id) =>
  `${req.protocol}://${req.get('host')}${req.baseUrl}${collection}/${id}`;

/**
 * Recompute a mirrored org's memberships from ALL stored role groups of its
 * org_uuid. Per user: highest role across groups wins (owner>admin>member).
 * Users absent from every group lose their membership. Member UUIDs that
 * match no known BoxVault user are ignored (ghost members, per contract).
 * @param {Object} db - Database models
 * @param {Object} org - Mirrored organization instance
 * @param {string} issuer - OIDC issuer
 * @param {string} orgUuid - Auth-server org UUID
 * @param {Object} transaction - Active transaction
 * @returns {Promise<void>}
 */
const recomputeOrgMemberships = async (db, org, issuer, orgUuid, transaction) => {
  const { scimGroup: ScimGroup, credential: Credential, user: User, UserOrg } = db;

  const groups = await ScimGroup.findByOrg(issuer, orgUuid, transaction);

  // uuid -> winning auth-server role
  const winningRoles = new Map();
  for (const group of groups) {
    const members = Array.isArray(group.members) ? group.members : [];
    for (const memberUuid of members) {
      if (!memberUuid) {
        continue;
      }
      const current = winningRoles.get(memberUuid);
      if (!current || GROUP_ROLE_PRECEDENCE[group.role] > GROUP_ROLE_PRECEDENCE[current]) {
        winningRoles.set(memberUuid, group.role);
      }
    }
  }

  // Resolve UUIDs to BoxVault users; unknown UUIDs are ghosts and ignored.
  // Credentials are issuer-scoped (#30); findByIssuerAndSubject also claims
  // pre-issuer rows stored under the flat 'oidc' value.
  const desired = new Map(); // user_id -> BoxVault org role
  for (const [memberUuid, groupRole] of winningRoles) {
    // eslint-disable-next-line no-await-in-loop -- memberships resolved sequentially in one txn
    const credential = await Credential.findByIssuerAndSubject(issuer, memberUuid, transaction);
    if (!credential) {
      continue;
    }
    desired.set(credential.user_id, groupRole);
  }

  const existing = await UserOrg.findAll({
    where: { organization_id: org.id },
    transaction,
  });
  const existingByUserId = new Map(existing.map(m => [m.user_id, m]));

  for (const [userId, role] of desired) {
    const membership = existingByUserId.get(userId);
    if (membership) {
      if (membership.role !== role) {
        // eslint-disable-next-line no-await-in-loop
        await membership.update({ role }, { transaction });
      }
    } else {
      // eslint-disable-next-line no-await-in-loop
      const user = await User.findByPk(userId, { transaction });
      // eslint-disable-next-line no-await-in-loop
      await UserOrg.create(
        {
          user_id: userId,
          organization_id: org.id,
          role,
          is_primary: !!user && user.primary_organization_id === org.id,
        },
        { transaction }
      );
    }
  }

  const staleUserIds = existing.filter(m => !desired.has(m.user_id)).map(m => m.user_id);
  if (staleUserIds.length) {
    await UserOrg.destroy({
      where: {
        organization_id: org.id,
        user_id: { [db.Sequelize.Op.in]: staleUserIds },
      },
      transaction,
    });
  }
};

/**
 * Delete a mirrored org following the existing org-deletion semantics
 * (organization/delete.js): destroy the row, then remove its storage
 * directory. The destroy runs inside the caller's transaction; the directory
 * removal must happen AFTER commit via the returned callback.
 * @param {Object} org - Organization instance
 * @param {Object} transaction - Active transaction
 * @returns {Promise<Function>} Post-commit cleanup callback
 */
const destroyMirrorOrg = async (org, transaction) => {
  const orgName = org.name;
  await org.destroy({ transaction });
  return () => {
    try {
      const dirPath = getSecureBoxPath(orgName);
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch (err) {
      log.error.error('SCIM: failed to remove deleted org storage directory', {
        organization: orgName,
        error: err.message,
      });
    }
  };
};

export {
  SCIM_USER_EXTENSION,
  SCIM_GROUP_EXTENSION,
  SCIM_USER_SCHEMA,
  SCIM_GROUP_SCHEMA,
  scimError,
  scimResponse,
  scimListResponse,
  scimMeta,
  resourceLocation,
  parseGroupExternalId,
  parseResourceId,
  parseExternalIdFilter,
  recomputeOrgMemberships,
  destroyMirrorOrg,
};
