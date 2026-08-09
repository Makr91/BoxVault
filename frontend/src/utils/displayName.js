/**
 * Preferred human label for a user: the display name when the identity
 * provider supplied one, else the username, else the email.
 *
 * @param {object|null|undefined} user - Any payload carrying name/username/email.
 * @returns {string}
 */
export const userDisplayName = (user) =>
  user?.name || user?.username || user?.email || "";

/**
 * The email, but only when it differs from the primary label — SCIM-synced
 * accounts carry the email as their username, so showing both would repeat it.
 *
 * @param {object|null|undefined} user
 * @returns {string} Email to render as the secondary line, or "".
 */
export const userSecondaryLine = (user) => {
  const email = user?.email || "";
  return email && email !== userDisplayName(user) ? email : "";
};
