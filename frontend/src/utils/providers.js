// Shared OIDC provider-name sanitizer: provider names are interpolated into
// redirect URLs, so only URL-safe identifier characters are accepted.
export const sanitizeProvider = provider => {
  const safeProviderPattern = /^[A-Za-z0-9_-]+$/;
  if (typeof provider !== 'string' || !safeProviderPattern.test(provider)) {
    throw new Error('Invalid authentication provider');
  }
  return provider;
};

export const redirectToProvider = (provider, query = '') => {
  const safeProvider = sanitizeProvider(provider);
  window.location.href = `/api/auth/oidc/${safeProvider}${query}`;
};

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

export const LOGIN_METHOD_KEY = 'boxvault_login_method';

export const readStoredLoginMethod = () =>
  localStorage.getItem(LOGIN_METHOD_KEY) === 'password' ? 'password' : 'sso';

export const storeLoginMethod = method => {
  localStorage.setItem(LOGIN_METHOD_KEY, method);
};
