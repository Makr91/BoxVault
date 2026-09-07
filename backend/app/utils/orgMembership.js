import db from '../models/index.js';

const { service_account: ServiceAccount, user: User, organization: Organization, UserOrg } = db;

const ORG_ROLES = ['member', 'admin', 'owner'];
const ROLE_RANK = { member: 0, admin: 1, owner: 2, superadmin: 3 };
const MANAGING_ROLES = ['admin', 'owner'];

/**
 * The lower of two organization roles.
 * @param {string} first - member, admin or owner
 * @param {string} second - member, admin or owner
 * @returns {string} The role with the lower rank
 */
const lowerRole = (first, second) => (ROLE_RANK[first] <= ROLE_RANK[second] ? first : second);

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
 * organizations the caller belongs to and the ones the caller administers.
 * @param {{userId: number, isServiceAccount?: boolean, serviceAccountId?: number}} caller - The caller
 * @returns {Promise<{userId: number, isServiceAccount: boolean, isSuperadmin: boolean, orgIds: number[], managedOrgIds: number[]}>} The viewer
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
    orgIds: memberships.map(membership => membership.organization_id),
    managedOrgIds: memberships
      .filter(membership => MANAGING_ROLES.includes(membership.role))
      .map(membership => membership.organization_id),
  };
};

/**
 * Whether the caller owns a box: a user by the box's userId, a service account
 * by its owner's userId while it is a member of the box's organization, never
 * outside that organization.
 * @param {{userId: number, isServiceAccount?: boolean}} caller - The caller
 * @param {{userId: number}} box - The box
 * @param {{role: string}|null} membership - The caller's membership in the box's organization
 * @returns {boolean} True when the caller owns the box
 */
const ownsBox = (caller, box, membership) =>
  box.userId === caller.userId && (!caller.isServiceAccount || Boolean(membership));

/**
 * Whether the caller may write a box and its tree: its owner, or an admin or
 * owner of its organization.
 * @param {{userId: number, isServiceAccount?: boolean}} caller - The caller
 * @param {{userId: number}} box - The box
 * @param {{role: string}|null} membership - The caller's membership in the box's organization
 * @returns {boolean} True when the caller may write the box
 */
const canWriteBox = (caller, box, membership) =>
  ownsBox(caller, box, membership) ||
  Boolean(membership && MANAGING_ROLES.includes(membership.role));

export {
  ORG_ROLES,
  ROLE_RANK,
  lowerRole,
  holdsGlobalAdmin,
  serviceAccountIsSuperadmin,
  serviceAccountMembership,
  resolveOrgMembership,
  resolveViewer,
  ownsBox,
  canWriteBox,
};
