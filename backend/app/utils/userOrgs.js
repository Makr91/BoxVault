import db from '../models/index.js';

/**
 * Resolve the org list + primary-org name embedded in signin/refresh payloads.
 * The user's primary_organization_id pointer is the ONE source of the primary
 * badge (isPrimary); per-membership is_primary rows are only a fallback for
 * primaryOrgName when the pointer is unset.
 * @param {Object} user - User instance (primaryOrganization association loaded)
 * @returns {Promise<{userOrganizations: Object[], primaryOrgName: string|null}>}
 */
const resolveUserOrganizations = async user => {
  const userOrgs = await db.UserOrg.getUserOrganizations(user.id);
  const pointerId = user.primary_organization_id ?? null;
  const userOrganizations = userOrgs.map(userOrg => ({
    name: userOrg.organization.name,
    role: userOrg.role,
    isPrimary: userOrg.organization.id === pointerId,
  }));
  // primaryOrganization is the association behind the pointer, so it wins;
  // the is_primary row only fills in when the pointer is unset.
  const primaryOrgName =
    user.primaryOrganization?.name ||
    userOrgs.find(userOrg => userOrg.is_primary)?.organization.name ||
    null;
  return { userOrganizations, primaryOrgName };
};

export { resolveUserOrganizations };
