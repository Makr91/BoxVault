// externalOrgs.js — the ONE home for the org-mirror rules.
//
// Both write paths that mirror an auth-server org into BoxVault — the
// login-time organizations-claim sync (auth/external-user-handler.js) and the
// SCIM /Groups receiver (controllers/scim) — implement the same locked rules
// through this module:
//   - slug frozen at creation (stable URLs forever), display_name tracks the
//     mutable upstream name;
//   - org_code IS the admin-assigned customer ID when present (6-hex only,
//     drift reconciled on later syncs), else the next sequential local code.
import { log } from './Logger.js';
import { generateOrgCode, isHttpUrl } from './identity.js';

const ORG_CODE_PATTERN = /^[0-9A-F]{6}$/;

/**
 * Turn a (mutable, possibly non-URL-safe) upstream org name into a slug that
 * matches BoxVault's org-name rules ([A-Za-z0-9.-]) since the name is used as
 * the URL path segment for the org.
 * @param {string} name
 * @param {string} externalOrgId - Fallback seed if the name slugs to empty
 * @returns {string}
 */
const slugifyOrgName = (name, externalOrgId) => {
  let slug = (name || '').trim().replace(/[^A-Za-z0-9.-]+/g, '-');
  // Trim leading/trailing hyphens without regex: `-+$`-style patterns backtrack
  // polynomially on adversarial upstream names.
  let start = 0;
  let end = slug.length;
  while (start < end && slug[start] === '-') {
    start += 1;
  }
  while (end > start && slug[end - 1] === '-') {
    end -= 1;
  }
  slug = slug.slice(start, end);
  return slug || `org-${externalOrgId.slice(0, 8)}`;
};

/**
 * Find a unique, URL-safe org name. BoxVault org names are globally unique
 * (they are the URL slug), but upstream names are neither unique nor stable,
 * so on a collision we disambiguate with a fragment of the immutable org UUID.
 * @param {Object} Organization - Sequelize model
 * @param {string} desired - Upstream org name
 * @param {string} externalOrgId - Immutable org UUID
 * @param {Object|null} transaction
 * @returns {Promise<string>}
 */
const findFreeOrgName = (Organization, desired, externalOrgId, transaction) => {
  const base = slugifyOrgName(desired, externalOrgId);
  const opts = transaction ? { transaction } : {};
  const candidates = [
    base,
    `${base}-${externalOrgId.slice(0, 6)}`,
    `${base}-${externalOrgId.slice(0, 12)}`,
  ];
  // Sequential uniqueness probing is intentional: each candidate is only
  // tried when the previous one clashed.
  const probe = async index => {
    if (index >= candidates.length) {
      return `${base}-${externalOrgId}`;
    }
    const clash = await Organization.findOne({ where: { name: candidates[index] }, ...opts });
    if (!clash) {
      return candidates[index];
    }
    return probe(index + 1);
  };
  return probe(0);
};

/**
 * Normalize and validate an admin-assigned customer ID (6-hex, nullable).
 * Absent or malformed -> null (malformed is logged): a bad customer ID is an
 * upstream data problem and never blocks the sync that carries it.
 * @param {string|null} customerId - Raw customer ID from the upstream source
 * @param {string} orgUuid - For log context
 * @returns {string|null}
 */
const normalizeCustomerId = (customerId, orgUuid) => {
  if (!customerId) {
    return null;
  }
  const normalized = String(customerId).trim().toUpperCase();
  if (!ORG_CODE_PATTERN.test(normalized)) {
    log.error.error('External org carries a malformed customer ID (must be 6 hex characters)', {
      externalOrgId: orgUuid,
      customerId,
    });
    return null;
  }
  return normalized;
};

/**
 * Whether the customer ID can become this org's org_code: false (and logged)
 * when a DIFFERENT org already holds it. A collision is an upstream
 * misassignment to surface in the logs, never a reason to fail the sync.
 * @param {Object} Organization - Sequelize model
 * @param {string} customerId - Normalized 6-hex customer ID
 * @param {number|null} selfOrgId - Org id allowed to already hold the code
 * @param {Object} opts - Query options ({ transaction } or {})
 * @returns {Promise<boolean>}
 */
const customerIdIsFree = async (Organization, customerId, selfOrgId, opts) => {
  const holder = await Organization.findOne({ where: { org_code: customerId }, ...opts });
  if (!holder || holder.id === selfOrgId) {
    return true;
  }
  log.error.error('Customer ID collision: org_code already held by a different organization', {
    customerId,
    holderOrgId: holder.id,
    holderOrgName: holder.name,
  });
  return false;
};

/**
 * Upsert the BoxVault org row that mirrors one auth-server org, keyed on
 * (external_issuer, external_org_id). Slug is frozen at creation; display_name
 * refreshes to the mutable upstream name; org_code is the customer ID when
 * present (reconciled if it drifted), else a sequential local code.
 * @param {Object} db - Database models
 * @param {string} issuer - OIDC issuer
 * @param {Object} source - { uuid, name, customerId, logo, description }
 * @param {Object|null} transaction
 * @returns {Promise<Object>} Organization instance
 */
const upsertExternalOrg = async (db, issuer, source, transaction) => {
  const { organization: Organization } = db;
  const opts = transaction ? { transaction } : {};
  const customerId = normalizeCustomerId(source.customerId, source.uuid);
  const logo = isHttpUrl(source.logo) ? source.logo : null;
  const description =
    typeof source.description === 'string' && source.description.trim()
      ? source.description.trim()
      : null;

  const org = await Organization.findOne({
    where: { external_issuer: issuer, external_org_id: source.uuid },
    ...opts,
  });

  if (!org) {
    const useCustomerId =
      !!customerId && (await customerIdIsFree(Organization, customerId, null, opts));
    const name = await findFreeOrgName(Organization, source.name, source.uuid, transaction);
    return Organization.create(
      {
        name,
        display_name: source.name || name,
        logo,
        ...(description ? { description } : {}),
        external_issuer: issuer,
        external_org_id: source.uuid,
        org_code: useCustomerId ? customerId : await generateOrgCode(db, transaction),
      },
      opts
    );
  }

  // Existing mirror row — never re-slugify; only refresh the display name and
  // reconcile a drifted org_code to the upstream customer ID (one-time heal).
  const patch = {};
  if (source.name && org.display_name !== source.name) {
    patch.display_name = source.name;
  }
  if (logo && org.logo !== logo) {
    patch.logo = logo;
  }
  if (description && org.description !== description) {
    patch.description = description;
  }
  if (
    customerId &&
    org.org_code !== customerId &&
    (await customerIdIsFree(Organization, customerId, org.id, opts))
  ) {
    patch.org_code = customerId;
  }
  if (Object.keys(patch).length) {
    await org.update(patch, opts);
  }
  return org;
};

export { upsertExternalOrg };
