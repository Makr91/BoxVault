/**
 * The contract's name chain: the display name the identity provider or the
 * app stored, else the username, else the email.
 * @param {Object|null|undefined} user - Any payload carrying name, username or email
 * @returns {string}
 */
export const userDisplayName = user => user?.name || user?.username || user?.email || '';

/**
 * The email as the second line, only when it differs from the display name.
 * @param {Object|null|undefined} user
 * @returns {string}
 */
export const userSecondaryLine = user => {
  const email = user?.email || '';
  return email && email !== userDisplayName(user) ? email : '';
};
