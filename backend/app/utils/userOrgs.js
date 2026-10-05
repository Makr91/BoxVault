import db from '../models/index.js';

/**
 * One membership in the identity provider's shape: the organization's uuid,
 * its URL name and display name, the role as the one upper-cased entry of
 * `roles`, the primary and personal flags, its logo as `logo_url` and its
 * email hash, an empty value of either answered null.
 * @param {Object} organization - The organizations row or its raw columns
 * @param {string} role - owner, admin, member or guest
 * @param {boolean} primary - Whether this is the caller's primary organization
 * @returns {{uuid: string, name: string, display_name: string|null, roles: string[], primary: boolean, personal: boolean, logo_url: string|null, email_hash: string|null}}
 */
const membershipOf = (organization, role, primary) => ({
  uuid: organization.uuid,
  name: organization.name,
  display_name: organization.display_name || null,
  roles: [role.toUpperCase()],
  primary,
  personal: Boolean(organization.personal),
  logo_url: organization.logo || null,
  email_hash: organization.emailHash || null,
});

/**
 * Resolve the org list + primary-org name embedded in signin/refresh payloads.
 * The user's primary_organization_id pointer is the ONE source of the primary
 * flag; per-membership is_primary rows are only a fallback for
 * primaryOrgName when the pointer is unset.
 * @param {Object} user - User instance (primaryOrganization association loaded)
 * @returns {Promise<{userOrganizations: Object[], primaryOrgName: string|null}>}
 */
const resolveUserOrganizations = async user => {
  const userOrgs = await db.UserOrg.getUserOrganizations(user.id);
  const pointerId = user.primary_organization_id ?? null;
  const userOrganizations = userOrgs.map(userOrg =>
    membershipOf(userOrg.organization, userOrg.role, userOrg.organization.id === pointerId)
  );
  const primaryOrgName =
    user.primaryOrganization?.name ||
    userOrgs.find(userOrg => userOrg.is_primary)?.organization.name ||
    null;
  return { userOrganizations, primaryOrgName };
};

export { membershipOf, resolveUserOrganizations };
