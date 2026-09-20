import db from '../models/index.js';

const { service_account: ServiceAccount, user: User, organization: Organization, UserOrg } = db;

const ORG_ROLES = ['guest', 'member', 'admin', 'owner'];
const ROLE_RANK = { guest: 0, member: 1, admin: 2, owner: 3, superadmin: 4 };
const WRITING_ROLES = ['member', 'admin', 'owner'];
const MANAGING_ROLES = ['admin', 'owner'];

/**
 * The lower of two organization roles.
 * @param {string} first - guest, member, admin or owner
 * @param {string} second - guest, member, admin or owner
 * @returns {string} The role with the lower rank
 */
const lowerRole = (first, second) => (ROLE_RANK[first] <= ROLE_RANK[second] ? first : second);

/**
 * Whether a membership may write in its organization: any role above guest.
 * A guest reads what is flagged for guests and never writes; no membership never writes.
 * @param {{role: string}|null} membership - The caller's membership in the organization
 * @returns {boolean} True for a member, admin or owner
 */
const canWriteInOrg = membership => Boolean(membership && WRITING_ROLES.includes(membership.role));

/**
 * Whether a membership may read an item of its organization: a writing member
 * reads it, a guest reads it only while it is published and flagged for
 * guests; no membership reads nothing.
 * @param {{role: string}|null} membership - The caller's membership in the item's organization
 * @param {{published: boolean, guestAccess: boolean}} item - The box, ISO or download row
 * @returns {boolean} True when the membership may read the item
 */
const canReadInOrg = (membership, item) =>
  Boolean(membership) && (canWriteInOrg(membership) || Boolean(item.published && item.guestAccess));

/**
 * Whether a membership is a guest seat, the one seat never answered a
 * download count.
 * @param {{role: string}|null} membership - The caller's membership in the organization
 * @returns {boolean} True for a guest
 */
const isGuestMembership = membership => Boolean(membership && membership.role === 'guest');

/**
 * Whether a viewer is a guest of an organization.
 * @param {{guestOrgIds: number[]}|null} viewer - From resolveViewer
 * @param {number} organizationId - Organization id
 * @returns {boolean} True when the viewer holds the guest seat there
 */
const isGuestOf = (viewer, organizationId) =>
  Boolean(viewer && viewer.guestOrgIds.includes(organizationId));

/**
 * Whether a user holds the global admin role.
 * @param {Object} user - The users row
 * @returns {Promise<boolean>} True while the user carries ROLE_ADMIN
 */
const holdsGlobalAdmin = async user => {
  const roles = await user.getRoles();
  return roles.some(role => role.name === 'admin');
};

/**
 * Whether a superadmin service account is still live: its creator must still
 * hold ROLE_ADMIN, the account is revoked the moment that role is gone.
 * @param {Object} account - The service_accounts row
 * @returns {Promise<boolean>} True for a live superadmin account
 */
const isLiveSuperadmin = async account => {
  if (account.role !== 'superadmin') {
    return false;
  }
  const creator = await User.findByPk(account.userId);
  if (!creator) {
    return false;
  }
  return holdsGlobalAdmin(creator);
};

/**
 * Whether a service account acts as a global admin: a live superadmin account.
 * @param {number} serviceAccountId - Service account id
 * @returns {Promise<boolean>} True when the account passes every admin gate
 */
const serviceAccountIsSuperadmin = async serviceAccountId => {
  const account = await ServiceAccount.findByPk(serviceAccountId);
  if (!account) {
    return false;
  }
  return isLiveSuperadmin(account);
};

/**
 * The membership a service account acts with in its own organization: a live
 * superadmin account as owner; any other account at the lower of its stored
 * role and its creator's current role there, null once the creator no longer
 * belongs to that organization.
 * @param {Object} account - The service_accounts row
 * @returns {Promise<{organization_id: number, role: string}|null>} The membership, or null
 */
const serviceAccountMembership = async account => {
  if (account.role === 'superadmin') {
    const live = await isLiveSuperadmin(account);
    return live ? { organization_id: account.organization_id, role: 'owner' } : null;
  }
  const creator = await UserOrg.findUserOrgRole(account.userId, account.organization_id);
  if (!creator) {
    return null;
  }
  return { organization_id: account.organization_id, role: lowerRole(account.role, creator.role) };
};

/**
 * Every membership a caller acts with: a user's own rows, a live superadmin
 * account's owner seat in every organization, any other service account's
 * single organization by serviceAccountMembership.
 * @param {{userId: number, isServiceAccount?: boolean, serviceAccountId?: number}} caller - The caller
 * @returns {Promise<Array<{organization_id: number, role: string}>>} The memberships
 */
const callerMemberships = async caller => {
  if (!caller.isServiceAccount) {
    return UserOrg.getUserOrganizations(caller.userId);
  }
  const account = await ServiceAccount.findByPk(caller.serviceAccountId);
  if (!account) {
    return [];
  }
  if (account.role === 'superadmin') {
    if (!(await isLiveSuperadmin(account))) {
      return [];
    }
    const organizations = await Organization.findAll({ attributes: ['id'] });
    return organizations.map(organization => ({ organization_id: organization.id, role: 'owner' }));
  }
  const membership = await serviceAccountMembership(account);
  return membership ? [membership] : [];
};

/**
 * The caller's membership in one organization: a user's row there, a live
 * superadmin account's owner seat, any other service account's effective
 * membership when the organization is its own, else null.
 * @param {{userId: number, isServiceAccount?: boolean, serviceAccountId?: number}} caller - The caller
 * @param {number} organizationId - Organization id
 * @returns {Promise<{organization_id: number, role: string}|null>} The membership, or null
 */
const resolveOrgMembership = async (caller, organizationId) => {
  if (!caller.isServiceAccount) {
    return UserOrg.findUserOrgRole(caller.userId, organizationId);
  }
  const account = await ServiceAccount.findByPk(caller.serviceAccountId);
  if (!account) {
    return null;
  }
  if (account.role === 'superadmin') {
    const live = await isLiveSuperadmin(account);
    return live ? { organization_id: organizationId, role: 'owner' } : null;
  }
  if (account.organization_id !== organizationId) {
    return null;
  }
  return serviceAccountMembership(account);
};

/**
 * The viewer the optional-auth read routes filter by: the caller's id, the
 * organizations the caller writes in, the ones the caller is a guest of and
 * the ones the caller administers.
 * @param {{userId: number, isServiceAccount?: boolean, serviceAccountId?: number}} caller - The caller
 * @returns {Promise<{userId: number, isServiceAccount: boolean, isSuperadmin: boolean, orgIds: number[], guestOrgIds: number[], managedOrgIds: number[]}>} The viewer
 */
const resolveViewer = async caller => {
  const isServiceAccount = Boolean(caller.isServiceAccount);
  const memberships = await callerMemberships(caller);
  const isSuperadmin = isServiceAccount
    ? await serviceAccountIsSuperadmin(caller.serviceAccountId)
    : false;
  return {
    userId: caller.userId,
    isServiceAccount,
    isSuperadmin,
    orgIds: memberships
      .filter(membership => WRITING_ROLES.includes(membership.role))
      .map(membership => membership.organization_id),
    guestOrgIds: memberships
      .filter(membership => membership.role === 'guest')
      .map(membership => membership.organization_id),
    managedOrgIds: memberships
      .filter(membership => MANAGING_ROLES.includes(membership.role))
      .map(membership => membership.organization_id),
  };
};

/**
 * Whether the caller owns a box: a user by the box's userId, a service account
 * by its creator's userId while it writes in the box's organization, never as
 * a guest seat and never outside that organization.
 * @param {{userId: number, isServiceAccount?: boolean}} caller - The caller
 * @param {{userId: number}} box - The box
 * @param {{role: string}|null} membership - The caller's membership in the box's organization
 * @returns {boolean} True when the caller owns the box
 */
const ownsBox = (caller, box, membership) =>
  box.userId === caller.userId && (!caller.isServiceAccount || canWriteInOrg(membership));

/**
 * Whether a viewer uploaded an item and may read it unpublished: a user by the
 * item's userId, a service account by its creator's userId only while it
 * writes in the item's organization, so a guest-role key never reads its
 * creator's private items.
 * @param {{userId: number, isServiceAccount: boolean, orgIds: number[]}|null} viewer - From resolveViewer
 * @param {{userId: number, organizationId: number}} item - The box, ISO or download row
 * @returns {boolean} True when the viewer uploaded the item
 */
const uploadedBy = (viewer, item) =>
  Boolean(viewer) &&
  item.userId === viewer.userId &&
  (!viewer.isServiceAccount || viewer.orgIds.includes(item.organizationId));

/**
 * The organizations whose unpublished items the viewer reads as their
 * uploader: every organization for a user, the writing ones alone for a
 * service account.
 * @param {{isServiceAccount: boolean, orgIds: number[], guestOrgIds: number[]}} viewer - From resolveViewer
 * @returns {number[]} Organization ids
 */
const uploaderOrgIds = viewer =>
  viewer.isServiceAccount ? viewer.orgIds : [...viewer.orgIds, ...viewer.guestOrgIds];

/**
 * Whether the caller may write a box and its tree: a writing member of its
 * organization who owns it, or an admin or owner of its organization; a guest
 * never.
 * @param {{userId: number, isServiceAccount?: boolean}} caller - The caller
 * @param {{userId: number}} box - The box
 * @param {{role: string}|null} membership - The caller's membership in the box's organization
 * @returns {boolean} True when the caller may write the box
 */
const canWriteBox = (caller, box, membership) =>
  canWriteInOrg(membership) &&
  (ownsBox(caller, box, membership) || MANAGING_ROLES.includes(membership.role));

/**
 * Whether the caller owns a download: a user by the download's userId, a
 * service account by its creator's userId while it writes in the download's
 * organization, never as a guest seat and never outside that organization.
 * @param {{userId: number, isServiceAccount?: boolean}} caller - The caller
 * @param {{userId: number}} download - The download
 * @param {{role: string}|null} membership - The caller's membership in the download's organization
 * @returns {boolean} True when the caller owns the download
 */
const ownsDownload = (caller, download, membership) =>
  download.userId === caller.userId && (!caller.isServiceAccount || canWriteInOrg(membership));

/**
 * Whether the caller may write a download and its tree: a writing member of
 * its organization who owns it, or an admin or owner of its organization; a
 * guest never.
 * @param {{userId: number, isServiceAccount?: boolean}} caller - The caller
 * @param {{userId: number}} download - The download
 * @param {{role: string}|null} membership - The caller's membership in the download's organization
 * @returns {boolean} True when the caller may write the download
 */
const canWriteDownload = (caller, download, membership) =>
  canWriteInOrg(membership) &&
  (ownsDownload(caller, download, membership) || MANAGING_ROLES.includes(membership.role));

/**
 * Whether the caller may place or discard a pending upload: the member who
 * uploaded it, or an admin or owner of its organization; a guest never.
 * @param {{userId: number, isServiceAccount?: boolean}} caller - The caller
 * @param {{userId: number}} pending - The pending upload row
 * @param {{role: string}|null} membership - The caller's membership in the upload's organization
 * @returns {boolean} True when the caller may place or discard it
 */
const canWritePendingUpload = (caller, pending, membership) =>
  canWriteInOrg(membership) &&
  (ownsDownload(caller, pending, membership) || MANAGING_ROLES.includes(membership.role));

const TIER = { unpublished: 0, private: 1, guest: 2, public: 3 };

const VISIBILITY_CHANGES = {
  make_public: { isPublic: true },
  make_private: { isPublic: false },
  publish: { published: true },
  unpublish: { published: false },
  allow_guests: { guestAccess: true },
  deny_guests: { guestAccess: false },
};

/**
 * The tier a row stands at by its own three words: unpublished, else public,
 * guest or private by the widest word set.
 * @param {{isPublic: boolean, guestAccess: boolean, published: boolean}} row - An item, version, release or patch
 * @returns {number} TIER.unpublished to TIER.public
 */
const tierOf = row => {
  if (!row.published) {
    return TIER.unpublished;
  }
  if (row.isPublic) {
    return TIER.public;
  }
  if (row.guestAccess) {
    return TIER.guest;
  }
  return TIER.private;
};

/**
 * The tier a viewer reaches on an item: unpublished, every row, for a writer
 * of the item, an admin or owner of its organization or its uploader in a
 * writing seat; private for any other writing member; guest for a guest of
 * the organization; public for anyone else.
 * @param {{userId: number, isServiceAccount: boolean, orgIds: number[], guestOrgIds: number[], managedOrgIds: number[]}|null} viewer - From resolveViewer
 * @param {{userId: number, organizationId: number}} item - The box, ISO or download
 * @returns {number} The tier the viewer reaches
 */
const reachOf = (viewer, item) => {
  if (!viewer) {
    return TIER.public;
  }
  if (viewer.managedOrgIds.includes(item.organizationId)) {
    return TIER.unpublished;
  }
  if (viewer.orgIds.includes(item.organizationId)) {
    return item.userId === viewer.userId ? TIER.unpublished : TIER.private;
  }
  if (viewer.guestOrgIds.includes(item.organizationId)) {
    return TIER.guest;
  }
  return TIER.public;
};

/**
 * The tier a caller with a resolved membership reaches on an item, the rule
 * of reachOf for the routes that carry a membership instead of a viewer.
 * @param {{userId: number, isServiceAccount?: boolean}|null} caller - The caller
 * @param {{userId: number}} item - The box, ISO or download
 * @param {{role: string}|null} membership - The caller's membership in the item's organization
 * @returns {number} The tier the caller reaches
 */
const reachOfMembership = (caller, item, membership) => {
  if (!caller || !membership) {
    return TIER.public;
  }
  if (canWriteInOrg(membership)) {
    const writer = MANAGING_ROLES.includes(membership.role) || ownsBox(caller, item, membership);
    return writer ? TIER.unpublished : TIER.private;
  }
  return isGuestMembership(membership) ? TIER.guest : TIER.public;
};

/**
 * Whether the rows beneath an item, parent first, are within a reach on that
 * item: the narrowest row stands at the reach or wider; the item itself is
 * judged by its own read rule before this is asked.
 * @param {number} reach - From reachOf or reachOfMembership
 * @param {...Object} rows - The rows beneath the item, parent first
 * @returns {boolean}
 */
const withinReach = (reach, ...rows) => Math.min(...rows.map(tierOf)) >= reach;

/**
 * The three visibility words a body carries, model-named, present ones only.
 * @param {Object} body - The request body
 * @returns {{isPublic?: boolean, guestAccess?: boolean, published?: boolean}} The words given
 */
const visibilityOf = body => {
  const words = {};
  if (typeof body.is_public !== 'undefined') {
    words.isPublic = body.is_public;
  }
  if (typeof body.guest_access !== 'undefined') {
    words.guestAccess = body.guest_access;
  }
  if (typeof body.published !== 'undefined') {
    words.published = body.published;
  }
  return words;
};

const VISIBILITY_WORDS = ['is_public', 'guest_access', 'published'];

/**
 * The three visibility words a query string carries, `true` and `false` as
 * text, model-named, present ones only; the reader the upload routes use.
 * @param {Object} query - The request query
 * @returns {{isPublic?: boolean, guestAccess?: boolean, published?: boolean}} The words given
 */
const visibilityOfQuery = query =>
  visibilityOf(
    Object.fromEntries(
      VISIBILITY_WORDS.filter(word => typeof query[word] === 'string').map(word => [
        word,
        query[word] === 'true',
      ])
    )
  );

/**
 * The validation error of a child that would hold a word its parent does not:
 * published under an unpublished parent, public under a parent that is not
 * public, open to guests under a parent that is neither; the withinParent
 * rule of the validation contract, pointing at the word, its params naming
 * the parent's own word, pending, guests or private; null while every word
 * stays within the parent.
 * @param {{isPublic: boolean, guestAccess: boolean, published: boolean}} child - The child's words after the write
 * @param {Object} parent - The parent row
 * @returns {{pointer: string, rule: string, params: {parent: string}}|null} The error
 */
const widerThanParent = (child, parent) => {
  const rule = 'withinParent';
  if (child.published && !parent.published) {
    return { pointer: '/published', rule, params: { parent: 'pending' } };
  }
  if (child.isPublic && !parent.isPublic) {
    return {
      pointer: '/is_public',
      rule,
      params: { parent: parent.guestAccess ? 'guests' : 'private' },
    };
  }
  if (child.guestAccess && !parent.guestAccess && !parent.isPublic) {
    return { pointer: '/guest_access', rule, params: { parent: 'private' } };
  }
  return null;
};

const BENEATH = {
  box: ['versions', 'boxId', 'version'],
  version: ['providers', 'versionId', 'provider'],
  provider: ['architectures', 'providerId', 'architecture'],
  architecture: ['files', 'architectureId', null],
  iso: ['isoVersions', 'isoId', 'isoVersion'],
  isoVersion: ['isoFiles', 'isoVersionId', null],
  download: ['downloadReleases', 'downloadId', 'release'],
  release: ['downloadPatches', 'downloadReleaseId', 'patch'],
  patch: ['downloadFiles', 'downloadPatchId', null],
};

/**
 * The words a write carries down its subtree: every word turned off always,
 * the words turned on as well when the request asked for the subtree.
 * @param {{isPublic?: boolean, guestAccess?: boolean, published?: boolean}} words - The words written on the row
 * @param {boolean} recursive - The request's recursive word
 * @returns {{isPublic?: boolean, guestAccess?: boolean, published?: boolean}} The words to carry down
 */
const wordsBeneath = (words, recursive) =>
  recursive ? words : Object.fromEntries(Object.entries(words).filter(([, on]) => on === false));

/**
 * Write words on every row beneath the given rows of a level, one update
 * per level down to the files; nothing when no words or no rows are given.
 * @param {string} level - box, version, provider, architecture, iso, isoVersion, download, release or patch
 * @param {number[]} ids - The ids of the rows at that level
 * @param {{isPublic?: boolean, guestAccess?: boolean, published?: boolean}} words - The words to write beneath
 * @returns {Promise<void>}
 */
const cascadeBeneath = async (level, ids, words) => {
  const step = BENEATH[level];
  if (!step || ids.length === 0 || Object.keys(words).length === 0) {
    return;
  }
  const [model, foreignKey, next] = step;
  const Model = db[model];
  await Model.update(words, { where: { [foreignKey]: ids } });
  if (next) {
    const rows = await Model.findAll({ where: { [foreignKey]: ids }, attributes: ['id'] });
    await cascadeBeneath(
      next,
      rows.map(row => row.id),
      words
    );
  }
};

export {
  TIER,
  VISIBILITY_CHANGES,
  tierOf,
  reachOf,
  reachOfMembership,
  withinReach,
  visibilityOf,
  visibilityOfQuery,
  widerThanParent,
  wordsBeneath,
  cascadeBeneath,
  ORG_ROLES,
  ROLE_RANK,
  lowerRole,
  canWriteInOrg,
  canReadInOrg,
  isGuestMembership,
  isGuestOf,
  holdsGlobalAdmin,
  serviceAccountIsSuperadmin,
  serviceAccountMembership,
  resolveOrgMembership,
  resolveViewer,
  ownsBox,
  uploadedBy,
  uploaderOrgIds,
  canWriteBox,
  ownsDownload,
  canWriteDownload,
  canWritePendingUpload,
};
