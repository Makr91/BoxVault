// groups.js — SCIM /Groups receiver. BoxVault ASSIGNS resource ids (the stored
// scim_group row's numeric id serialized as a string); the auth server's
// identity travels ONLY in externalId (`<org-uuid>:<role>`), scoped per
// issuer. displayName is cosmetic and never a uniqueness key.
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { upsertExternalOrg } from '../../utils/externalOrgs.js';
import {
  SCIM_GROUP_EXTENSION,
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
} from './helpers.js';

const { scimGroup: ScimGroup, organization: Organization } = db;

/**
 * Render the stored group back as a SCIM Group resource (RFC 7643 §3/§4.2):
 * schemas, service-provider-assigned id, the client's externalId, and meta
 * with resourceType/created/lastModified/location. displayName is REQUIRED by
 * the Group schema, so the externalId stands in if no name was pushed. Member
 * values are the auth-server user UUIDs (the contract's cross-domain refs),
 * not BoxVault SCIM ids — ghost members have no local resource by design.
 * @param {Object} req - Express request (for the resource location)
 * @param {Object} row - scim_group row
 * @returns {Object}
 */
const toScimGroup = (req, row) => {
  const externalId = `${row.org_uuid}:${row.role}`;
  return {
    schemas: [SCIM_GROUP_SCHEMA, SCIM_GROUP_EXTENSION],
    id: String(row.id),
    externalId,
    displayName: row.org_name || externalId,
    members: (Array.isArray(row.members) ? row.members : []).map(value => ({ value })),
    [SCIM_GROUP_EXTENSION]: {
      orgUuid: row.org_uuid,
      role: row.role,
      customerId: row.customer_id,
      personal: row.personal,
    },
    meta: scimMeta(
      'Group',
      row.created_at,
      row.updated_at,
      resourceLocation(req, '/Groups', row.id)
    ),
  };
};

/**
 * Extract the desired group state from a SCIM Group body.
 * @param {Object} body - SCIM Group resource
 * @returns {Object} { extension, memberUuids, displayName, customerId, personal }
 */
const parseGroupState = body => {
  const extension =
    body[SCIM_GROUP_EXTENSION] && typeof body[SCIM_GROUP_EXTENSION] === 'object'
      ? body[SCIM_GROUP_EXTENSION]
      : {};
  return {
    extension,
    memberUuids: (Array.isArray(body.members) ? body.members : [])
      .map(member => member?.value)
      .filter(Boolean),
    displayName: typeof body.displayName === 'string' && body.displayName ? body.displayName : null,
    customerId: extension.customerId || null,
    personal: extension.personal === true,
  };
};

/**
 * Check the extension identity fields against the group identity carried by
 * externalId; they may be omitted but must not contradict it.
 * @param {Object} extension - The urn:startcloud Group extension payload
 * @param {{orgUuid: string, role: string}} parsed - Identity from externalId
 * @returns {string|null} Error detail, or null when consistent
 */
const extensionIdentityMismatch = (extension, parsed) => {
  if (extension.orgUuid && extension.orgUuid !== parsed.orgUuid) {
    return 'Extension orgUuid does not match the group externalId';
  }
  if (extension.role && String(extension.role).toLowerCase() !== parsed.role) {
    return 'Extension role does not match the group externalId';
  }
  return null;
};

/**
 * The stored group's identity (org UUID + role) is immutable; a PUT body may
 * omit externalId/extension identity fields but must not contradict them.
 * @param {Object} body - SCIM Group resource
 * @param {Object} extension - The urn:startcloud Group extension payload
 * @param {Object} row - Stored scim_group row
 * @returns {string|null} Error detail, or null when consistent
 */
const putIdentityMismatch = (body, extension, row) => {
  if (body.externalId && body.externalId !== `${row.org_uuid}:${row.role}`) {
    return 'externalId does not match the stored resource';
  }
  return extensionIdentityMismatch(extension, { orgUuid: row.org_uuid, role: row.role });
};

/**
 * Map upsert failures onto SCIM error responses. Customer-ID problems are
 * contract violations of the request, not server faults: malformed -> 400
 * invalidValue, collision with a different org -> 409 uniqueness; anything
 * else is a 500.
 * @param {Error} err - The thrown error
 * @param {string} fallbackDetail - Detail for the 500 case
 * @returns {{status: number, detail: string, scimType: string|null}}
 */
const upsertFailure = (err, fallbackDetail) => {
  if (err.message.startsWith('Invalid customer ID')) {
    return { status: 400, detail: err.message, scimType: 'invalidValue' };
  }
  if (err.message.startsWith('Customer ID')) {
    return { status: 409, detail: err.message, scimType: 'uniqueness' };
  }
  return { status: 500, detail: fallbackDetail, scimType: null };
};

/**
 * POST /scim/v2/Groups — create the SCIM resource for one role group. Identity
 * arrives ONLY in externalId (`<org-uuid>:<owner|admin|member>`); BoxVault
 * assigns the resource id and returns 201 with the full resource (including id
 * and meta.location, also sent as the Location header per RFC 7644 §3.3). A
 * resource already holding this externalId for the issuer is a 409 with
 * scimType "uniqueness". Persists the raw group, upserts the mirrored BoxVault
 * org (org_code = customerId when present), then recomputes the org's
 * memberships across ALL of its stored role groups with
 * highest-privilege-wins; member UUIDs unknown to BoxVault are ignored.
 */
const createGroup = async (req, res) => {
  const { body } = req;

  if (!body || typeof body !== 'object') {
    return scimError(res, 400, 'Request body must be a SCIM Group resource', 'invalidSyntax');
  }
  const parsed = parseGroupExternalId(body.externalId);
  if (!parsed) {
    return scimError(
      res,
      400,
      'Group externalId must be <org-uuid>:<owner|admin|member>',
      'invalidValue'
    );
  }
  const state = parseGroupState(body);
  const mismatch = extensionIdentityMismatch(state.extension, parsed);
  if (mismatch) {
    return scimError(res, 400, mismatch, 'invalidValue');
  }

  const transaction = await db.sequelize.transaction();
  try {
    const existing = await ScimGroup.findOne({
      where: { issuer: req.scimIssuer, org_uuid: parsed.orgUuid, role: parsed.role },
      transaction,
    });
    if (existing) {
      await transaction.rollback();
      return scimError(
        res,
        409,
        `A SCIM Group with externalId ${body.externalId} already exists`,
        'uniqueness'
      );
    }

    const row = await ScimGroup.create(
      {
        issuer: req.scimIssuer,
        org_uuid: parsed.orgUuid,
        role: parsed.role,
        members: state.memberUuids,
        org_name: state.displayName,
        customer_id: state.customerId,
        personal: state.personal,
      },
      { transaction }
    );

    const org = await upsertExternalOrg(
      db,
      req.scimIssuer,
      { uuid: parsed.orgUuid, name: state.displayName, customerId: state.customerId },
      transaction
    );
    await recomputeOrgMemberships(db, org, req.scimIssuer, parsed.orgUuid, transaction);

    await transaction.commit();

    log.auth.info('SCIM: group created', {
      groupId: row.id,
      orgUuid: parsed.orgUuid,
      role: parsed.role,
      members: state.memberUuids.length,
    });
    res.location(resourceLocation(req, '/Groups', row.id));
    return scimResponse(res, 201, toScimGroup(req, row));
  } catch (err) {
    await transaction.rollback();
    log.error.error('SCIM: group POST failed', { externalId: body.externalId, error: err.message });
    const failure = upsertFailure(err, 'Failed to create SCIM group');
    return scimError(res, failure.status, failure.detail, failure.scimType);
  }
};

/**
 * GET /scim/v2/Groups?filter=externalId eq "<org-uuid>:<role>" — the only
 * supported query: one exact-match lookup by externalId (the auth server's
 * 409-recovery path), returning a ListResponse with 0 or 1 result. Any other
 * filter is a 400 with scimType "invalidFilter"; no pagination exists.
 */
const findGroups = async (req, res) => {
  const externalId = parseExternalIdFilter(req.query.filter);
  if (externalId === null) {
    return scimError(
      res,
      400,
      'Only the filter externalId eq "<value>" is supported',
      'invalidFilter'
    );
  }

  try {
    const parsed = parseGroupExternalId(externalId);
    const row = parsed
      ? await ScimGroup.findOne({
          where: { issuer: req.scimIssuer, org_uuid: parsed.orgUuid, role: parsed.role },
        })
      : null;
    return scimListResponse(res, row ? [toScimGroup(req, row)] : []);
  } catch (err) {
    log.error.error('SCIM: group GET failed', { error: err.message });
    return scimError(res, 500, 'Failed to query SCIM groups');
  }
};

/**
 * PUT /scim/v2/Groups/:id — full-desired-state update of one EXISTING role
 * group, addressed by the BoxVault-assigned id; 200 with the entire resource
 * on success (RFC 7644 §3.5.1). Identity (org UUID + role) is immutable, only
 * members/displayName/extension data change. Unknown ids are a 404 (the auth
 * server recovers via POST/GET); PUT never creates. Refreshes the mirrored
 * org, then recomputes its memberships across ALL stored role groups with
 * highest-privilege-wins; member UUIDs unknown to BoxVault are ignored.
 */
const putGroup = async (req, res) => {
  const groupId = parseResourceId(req.params.id);
  const { body } = req;

  if (!body || typeof body !== 'object') {
    return scimError(res, 400, 'Request body must be a SCIM Group resource', 'invalidSyntax');
  }
  if (body.id && body.id !== req.params.id) {
    return scimError(res, 400, 'Resource id does not match the request URL', 'mutability');
  }
  const state = parseGroupState(body);

  const transaction = await db.sequelize.transaction();
  try {
    const row =
      groupId === null
        ? null
        : await ScimGroup.findOne({ where: { id: groupId, issuer: req.scimIssuer }, transaction });
    if (!row) {
      await transaction.rollback();
      return scimError(res, 404, 'Group not found');
    }

    const identityError = putIdentityMismatch(body, state.extension, row);
    if (identityError) {
      await transaction.rollback();
      return scimError(res, 400, identityError, 'mutability');
    }

    await row.update(
      {
        members: state.memberUuids,
        org_name: state.displayName,
        customer_id: state.customerId,
        personal: state.personal,
      },
      { transaction }
    );

    const org = await upsertExternalOrg(
      db,
      req.scimIssuer,
      { uuid: row.org_uuid, name: state.displayName, customerId: state.customerId },
      transaction
    );
    await recomputeOrgMemberships(db, org, req.scimIssuer, row.org_uuid, transaction);

    await transaction.commit();

    log.auth.info('SCIM: group updated', {
      groupId: row.id,
      orgUuid: row.org_uuid,
      role: row.role,
      members: state.memberUuids.length,
    });
    return scimResponse(res, 200, toScimGroup(req, row));
  } catch (err) {
    await transaction.rollback();
    log.error.error('SCIM: group PUT failed', { scimId: req.params.id, error: err.message });
    const failure = upsertFailure(err, 'Failed to apply SCIM group state');
    return scimError(res, failure.status, failure.detail, failure.scimType);
  }
};

/**
 * DELETE /scim/v2/Groups/:id — drop one stored role group, addressed by the
 * BoxVault-assigned id; 204 with no body on success (RFC 7644 §3.6). Unknown
 * ids are a plain 404 SCIM error (the auth server treats that as
 * already-absent success). While other role groups of the org remain,
 * memberships are recomputed from what is left; when the LAST role group of an
 * org_uuid is deleted, the mirrored org itself is deleted (existing
 * org-deletion semantics: row + storage directory).
 */
const deleteGroup = async (req, res) => {
  const groupId = parseResourceId(req.params.id);

  const transaction = await db.sequelize.transaction();
  try {
    const row =
      groupId === null
        ? null
        : await ScimGroup.findOne({ where: { id: groupId, issuer: req.scimIssuer }, transaction });
    if (!row) {
      await transaction.rollback();
      return scimError(res, 404, 'Group not found');
    }

    const { org_uuid: orgUuid, role } = row;
    await row.destroy({ transaction });

    const remaining = await ScimGroup.count({
      where: { issuer: req.scimIssuer, org_uuid: orgUuid },
      transaction,
    });
    const org = await Organization.findOne({
      where: { external_issuer: req.scimIssuer, external_org_id: orgUuid },
      transaction,
    });

    let postCommitCleanup = null;
    if (org) {
      if (remaining === 0) {
        postCommitCleanup = await destroyMirrorOrg(org, transaction);
      } else {
        await recomputeOrgMemberships(db, org, req.scimIssuer, orgUuid, transaction);
      }
    }

    await transaction.commit();
    if (postCommitCleanup) {
      postCommitCleanup();
    }

    log.auth.info('SCIM: group deleted', {
      groupId,
      orgUuid,
      role,
      orgDeleted: !!org && remaining === 0,
    });
    return res.status(204).send();
  } catch (err) {
    await transaction.rollback();
    log.error.error('SCIM: group DELETE failed', { scimId: req.params.id, error: err.message });
    return scimError(res, 500, 'Failed to delete SCIM group');
  }
};

export { createGroup, findGroups, putGroup, deleteGroup };
