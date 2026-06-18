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
 *   - view / create box ............ org member (any role)            -> isOrgMember
 *   - box update/delete + version/
 *     provider/arch/file mutations . box owner OR org moderator/admin -> canManageBox
 *   - remove-all / org settings /
 *     member roles ................. org moderator/admin OR global admin -> isOrgManager
 */

/** The user's role within a specific organization, or undefined if not a member. */
const orgRole = (user, organizationName) => {
  if (!user || !organizationName || !Array.isArray(user.organizations)) {
    return undefined;
  }
  const membership = user.organizations.find(
    (org) => org.name === organizationName
  );
  return membership ? membership.role : undefined;
};

/** Whether the user holds the global admin role (matches App.jsx / backend isAdmin). */
export const isGlobalAdmin = (user) =>
  Boolean(user) &&
  Array.isArray(user.roles) &&
  user.roles.includes("ROLE_ADMIN");

/** Member of the organization (any role). Mirrors verifyOrgAccess.isOrgMember. */
export const isOrgMember = (user, organizationName) =>
  orgRole(user, organizationName) !== undefined;

/**
 * Org moderator/admin, or a global admin.
 * Mirrors verifyOrgAccess.isOrgModeratorOrAdmin (which bypasses for global admins).
 * Used for org settings, member-role management, and bulk delete.
 */
export const isOrgManager = (user, organizationName) =>
  isGlobalAdmin(user) ||
  ["moderator", "admin"].includes(orgRole(user, organizationName));

/**
 * Org admin specifically, or a global admin.
 * Mirrors verifyOrgAccess.isOrgAdmin (gates per-org role changes + member removal).
 */
export const isOrgAdmin = (user, organizationName) =>
  isGlobalAdmin(user) || orgRole(user, organizationName) === "admin";

/**
 * Whether the user may mutate a box's content (edit/delete the box, and
 * create/update/delete its versions, providers, architectures, and files).
 * Mirrors the content controllers: box owner OR org moderator/admin.
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
  return ["moderator", "admin"].includes(orgRole(user, organizationName));
};
