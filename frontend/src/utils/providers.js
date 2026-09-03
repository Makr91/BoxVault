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
