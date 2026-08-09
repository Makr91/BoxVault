// users.js — SCIM /Users receiver. BoxVault ASSIGNS resource ids (the user's
// numeric id serialized as a string); the auth server's identity travels ONLY
// in externalId (their user UUID), scoped per issuer.
import { log } from '../../utils/Logger.js';
import { generateEmailHash, isHttpUrl } from '../../utils/identity.js';
import db from '../../models/index.js';
import {
  SCIM_USER_EXTENSION,
  SCIM_USER_SCHEMA,
  scimError,
  scimResponse,
  scimListResponse,
  scimMeta,
  resourceLocation,
  parseResourceId,
  parseExternalIdFilter,
} from './helpers.js';

const { user: User, credential: Credential, organization: Organization, UserOrg } = db;

/**
 * Extract the primary email from a SCIM User payload.
 * @param {Object} body - SCIM User resource
 * @returns {string|null}
 */
const extractEmail = body => {
  if (Array.isArray(body.emails) && body.emails.length) {
    const primary =
      body.emails.find(e => e?.primary && e?.value) || body.emails.find(e => e?.value);
    if (primary) {
      return primary.value;
    }
  }
  if (typeof body.userName === 'string' && body.userName.includes('@')) {
    return body.userName;
  }
  return null;
};

/**
 * Extract the avatar URL from the core `photos` attribute (RFC 7643 §4.1.2):
 * prefer the entry typed 'photo', else the first entry with a value. Only
 * http(s) URLs are stored; absent or invalid means no avatar (null).
 * @param {Object} body - SCIM User resource
 * @returns {string|null}
 */
const extractAvatarUrl = body => {
  if (!Array.isArray(body.photos)) {
    return null;
  }
  const entry =
    body.photos.find(p => p?.type === 'photo' && p?.value) || body.photos.find(p => p?.value);
  return entry && isHttpUrl(entry.value) ? entry.value : null;
};

/**
 * Extract the human display name (RFC 7643 §4.1.1): prefer the top-level
 * `displayName`, else the formatted form of the `name` complex attribute.
 * Absent or blank means no name (null) — username stays the render fallback.
 * @param {Object} body - SCIM User resource
 * @returns {string|null}
 */
const extractDisplayName = body => {
  if (typeof body.displayName === 'string' && body.displayName.trim()) {
    return body.displayName.trim();
  }
  const formatted = body.name?.formatted;
  if (typeof formatted === 'string' && formatted.trim()) {
    return formatted.trim();
  }
  return null;
};

/**
 * Extract a core string attribute (RFC 7643 §4.1.1), trimmed. Absent, blank,
 * or non-string means no value (null) — full desired state, so a push without
 * the attribute clears it.
 * @param {Object} body - SCIM User resource
 * @param {string} attribute - Attribute name
 * @returns {string|null}
 */
const extractStringAttribute = (body, attribute, maxLength) => {
  const value = body[attribute];
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    // The column would reject it and fail the whole push. Dropping one
    // over-long optional attribute is the same outcome as the provider not
    // sending it, and keeps the rest of the resource applying.
    log.auth.warn('SCIM: ignoring over-long attribute', {
      attribute,
      length: trimmed.length,
      maxLength,
    });
    return null;
  }
  return trimmed;
};

/**
 * Extract the core `entitlements` attribute (RFC 7643 §4.1.2): keep
 * value/type/display per entry (string `value` is required — entries without
 * one are dropped, other keys are dropped). Absent, non-array, or empty means
 * no entitlements (null) — the same full-desired-state semantics as photos.
 * @param {Object} body - SCIM User resource
 * @returns {Object[]|null}
 */
const extractEntitlements = body => {
  if (!Array.isArray(body.entitlements)) {
    return null;
  }
  const entries = body.entitlements
    .filter(e => e && typeof e.value === 'string' && e.value)
    .map(e => ({
      value: e.value,
      ...(typeof e.type !== 'undefined' ? { type: e.type } : {}),
      ...(typeof e.display !== 'undefined' ? { display: e.display } : {}),
    }));
  return entries.length ? entries : null;
};

/**
 * Normalize the pushed SCIM User resource into the desired BoxVault state.
 * @param {Object} body - SCIM User resource
 * @returns {Object|null} Desired state, or null when no email can be derived
 */
const parseScimUserState = body => {
  const extension =
    body[SCIM_USER_EXTENSION] && typeof body[SCIM_USER_EXTENSION] === 'object'
      ? body[SCIM_USER_EXTENSION]
      : {};
  const email = extractEmail(body);
  if (!email) {
    return null;
  }
  return {
    email,
    userName: typeof body.userName === 'string' && body.userName ? body.userName : email,
    name: extractDisplayName(body),
    preferredLanguage: extractStringAttribute(body, 'preferredLanguage', 35),
    locale: extractStringAttribute(body, 'locale', 35),
    timezone: extractStringAttribute(body, 'timezone', 64),
    suspended: body.active === false,
    emailVerified: typeof extension.emailVerified === 'boolean' ? extension.emailVerified : null,
    primaryOrgUuid:
      typeof extension.primaryOrgUuid === 'string' && extension.primaryOrgUuid
        ? extension.primaryOrgUuid
        : null,
    avatarUrl: extractAvatarUrl(body),
    entitlements: extractEntitlements(body),
  };
};

/**
 * Render the BoxVault user back as a SCIM User resource (RFC 7643 §3/§4.1):
 * schemas, service-provider-assigned id, the client's externalId, and meta
 * with resourceType/created/lastModified/location.
 * @param {Object} req - Express request (for the resource location)
 * @param {Object} user - BoxVault user instance
 * @param {string} externalId - Auth-server user UUID (credential subject)
 * @param {string|null} primaryOrgUuid - Extension value to round-trip
 * @returns {Object}
 */
const toScimUser = (req, user, externalId, primaryOrgUuid) => ({
  schemas: [SCIM_USER_SCHEMA, SCIM_USER_EXTENSION],
  id: String(user.id),
  externalId,
  userName: user.username,
  active: !user.suspended,
  emails: [{ value: user.email, primary: true }],
  ...(user.name ? { displayName: user.name } : {}),
  ...(user.preferredLanguage ? { preferredLanguage: user.preferredLanguage } : {}),
  ...(user.locale ? { locale: user.locale } : {}),
  ...(user.timezone ? { timezone: user.timezone } : {}),
  // photos/entitlements are rendered only when stored (RFC 7643: no value = attribute absent)
  ...(user.avatar_url ? { photos: [{ value: user.avatar_url, type: 'photo' }] } : {}),
  ...(user.entitlements ? { entitlements: user.entitlements } : {}),
  [SCIM_USER_EXTENSION]: {
    emailVerified: user.verified,
    primaryOrgUuid: primaryOrgUuid || null,
  },
  meta: scimMeta('User', user.createdAt, user.updatedAt, resourceLocation(req, '/Users', user.id)),
});

/**
 * Derive the extension primaryOrgUuid from the stored primary-organization
 * pointer: the mirrored org's UUID when the user's primary org belongs to the
 * requesting issuer, else null.
 * @param {Object} user - BoxVault user instance
 * @param {string} issuer - Verified issuer from scimAuth
 * @returns {Promise<string|null>}
 */
const findPrimaryOrgUuid = async (user, issuer) => {
  if (!user.primary_organization_id) {
    return null;
  }
  const org = await Organization.findByPk(user.primary_organization_id);
  return org && org.external_issuer === issuer ? org.external_org_id : null;
};

/**
 * Resolve the issuer's credential row for a BoxVault-assigned resource id.
 * The credential carries the externalId (subject) and proves the addressed
 * user belongs to the requesting issuer.
 * @param {string} issuer - Verified issuer from scimAuth
 * @param {number} userId - BoxVault user id parsed from the :id parameter
 * @returns {Promise<Object|null>}
 */
const findCredentialByResourceId = (issuer, userId) =>
  Credential.findOne({ where: { provider: issuer, user_id: userId } });

/**
 * Provision the BoxVault user for a first-contact POST: email-link an existing
 * account (requires provider-verified mailbox ownership, #10) or create a new
 * one, then attach the issuer-scoped credential carrying the externalId.
 * @param {string} externalId - Auth-server user UUID
 * @param {string} issuer - Verified issuer from scimAuth
 * @param {Object} state - Parsed desired state
 * @returns {Promise<{user: Object|null, unverifiedEmailConflict: boolean}>}
 */
const provisionScimUser = async (externalId, issuer, state) => {
  let user = await User.findOne({ where: { email: state.email } });
  if (user) {
    // #10: linking an external identity to an EXISTING account by email
    // match requires provider-verified mailbox ownership.
    if (state.emailVerified !== true) {
      log.auth.warn('SCIM: refusing to link unverified email to existing account', {
        email: state.email,
        userId: user.id,
      });
      return { user: null, unverifiedEmailConflict: true };
    }
    await user.update({ authProvider: 'oidc', externalId, linkedAt: new Date() });
  } else {
    user = await User.create({
      username: state.userName,
      name: state.name,
      preferredLanguage: state.preferredLanguage,
      locale: state.locale,
      timezone: state.timezone,
      email: state.email,
      password: 'external',
      emailHash: generateEmailHash(state.email),
      verified: state.emailVerified === true,
      suspended: state.suspended,
      authProvider: 'oidc',
      externalId,
      linkedAt: new Date(),
      avatar_url: state.avatarUrl,
      entitlements: state.entitlements,
    });
  }
  await Credential.create({
    user_id: user.id,
    provider: issuer,
    subject: externalId,
    external_email: state.email,
    linked_at: new Date(),
  });

  return { user, unverifiedEmailConflict: false };
};

/**
 * Diff the pushed state against the stored user — full desired state, so every
 * pushed field is applied.
 * @param {Object} user - BoxVault user instance
 * @param {Object} state - Parsed desired state
 * @returns {Object} Sequelize update patch
 */
const buildUserPatch = (user, state) => {
  const patch = {};
  if (user.username !== state.userName) {
    patch.username = state.userName;
  }
  if (user.name !== state.name) {
    patch.name = state.name;
  }
  for (const attribute of ['preferredLanguage', 'locale', 'timezone']) {
    if (user[attribute] !== state[attribute]) {
      patch[attribute] = state[attribute];
    }
  }
  if (user.email !== state.email) {
    patch.email = state.email;
    patch.emailHash = generateEmailHash(state.email);
  }
  if (user.suspended !== state.suspended) {
    patch.suspended = state.suspended;
  }
  if (state.emailVerified !== null && user.verified !== state.emailVerified) {
    patch.verified = state.emailVerified;
  }
  if (user.avatar_url !== state.avatarUrl) {
    patch.avatar_url = state.avatarUrl;
  }
  if (JSON.stringify(user.entitlements || null) !== JSON.stringify(state.entitlements)) {
    patch.entitlements = state.entitlements;
  }
  return patch;
};

/**
 * Apply the pushed primaryOrgUuid pointer when that org is already mirrored
 * locally; extends the patch with the denormalized pointer as needed.
 * @param {Object} user - BoxVault user instance
 * @param {string} issuer - Verified issuer from scimAuth
 * @param {string} primaryOrgUuid - Auth-server org UUID
 * @param {Object} patch - Update patch to extend
 * @returns {Promise<void>}
 */
const applyPrimaryOrgPointer = async (user, issuer, primaryOrgUuid, patch) => {
  const primaryOrg = await Organization.findOne({
    where: { external_issuer: issuer, external_org_id: primaryOrgUuid },
  });
  if (!primaryOrg) {
    // Org not mirrored yet: skip the pointer — the daily reconcile re-push
    // heals it once the org's groups have arrived.
    return;
  }
  if (user.primary_organization_id !== primaryOrg.id) {
    // The pushed primary is authoritative only among this issuer's orgs: the
    // overall pointer may be set only when unset or already on one of this
    // issuer's orgs — never stolen from a locally-created org or another
    // issuer's org.
    const currentPrimary = user.primary_organization_id
      ? await Organization.findByPk(user.primary_organization_id)
      : null;
    if (!currentPrimary || currentPrimary.external_issuer === issuer) {
      patch.primary_organization_id = primaryOrg.id;
    }
  }
  const membership = await UserOrg.findUserOrgRole(user.id, primaryOrg.id);
  if (membership && !membership.is_primary) {
    await UserOrg.setPrimaryOrganization(user.id, primaryOrg.id);
  }
};

/**
 * Apply the pushed full desired state to the stored user: field diff plus the
 * primaryOrgUuid pointer (when that org is already mirrored locally).
 * @param {Object} user - BoxVault user instance
 * @param {string} issuer - Verified issuer from scimAuth
 * @param {Object} state - Parsed desired state
 * @returns {Promise<void>}
 */
const applyUserState = async (user, issuer, state) => {
  const patch = buildUserPatch(user, state);
  if (state.primaryOrgUuid) {
    await applyPrimaryOrgPointer(user, issuer, state.primaryOrgUuid, patch);
  }
  if (Object.keys(patch).length) {
    await user.update(patch);
  }
};

/**
 * POST /scim/v2/Users — create the SCIM resource for one auth-server user.
 * Identity arrives ONLY in externalId (their user UUID); BoxVault assigns the
 * resource id and returns 201 with the full resource (including id and
 * meta.location, also sent as the Location header per RFC 7644 §3.3). A
 * resource already holding this externalId for the issuer is a 409 with
 * scimType "uniqueness". First contact either creates the BoxVault user or
 * email-links an existing account (which requires provider-verified mailbox
 * ownership).
 */
const createUser = async (req, res) => {
  const { body } = req;

  if (!body || typeof body !== 'object') {
    return scimError(res, 400, 'Request body must be a SCIM User resource', 'invalidSyntax');
  }
  const externalId =
    typeof body.externalId === 'string' && body.externalId ? body.externalId : null;
  if (!externalId) {
    return scimError(
      res,
      400,
      'SCIM User must carry externalId (the auth-server user UUID)',
      'invalidValue'
    );
  }
  const state = parseScimUserState(body);
  if (!state) {
    return scimError(
      res,
      400,
      'SCIM User must carry an email (emails[] or userName)',
      'invalidValue'
    );
  }

  try {
    const existing = await Credential.findByIssuerAndSubject(req.scimIssuer, externalId);
    if (existing) {
      const existingUser = await User.findByPk(existing.user_id);
      if (existingUser) {
        return scimError(
          res,
          409,
          `A SCIM User with externalId ${externalId} already exists`,
          'uniqueness'
        );
      }
      // Orphaned credential row — discard it and re-provision below.
      await existing.destroy();
    }

    const { user, unverifiedEmailConflict } = await provisionScimUser(
      externalId,
      req.scimIssuer,
      state
    );
    if (unverifiedEmailConflict) {
      return scimError(
        res,
        409,
        `A BoxVault account already exists for ${state.email} and the pushed email is not verified; refusing to link`,
        'uniqueness'
      );
    }

    await applyUserState(user, req.scimIssuer, state);

    log.auth.info('SCIM: user created', { externalId, userId: user.id });
    res.location(resourceLocation(req, '/Users', user.id));
    return scimResponse(res, 201, toScimUser(req, user, externalId, state.primaryOrgUuid));
  } catch (err) {
    log.error.error('SCIM: user POST failed', { externalId, error: err.message });
    return scimError(res, 500, 'Failed to create SCIM user');
  }
};

/**
 * GET /scim/v2/Users?filter=externalId eq "<uuid>" — the only supported query:
 * one exact-match lookup by externalId (the auth server's 409-recovery path),
 * returning a ListResponse with 0 or 1 result. Any other filter is a 400 with
 * scimType "invalidFilter"; no pagination exists.
 */
const findUsers = async (req, res) => {
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
    const credential = externalId
      ? await Credential.findByIssuerAndSubject(req.scimIssuer, externalId)
      : null;
    const user = credential ? await User.findByPk(credential.user_id) : null;
    if (!user) {
      return scimListResponse(res, []);
    }
    const primaryOrgUuid = await findPrimaryOrgUuid(user, req.scimIssuer);
    return scimListResponse(res, [toScimUser(req, user, credential.subject, primaryOrgUuid)]);
  } catch (err) {
    log.error.error('SCIM: user GET failed', { error: err.message });
    return scimError(res, 500, 'Failed to query SCIM users');
  }
};

/**
 * PUT /scim/v2/Users/:id — full-desired-state update of one EXISTING resource,
 * addressed by the BoxVault-assigned id; 200 with the entire resource on
 * success (RFC 7644 §3.5.1). Unknown ids are a 404 (the auth server recovers
 * via POST/GET); PUT never creates. Applies the pushed state: userName/email,
 * active (suspension), extension emailVerified and primaryOrgUuid (applied
 * only when that org is already mirrored locally).
 */
const putUser = async (req, res) => {
  const userId = parseResourceId(req.params.id);
  const { body } = req;

  if (!body || typeof body !== 'object') {
    return scimError(res, 400, 'Request body must be a SCIM User resource', 'invalidSyntax');
  }
  if (body.id && body.id !== req.params.id) {
    return scimError(res, 400, 'Resource id does not match the request URL', 'mutability');
  }
  const state = parseScimUserState(body);
  if (!state) {
    return scimError(
      res,
      400,
      'SCIM User must carry an email (emails[] or userName)',
      'invalidValue'
    );
  }

  try {
    const credential =
      userId === null ? null : await findCredentialByResourceId(req.scimIssuer, userId);
    const user = credential ? await User.findByPk(credential.user_id) : null;
    if (!user) {
      return scimError(res, 404, 'User not found');
    }
    if (body.externalId && body.externalId !== credential.subject) {
      // An account that logged in over OIDC before it was ever SCIM-pushed is
      // stored under the subject the login carried, which is not yet the user
      // UUID the provisioner sends. Both identify the same person at the same
      // issuer, so the pushed externalId is adopted as canonical rather than
      // rejected.
      //
      // The stored email is the proof, and deliberately the ONLY proof: the
      // extension's emailVerified is asserted by the very request asking to
      // rebind, so accepting it would let any push repoint any credential.
      const sameMailbox =
        typeof state.email === 'string' && user.email?.toLowerCase() === state.email.toLowerCase();
      if (!sameMailbox) {
        return scimError(res, 400, 'externalId does not match the stored resource', 'mutability');
      }

      const claimedElsewhere = await Credential.findOne({
        where: { provider: req.scimIssuer, subject: body.externalId },
      });
      if (claimedElsewhere) {
        return scimError(
          res,
          409,
          `externalId ${body.externalId} is already bound to another user at this issuer`,
          'uniqueness'
        );
      }

      log.auth.info('SCIM: adopting pushed externalId for an existing credential', {
        userId: user.id,
        issuer: req.scimIssuer,
        previousSubject: credential.subject,
        externalId: body.externalId,
      });
      await credential.update({ subject: body.externalId });
    }

    await applyUserState(user, req.scimIssuer, state);

    log.auth.info('SCIM: user updated', { scimId: req.params.id, userId: user.id });
    return scimResponse(res, 200, toScimUser(req, user, credential.subject, state.primaryOrgUuid));
  } catch (err) {
    log.error.error('SCIM: user PUT failed', { scimId: req.params.id, error: err.message });
    return scimError(res, 500, 'Failed to apply SCIM user state');
  }
};

/**
 * DELETE /scim/v2/Users/:id — remove the BoxVault user behind the
 * BoxVault-assigned id; 204 with no body on success (RFC 7644 §3.6). Unknown
 * ids are a plain 404 SCIM error (the auth server treats that as
 * already-absent success). The auth server is the source of truth for its
 * users, so no sole-owner guard applies here (unlike self-service account
 * deletion); memberships and credentials cascade with the row.
 */
const deleteScimUser = async (req, res) => {
  const userId = parseResourceId(req.params.id);

  try {
    const credential =
      userId === null ? null : await findCredentialByResourceId(req.scimIssuer, userId);
    if (!credential) {
      return scimError(res, 404, 'User not found');
    }

    const user = await User.findByPk(credential.user_id);
    if (!user) {
      await credential.destroy();
      return scimError(res, 404, 'User not found');
    }

    await user.destroy();
    log.auth.info('SCIM: user deleted', { scimId: req.params.id, userId: credential.user_id });
    return res.status(204).send();
  } catch (err) {
    log.error.error('SCIM: user DELETE failed', { scimId: req.params.id, error: err.message });
    return scimError(res, 500, 'Failed to delete SCIM user');
  }
};

export { createUser, findUsers, putUser, deleteScimUser };
