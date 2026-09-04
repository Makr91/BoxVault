import PropTypes from 'prop-types';

/**
 * The app's side of the shared sign-in, registration and invitation pages:
 * the backend calls those pages make and the two localStorage keys they
 * remember the chosen sign-in method and the one silent SSO attempt under.
 */
export const authShape = PropTypes.shape({
  methods: PropTypes.func.isRequired,
  register: PropTypes.func.isRequired,
  validateInvitation: PropTypes.func.isRequired,
  acceptInvitation: PropTypes.func.isRequired,
  loginMethodKey: PropTypes.string.isRequired,
  silentSsoKey: PropTypes.string.isRequired,
});

export const returnToShape = PropTypes.shape({
  remember: PropTypes.func.isRequired,
  consume: PropTypes.func.isRequired,
  fromParams: PropTypes.func.isRequired,
  onAuthPage: PropTypes.func.isRequired,
  signInTo: PropTypes.func.isRequired,
});

export const sortMethodsByDefault = (methods, defaultProvider) => {
  if (!defaultProvider) {
    return methods;
  }
  const defaultId = `oidc-${defaultProvider}`;
  return [...methods].sort((a, b) => {
    if (a.id === defaultId) {
      return -1;
    }
    if (b.id === defaultId) {
      return 1;
    }
    return 0;
  });
};

export const readStoredLoginMethod = key =>
  localStorage.getItem(key) === 'password' ? 'password' : 'sso';

export const storeLoginMethod = (key, method) => {
  localStorage.setItem(key, method);
};
