import db from '../../models/index.js';
import { isoWhereFor, resolveIsoViewer } from '../iso/visibility.js';

const { user: User, role: Role, UserOrg, Sequelize, sequelize } = db;
const { Op } = Sequelize;

const KINDS = ['organization', 'item', 'version', 'provider', 'architecture', 'artifact', 'user'];

const METADATA_KEYS = [
  'distro',
  'distro_version',
  'os_name',
  'vm_type',
  'username',
  'communicator',
  'providers',
  'built',
  'core_provisioner_version',
  'driver_version',
];

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;
const MIN_QUERY_LENGTH = 2;
const MIN_CHECKSUM_LENGTH = 6;

/**
 * Escape the LIKE wildcards of a search term. SQLite has no default escape
 * character, so the term is passed through there and the JavaScript matcher
 * drops the wildcard false positives.
 * @param {string} term - The trimmed search term
 * @returns {string} The term safe to embed in a LIKE pattern
 */
const escapeTerm = term =>
  sequelize.getDialect() === 'sqlite' ? term : term.replace(/[\\%_]/g, '\\$&');

/**
 * Parse the per-kind limit: default 5, at most 50.
 * @param {*} value - The raw limit query value
 * @returns {number} The limit to apply per kind
 */
const parseLimit = value => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
};

/**
 * Parse the optional comma list of kinds, keeping only known kinds in the
 * canonical order; no restriction means every kind.
 * @param {*} value - The raw kinds query value
 * @returns {string[]} The kinds to search
 */
const parseKinds = value => {
  if (typeof value !== 'string' || value.trim() === '') {
    return [...KINDS];
  }
  const wanted = new Set(value.split(',').map(kind => kind.trim()));
  const kinds = KINDS.filter(kind => wanted.has(kind));
  return kinds.length > 0 ? kinds : [...KINDS];
};

/**
 * One LIKE clause per column.
 * @param {string[]} columns - Attribute names of the main model
 * @param {string} pattern - The LIKE pattern
 * @returns {Object[]} Clauses to place under Op.or
 */
const likeClauses = (columns, pattern) =>
  columns.map(column => ({ [column]: { [Op.like]: pattern } }));

/**
 * A LIKE clause over the JSON metadata column read as text.
 * @param {string} alias - The main model alias in the query
 * @param {string} pattern - The LIKE pattern
 * @returns {Object} The clause to place under Op.or
 */
const metadataLike = (alias, pattern) =>
  Sequelize.where(Sequelize.cast(Sequelize.col(`${alias}.metadata`), 'CHAR'), {
    [Op.like]: pattern,
  });

/**
 * The where clause for the boxes a viewer may list, the rule /api/discover
 * applies.
 * @param {{userId: number, orgIds: number[]}|null} viewer - From resolveIsoViewer
 * @returns {Object} Sequelize where clause
 */
const boxWhereFor = viewer => {
  if (!viewer) {
    return { published: true, isPublic: true };
  }
  return {
    [Op.or]: [
      { published: true, isPublic: true },
      { published: true, organizationId: { [Op.in]: viewer.orgIds } },
      { organizationId: { [Op.in]: viewer.orgIds }, userId: viewer.userId },
    ],
  };
};

/**
 * The where clause for the organizations a viewer may list: the ones
 * /api/organizations/discover answers plus the viewer's own memberships.
 * @param {{userId: number, orgIds: number[]}|null} viewer - From resolveIsoViewer
 * @param {boolean} isAdmin - Whether the viewer is a global admin
 * @returns {Object} Sequelize where clause
 */
const organizationWhereFor = (viewer, isAdmin) => {
  if (isAdmin) {
    return {};
  }
  const discoverable = { access_mode: { [Op.in]: ['invite_only', 'request_to_join'] } };
  if (!viewer) {
    return discoverable;
  }
  return { [Op.or]: [discoverable, { id: { [Op.in]: viewer.orgIds } }] };
};

/**
 * Whether the viewer holds the global admin role.
 * @param {{userId: number, orgIds: number[]}|null} viewer - From resolveIsoViewer
 * @returns {Promise<boolean>} True for a global admin
 */
const isGlobalAdmin = async viewer => {
  if (!viewer) {
    return false;
  }
  const user = await User.findByPk(viewer.userId, {
    include: [{ model: Role, as: 'roles', through: { attributes: [] } }],
  });
  return Boolean(user?.roles?.some(role => role.name === 'admin'));
};

/**
 * The ids of the organizations the viewer administers or owns.
 * @param {{userId: number, orgIds: number[]}|null} viewer - From resolveIsoViewer
 * @returns {Promise<number[]>} Organization ids
 */
const managedOrgIds = async viewer => {
  if (!viewer) {
    return [];
  }
  const memberships = await UserOrg.findAll({
    where: { user_id: viewer.userId, role: { [Op.in]: ['admin', 'owner'] } },
    attributes: ['organization_id'],
  });
  return memberships.map(membership => membership.organization_id);
};

/**
 * The first of the given string fields containing the term, case-insensitively.
 * @param {Object} record - The row
 * @param {string[]} fields - Field names in match priority order
 * @param {string} term - The search term
 * @returns {string|null} The matched field name
 */
const matchedField = (record, fields, term) => {
  const needle = term.toLowerCase();
  const field = fields.find(
    candidate =>
      typeof record[candidate] === 'string' && record[candidate].toLowerCase().includes(needle)
  );
  return field || null;
};

/**
 * The first whitelisted metadata key whose value contains the term; the
 * password key is never consulted.
 * @param {*} metadata - The row's metadata column
 * @param {string} term - The search term
 * @returns {string|null} The matched key as metadata.<key>
 */
const matchedMetadataKey = (metadata, term) => {
  let facts = metadata;
  if (typeof facts === 'string') {
    try {
      facts = JSON.parse(facts);
    } catch {
      return null;
    }
  }
  if (!facts || typeof facts !== 'object') {
    return null;
  }
  const needle = term.toLowerCase();
  const key = METADATA_KEYS.find(candidate => {
    const value = facts[candidate];
    if (value === null || value === undefined) {
      return false;
    }
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.toLowerCase().includes(needle);
  });
  return key ? `metadata.${key}` : null;
};

/**
 * Whether a checksum starts with the term, when the term is long enough to
 * identify one.
 * @param {string|null} checksum - The stored checksum
 * @param {string} term - The search term
 * @returns {boolean} True on an exact or prefix match
 */
const checksumMatches = (checksum, term) =>
  term.length >= MIN_CHECKSUM_LENGTH &&
  typeof checksum === 'string' &&
  checksum.toLowerCase().startsWith(term.toLowerCase());

/**
 * Resolve everything the finders need for one request.
 * @param {import('express').Request} req - The request
 * @param {string} term - The trimmed search term
 * @param {string[]} kinds - The kinds to search
 * @returns {Promise<Object>} The search context
 */
const buildContext = async (req, term, kinds) => {
  const viewer = await resolveIsoViewer(req);
  const isAdmin = await isGlobalAdmin(viewer);
  const managed = kinds.includes('user') && !isAdmin ? await managedOrgIds(viewer) : [];
  const escaped = escapeTerm(term);
  return {
    term,
    contains: `%${escaped}%`,
    prefix: `${escaped}%`,
    viewer,
    isAdmin,
    managedOrgIds: managed,
    boxWhere: boxWhereFor(viewer),
    isoWhere: isoWhereFor(viewer),
    organizationWhere: organizationWhereFor(viewer, isAdmin),
  };
};

export {
  KINDS,
  MIN_QUERY_LENGTH,
  MIN_CHECKSUM_LENGTH,
  parseLimit,
  parseKinds,
  likeClauses,
  metadataLike,
  matchedField,
  matchedMetadataKey,
  checksumMatches,
  buildContext,
};
