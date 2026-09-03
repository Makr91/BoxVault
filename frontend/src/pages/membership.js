const membershipOf = (organizations, name) =>
  organizations.find(entry => entry.name === name) || null;

const hasRole = (organizations, name, roles) =>
  (membershipOf(organizations, name)?.roles || []).some(role => roles.includes(role));

/**
 * Whether the normalized organization list holds a membership of that name.
 * @param {Array<{ name: string, roles?: string[] }>} organizations - The chrome's organization list
 * @param {string} name - The organization's route name
 * @returns {boolean}
 */
export const isMember = (organizations, name) => membershipOf(organizations, name) !== null;

/**
 * Owner or admin of the organization, or a global admin.
 * @param {Array<{ name: string, roles?: string[] }>} organizations
 * @param {string} name
 * @param {boolean} [admin] - Whether the viewer is a global admin
 * @returns {boolean}
 */
export const isManager = (organizations, name, admin = false) =>
  admin || hasRole(organizations, name, ['OWNER', 'ADMIN']);

/**
 * Owner of the organization, or a global admin.
 * @param {Array<{ name: string, roles?: string[] }>} organizations
 * @param {string} name
 * @param {boolean} [admin] - Whether the viewer is a global admin
 * @returns {boolean}
 */
export const isOwner = (organizations, name, admin = false) =>
  admin || hasRole(organizations, name, ['OWNER']);
