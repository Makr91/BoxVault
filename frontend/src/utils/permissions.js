import { isManager, isMember, isOwner } from '../pages';

/**
 * Authorization helpers shared across components.
 *
 * These mirror the backend authorization rules exactly so the UI never shows a
 * control the API would reject, and never hides one the API would allow.
 *
 * The stored user object carries:
 *   - `roles`:         global roles, e.g. ["ROLE_ADMIN"]
 *   - `organizations`: [{ name, role, isPrimary }] for every membership
 * (populated by signin, refresh-token, and getUserProfile).
 *
 * Backend rules being mirrored:
 *   - view / create box ............ org member (any role)         -> isOrgMember
 *   - box update/delete + version/
 *     provider/arch/file mutations . box owner OR org admin/owner  -> canManageBox
 *   - remove-all / org settings /
 *     member roles ................. org admin/owner OR global admin -> isOrgManager
 */

/** The stored memberships in the chrome's organization shape. */
export const memberships = user =>
  (Array.isArray(user?.organizations) ? user.organizations : []).map(org => ({
    uuid: org.name,
    name: org.name,
    roles: org.role ? [String(org.role).toUpperCase()] : [],
    primary: Boolean(org.isPrimary),
  }));

/** Whether the user holds the global admin role (matches App.jsx / backend isAdmin). */
export const isGlobalAdmin = user =>
  Boolean(user) && Array.isArray(user.roles) && user.roles.includes('ROLE_ADMIN');

/** Member of the organization (any role). Mirrors verifyOrgAccess.isOrgMember. */
export const isOrgMember = (user, organizationName) =>
  isMember(memberships(user), organizationName);

/**
 * Org admin/owner, or a global admin.
 * Mirrors verifyOrgAccess.isOrgAdminOrOwner (which bypasses for global admins).
 * Used for org settings, member-role management, and bulk delete.
 */
export const isOrgManager = (user, organizationName) =>
  isManager(memberships(user), organizationName, isGlobalAdmin(user));

/**
 * Org owner specifically, or a global admin.
 * Mirrors verifyOrgAccess.isOrgOwner (gates per-org role changes + org deletion).
 */
export const isOrgOwner = (user, organizationName) =>
  isOwner(memberships(user), organizationName, isGlobalAdmin(user));

/**
 * Whether the user may mutate a box's content (edit/delete the box, and
 * create/update/delete its versions, providers, architectures, and files).
 * Mirrors the content controllers: box owner OR org admin/owner.
 * (The backend intentionally does not grant global admins content access, so
 * neither do we.)
 *
 * @param {object|null} user
 * @param {string} organizationName
 * @param {object|null} box - must include `userId` (the owner).
 */
export const canManageBox = (user, organizationName, box) => {
  if (!user) {
    return false;
  }
  if (box && box.userId === user.id) {
    return true;
  }
  return isManager(memberships(user), organizationName);
};
