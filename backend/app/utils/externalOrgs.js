import { log } from './Logger.js';
import { generateOrgCode, isHttpUrl } from './identity.js';
import { isReservedSegment } from './reservedSegments.js';

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
 * A reserved path segment counts as a collision; the name an organization
 * already holds counts as free for that organization.
 * @param {Object} Organization - Sequelize model
 * @param {string} desired - Upstream org name
 * @param {string} externalOrgId - Immutable org UUID
 * @param {Object|null} transaction
 * @param {number|null} [selfId] - Id of the organization being named, whose own name is no clash
 * @returns {Promise<string>}
 */
const findFreeOrgName = (Organization, desired, externalOrgId, transaction, selfId = null) => {
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
    if (isReservedSegment(candidates[index])) {
      return probe(index + 1);
    }
    const clash = await Organization.findOne({ where: { name: candidates[index] }, ...opts });
    if (!clash || clash.id === selfId) {
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
 * The rename an upstream name asks of an existing mirror: the name a new
 * mirror would be given today, its own current name counting as free. None
 * when the upstream carries no name or the name is unchanged; none as well,
 * logged and retried at the next sync, while a directory holding entries
 * already stands under the new name.
 * @param {Object} Organization - Sequelize model
 * @param {Object} org - The mirrored organization row
 * @param {Object} source - { uuid, name }
 * @param {Object|null} transaction
 * @returns {Promise<{id: number, from: string, to: string}|null>} The rename, or null
 */
const renameOf = async (Organization, org, source, transaction) => {
  if (!source.name) {
    return null;
  }
  const to = await findFreeOrgName(Organization, source.name, source.uuid, transaction, org.id);
  if (to === org.name) {
    return null;
  }
  const { getSecureBoxPath, isOccupiedTarget } = await import('./paths.js');
  if (isOccupiedTarget(getSecureBoxPath(org.name), getSecureBoxPath(to))) {
    log.error.error(
      'Mirrored organization rename skipped: a directory holding entries stands under the new name',
      { organization: org.name, name: to, externalOrgId: source.uuid }
    );
    return null;
  }
  return { id: org.id, from: org.name, to };
};

/**
 * Upsert the BoxVault org row that mirrors one auth-server org, keyed on
 * external_org_id alone: one issuer answering under several hostnames is
 * still one issuer, so the mirror is reused whichever face the org arrives
 * through and external_issuer records the face that first minted it. The
 * name follows the upstream name by the rules a new mirror is named with,
 * display_name and personal refresh to the upstream values, org_code is the
 * customer ID when present (reconciled if it drifted), else a sequential
 * local code. A rename changes the row alone; its storage directory, stored
 * download paths and member notifications follow through applyOrgRename once
 * the caller's transaction commits.
 * @param {Object} db - Database models
 * @param {string} issuer - OIDC issuer the org arrived through
 * @param {Object} source - { uuid, name, customerId, logo, description, personal }
 * @param {Object|null} transaction
 * @returns {Promise<{organization: Object, renamed: {id: number, from: string, to: string}|null}>} The organization and its rename, if any
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
    where: { external_org_id: source.uuid },
    ...opts,
  });

  if (!org) {
    const useCustomerId =
      !!customerId && (await customerIdIsFree(Organization, customerId, null, opts));
    const name = await findFreeOrgName(Organization, source.name, source.uuid, transaction);
    const organization = await Organization.create(
      {
        name,
        display_name: source.name || name,
        logo,
        personal: source.personal,
        ...(description ? { description } : {}),
        external_issuer: issuer,
        external_org_id: source.uuid,
        org_code: useCustomerId ? customerId : await generateOrgCode(db, transaction),
      },
      opts
    );
    return { organization, renamed: null };
  }

  const patch = {};
  const renamed = await renameOf(Organization, org, source, transaction);
  if (renamed) {
    patch.name = renamed.to;
  }
  if (source.name && org.display_name !== source.name) {
    patch.display_name = source.name;
  }
  if (org.personal !== source.personal) {
    patch.personal = source.personal;
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
  return { organization: org, renamed };
};

/**
 * Carry a committed mirror rename to the disk the way a local rename does:
 * the storage directory moves to the new name, then every stored download
 * path follows it. A failure is logged and never thrown, the row being
 * committed already.
 * @param {Object} db - Database models
 * @param {{id: number, from: string, to: string}|null} renamed - From upsertExternalOrg
 * @returns {Promise<number[]>} The ids of the organization's members, none when nothing was renamed
 */
const applyOrgRename = async (db, renamed) => {
  if (!renamed) {
    return [];
  }
  try {
    const [{ getSecureBoxPath, renameDirectory }, { renameStoragePaths, storagePathFor }] =
      await Promise.all([import('./paths.js'), import('../controllers/download/helpers.js')]);
    renameDirectory(getSecureBoxPath(renamed.from), getSecureBoxPath(renamed.to));
    await renameStoragePaths(storagePathFor(renamed.from), storagePathFor(renamed.to));
  } catch (error) {
    log.error.error('Mirrored organization storage could not follow its rename', {
      from: renamed.from,
      to: renamed.to,
      error: error.message,
    });
  }
  const members = await db.UserOrg.findAll({
    where: { organization_id: renamed.id },
    attributes: ['user_id'],
  }).catch(error => {
    log.error.error('Members of a renamed mirrored organization could not be read', {
      organizationId: renamed.id,
      error: error.message,
    });
    return [];
  });
  return members.map(member => member.user_id);
};

export { findFreeOrgName, upsertExternalOrg, applyOrgRename };
