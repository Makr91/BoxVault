const isSafePath = path => path.startsWith('/') && !path.startsWith('//');

export const safeReturnPath = value => {
  if (!value) {
    return '';
  }
  const path = decodeURIComponent(value);
  return isSafePath(path) ? path : '';
};

export const currentPath = () => `${window.location.pathname}${window.location.search}`;

/**
 * Where a sign-in returns to: the page remembered before the redirect,
 * read back by the callback, never an auth page and never another origin.
 *
 * @param {Object} options - The app's side
 * @param {string} options.storageKey - localStorage key holding the remembered path
 * @param {string} [options.signInPath] - The app's login page, empty when sign-in is one click
 * @param {string[]} [options.authPaths] - Path prefixes that are never remembered
 * @returns {Object} remember, consume, fromParams, onAuthPage and signInTo
 */
export const createReturnTo = ({ storageKey, signInPath = '', authPaths = [] }) => ({
  remember: path => {
    if (path) {
      localStorage.setItem(storageKey, path);
    }
  },
  consume: () => {
    const path = localStorage.getItem(storageKey) || '';
    localStorage.removeItem(storageKey);
    return isSafePath(path) ? path : '';
  },
  fromParams: params => safeReturnPath(params.get('returnTo')),
  onAuthPage: pathname => authPaths.some(path => pathname.startsWith(path)),
  signInTo: returnTo => {
    if (!signInPath) {
      return '';
    }
    return returnTo ? `${signInPath}?returnTo=${encodeURIComponent(returnTo)}` : signInPath;
  },
});
