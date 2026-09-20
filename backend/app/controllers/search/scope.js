import db from '../../models/index.js';
import { isoWhereFor, resolveIsoViewer } from '../iso/visibility.js';
import { downloadWhereFor } from '../download/visibility.js';
import { uploaderOrgIds } from '../../utils/orgMembership.js';

const { user: User, role: Role, Sequelize, sequelize } = db;
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
 * The words of a search term, split on whitespace.
 * @param {string} term - The trimmed search term
 * @returns {string[]} The words, at least one
 */
const wordsOf = term => term.split(/\s+/).filter(Boolean);

/**
 * The spellings one word is looked for under: the word itself and, when it
 * carries dots, the word with its dots dropped, so 14.5.1 also finds 1451.
 * @param {string} word - One word of the term
 * @returns {string[]} The spellings, lower-cased
 */
const spellingsOf = word => {
  const lower = word.toLowerCase();
  const compact = lower.replace(/\./g, '');
  return compact && compact !== lower ? [lower, compact] : [lower];
};

/**
 * The tokens of a search term: every word with its spellings and the LIKE
 * patterns of those spellings.
 * @param {string} term - The trimmed search term
 * @returns {Array<{spellings: string[], patterns: string[]}>} One token per word
 */
const tokensOf = term =>
  wordsOf(term).map(word => {
    const spellings = spellingsOf(word);
    return { spellings, patterns: spellings.map(spelling => `%${escapeTerm(spelling)}%`) };
  });

/**
 * The where clause of a token search: every token must match at least one
 * of the columns under one of its spellings; `extra` adds clauses per
 * pattern beyond the columns, the metadata column read as text for one.
 * @param {string[]} columns - Attribute names, `$include.column$` names included
 * @param {Array<{patterns: string[]}>} tokens - From tokensOf
 * @param {Function} [extra] - Pattern to extra clauses
 * @returns {Object} The where clause
 */
const tokenClauses = (columns, tokens, extra = () => []) => ({
  [Op.and]: tokens.map(({ patterns }) => ({
    [Op.or]: patterns.flatMap(pattern => [...likeClauses(columns, pattern), ...extra(pattern)]),
  })),
});

/**
 * The first field of a chain that answers the search, or null when a token
 * appears in none of them: every token must be found, under one of its
 * spellings, in at least one entry; the answer names the first entry the
 * first token is found in.
 * @param {Array<[string, *]>} entries - Field name and text, in match priority order
 * @param {Array<{spellings: string[]}>} tokens - From tokensOf
 * @returns {string|null} The matched field name
 */
const matchedChain = (entries, tokens) => {
  const texts = entries
    .filter(([, text]) => typeof text === 'string')
    .map(([field, text]) => [field, text.toLowerCase()]);
  const holder = token =>
    texts.find(([, text]) => token.spellings.some(spelling => text.includes(spelling)));
  if (!tokens.every(token => holder(token))) {
    return null;
  }
  return holder(tokens[0])[0];
};

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
 * @param {{userId: number, orgIds: number[], guestOrgIds: number[]}|null} viewer - From resolveIsoViewer
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
      { published: true, guestAccess: true, organizationId: { [Op.in]: viewer.guestOrgIds } },
      { organizationId: { [Op.in]: uploaderOrgIds(viewer) }, userId: viewer.userId },
    ],
  };
};

/**
 * The where clause for the organizations a viewer may list: the ones
 * /api/organizations/discover answers plus the viewer's own memberships,
 * guest seats included.
 * @param {{userId: number, orgIds: number[], guestOrgIds: number[]}|null} viewer - From resolveIsoViewer
 * @param {boolean} isAdmin - Whether the viewer is a global admin
 * @returns {Object} Sequelize where clause
 */
const organizationWhereFor = (viewer, isAdmin) => {
  if (isAdmin) {
    return {};
  }
  const discoverable = { access_mode: { [Op.in]: ['invite', 'request'] } };
  if (!viewer) {
    return discoverable;
  }
  return {
    [Op.or]: [discoverable, { id: { [Op.in]: [...viewer.orgIds, ...viewer.guestOrgIds] } }],
  };
};

/**
 * Whether the viewer acts as a global admin: a user holding the role, or a
 * live superadmin service account; any other service account never does,
 * whatever its owner's global role.
 * @param {{userId: number, isServiceAccount: boolean, isSuperadmin: boolean, orgIds: number[], guestOrgIds: number[], managedOrgIds: number[]}|null} viewer - From resolveIsoViewer
 * @returns {Promise<boolean>} True for a global admin
 */
const isGlobalAdmin = async viewer => {
  if (!viewer) {
    return false;
  }
  if (viewer.isServiceAccount) {
    return viewer.isSuperadmin;
  }
  const user = await User.findByPk(viewer.userId, {
    include: [{ model: Role, as: 'roles', through: { attributes: [] } }],
  });
  return Boolean(user?.roles?.some(role => role.name === 'admin'));
};

/**
 * The whitelisted metadata keys of a row as chain entries, `metadata.<key>`
 * with the value as text; the password key is never consulted, unreadable
 * metadata yields none.
 * @param {*} metadata - The row's metadata column
 * @returns {Array<[string, string]>} The entries
 */
const metadataEntries = metadata => {
  let facts = metadata;
  if (typeof facts === 'string') {
    try {
      facts = JSON.parse(facts);
    } catch {
      return [];
    }
  }
  if (!facts || typeof facts !== 'object') {
    return [];
  }
  return METADATA_KEYS.filter(key => facts[key] !== null && facts[key] !== undefined).map(key => [
    `metadata.${key}`,
    typeof facts[key] === 'string' ? facts[key] : JSON.stringify(facts[key]),
  ]);
};

/**
 * Whether a term could be the prefix of a checksum: one word, long enough
 * to identify one.
 * @param {string} term - The trimmed search term
 * @returns {boolean}
 */
const isChecksumTerm = term => term.length >= MIN_CHECKSUM_LENGTH && wordsOf(term).length === 1;

/**
 * Whether a checksum starts with the term, when the term could be one.
 * @param {string|null} checksum - The stored checksum
 * @param {string} term - The search term
 * @returns {boolean} True on an exact or prefix match
 */
const checksumMatches = (checksum, term) =>
  isChecksumTerm(term) &&
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
  const managed = kinds.includes('user') && !isAdmin && viewer ? viewer.managedOrgIds : [];
  const escaped = escapeTerm(term);
  return {
    term,
    tokens: tokensOf(term),
    prefix: `${escaped}%`,
    viewer,
    isAdmin,
    managedOrgIds: managed,
    boxWhere: boxWhereFor(viewer),
    isoWhere: isoWhereFor(viewer),
    downloadWhere: downloadWhereFor(viewer),
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
  wordsOf,
  tokensOf,
  tokenClauses,
  matchedChain,
  metadataLike,
  metadataEntries,
  isChecksumTerm,
  checksumMatches,
  buildContext,
};
