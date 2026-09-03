import axios from 'axios';

import { decodeJwt } from './jwt';

const REFRESH_AFTER_MS = 240000;
const PROVIDER_NAME = /^[A-Za-z0-9_-]+$/;

const normalizeUrl = url => url.replace(/\/+$/, '');

const isOidc = user => Boolean(user?.provider?.startsWith('oidc-'));

const organizationsOf = user =>
  (Array.isArray(user?.organizations) ? user.organizations : []).map(org => ({
    uuid: org.name,
    name: org.name,
    roles: org.role ? [String(org.role).toUpperCase()] : [],
    primary: Boolean(org.isPrimary),
  }));

const failure = (message, messageKey) => {
  const error = new Error(message);
  error.messageKey = messageKey;
  return error;
};

const skipsRefresh = config =>
  config.skipAuthRefresh ||
  config.url.includes('/auth/signin') ||
  config.url.includes('/auth/refresh-token');

/**
 * The app's own backend as the session: username and password or a
 * provider redirect through the backend's OIDC routes, the backend's JWT
 * stored under `storageKey` and sent as `x-access-token`, refreshed
 * through the refresh endpoint while the session is kept, the profile,
 * claims and preferences read and written through the backend, and the
 * backend's logout route for signing out everywhere. A session it restores
 * or completes is `{ user, organizations, oidc, issuerUrl }`, the user
 * being the stored profile.
 *
 * @param {Object} options - The app's side of the session
 * @param {string} options.baseUrl - The backend origin
 * @param {Object} options.events - The bus from `createSessionEvents`; `login` is emitted after a sign-in and `sessionEnded` when the backend rejects the session
 * @param {string} [options.storageKey] - localStorage key of the stored user
 * @returns {Object} The session provider `useSession`, the callback page and the app's login page drive
 */
export const createBackendSession = ({ baseUrl, events, storageKey = 'user' }) => {
  const api = `${baseUrl}/api`;
  let claimsPromise = null;
  let issuersPromise = null;

  const current = () => JSON.parse(localStorage.getItem(storageKey) || 'null');

  const store = user => localStorage.setItem(storageKey, JSON.stringify(user));

  const clear = () => {
    localStorage.removeItem(storageKey);
    claimsPromise = null;
  };

  const authHeader = () => {
    const user = current();
    return user?.accessToken ? { 'x-access-token': user.accessToken } : {};
  };

  const endSession = () => {
    clear();
    events.endSession();
  };

  const refreshToken = async () => {
    const user = current();
    if (!user) {
      return null;
    }
    try {
      const { data } = await axios.post(
        `${api}/auth/refresh-token`,
        { stayLoggedIn: user.stayLoggedIn },
        { headers: { ...authHeader(), 'Content-Type': 'application/json' }, skipAuthRefresh: true }
      );
      if (!data.accessToken) {
        return null;
      }
      const next = {
        ...user,
        ...data,
        tokenRefreshTime: Date.now(),
        stayLoggedIn: data.stayLoggedIn,
      };
      store(next);
      return next;
    } catch {
      return null;
    }
  };

  const refreshIfNeeded = () => {
    const user = current();
    if (!user?.stayLoggedIn || Date.now() - user.tokenRefreshTime < REFRESH_AFTER_MS) {
      return Promise.resolve(null);
    }
    return refreshToken();
  };

  axios.interceptors.request.use(async config => {
    if (skipsRefresh(config)) {
      return config;
    }
    if (!config.signal || !config.signal.aborted) {
      await refreshIfNeeded();
    }
    if (!config.headers['Content-Type'] && !config.url.includes('/file/upload')) {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  });

  const adoptRefreshedToken = response => {
    const refreshed = response?.headers?.['x-refreshed-token'];
    const user = refreshed ? current() : null;
    if (user) {
      store({ ...user, accessToken: refreshed, tokenRefreshTime: Date.now() });
    }
    return response;
  };

  const retryAfterRefresh = async error => {
    const original = error.config;
    if (
      error.name === 'CanceledError' ||
      error.name === 'AbortError' ||
      original.url.includes('/auth/') ||
      original.skipAuthRefresh ||
      error.response?.status !== 401 ||
      original.retried
    ) {
      throw error;
    }
    original.retried = true;
    if (current()?.stayLoggedIn && (await refreshIfNeeded())) {
      original.headers = { ...original.headers, ...authHeader() };
      return axios(original);
    }
    endSession();
    throw error;
  };

  axios.interceptors.response.use(adoptRefreshedToken, retryAfterRefresh);

  const trustedIssuers = () => {
    issuersPromise ||= axios
      .get(`${api}/auth/oidc/issuers`)
      .then(({ data }) => data.issuers || [])
      .catch(() => []);
    return issuersPromise;
  };

  const issuerOf = async user => {
    if (!isOidc(user)) {
      return '';
    }
    const issuer = decodeJwt(decodeJwt(user.accessToken)?.id_token)?.iss || '';
    if (!issuer.startsWith('https://')) {
      return '';
    }
    const trusted = await trustedIssuers();
    return trusted.some(entry => normalizeUrl(entry.issuer) === normalizeUrl(issuer)) ? issuer : '';
  };

  const restore = () => {
    const user = current();
    return user
      ? { user, organizations: organizationsOf(user), oidc: isOidc(user), issuerUrl: '' }
      : null;
  };

  const load = async () => {
    claimsPromise = null;
    const session = restore();
    return session ? { ...session, issuerUrl: await issuerOf(session.user) } : null;
  };

  const reload = async () => {
    const user = current();
    if (!user) {
      return null;
    }
    const profile = await axios
      .get(`${api}/user`, { headers: authHeader() })
      .then(({ data }) => data)
      .catch(() => null);
    if (profile) {
      store({
        ...user,
        ...profile,
        stayLoggedIn: user.stayLoggedIn,
        tokenRefreshTime: user.tokenRefreshTime,
      });
    }
    return load();
  };

  const refresh = async () => ((await refreshToken()) ? load() : null);

  const begin = ({ method, silent = false }) => {
    if (!PROVIDER_NAME.test(method || '')) {
      throw new Error('invalid authentication provider');
    }
    window.location.assign(`${api}/auth/oidc/${method}${silent ? '?prompt=none' : ''}`);
  };

  const login = async (username, password, stayLoggedIn = false) => {
    const { data } = await axios.post(`${api}/auth/signin`, { username, password, stayLoggedIn });
    if (data.accessToken) {
      store({ ...data, stayLoggedIn, tokenRefreshTime: Date.now() });
      events.emit('login');
    }
    return data;
  };

  const complete = async () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
      throw failure(params.get('error'), 'auth:errors.authenticationFailed');
    }
    const code = params.get('code');
    if (!code) {
      throw failure('no login code in callback', 'auth:errors.invalidResponse');
    }
    const token = await axios
      .post(`${api}/auth/oidc/exchange`, { code }, { skipAuthRefresh: true })
      .then(({ data }) => data?.token || null)
      .catch(() => null);
    if (!token) {
      throw failure('login code exchange failed', 'auth:errors.failedToProcess');
    }
    const profile = await axios
      .get(`${api}/user`, { headers: { 'x-access-token': token } })
      .then(({ data }) => data)
      .catch(() => null);
    store({
      ...(profile || {}),
      accessToken: token,
      tokenRefreshTime: Date.now(),
      provider: decodeJwt(token)?.provider || null,
    });
    events.emit('login');
    return load();
  };

  const headers = () => Promise.resolve(authHeader());

  const claims = () => {
    claimsPromise ||= axios
      .get(`${api}/userinfo/claims`, { headers: authHeader() })
      .then(({ data }) => data)
      .catch(() => null);
    return claimsPromise;
  };

  const savePreferences = async patch => {
    if (!current()) {
      return;
    }
    const saved = await axios
      .patch(`${api}/user/preferences`, patch, { headers: authHeader() })
      .then(() => true)
      .catch(() => false);
    const user = current();
    if (saved && user) {
      store({
        ...user,
        ...(patch.theme ? { preferredTheme: patch.theme } : {}),
        ...(patch.language ? { preferredLanguage: patch.language } : {}),
      });
    }
  };

  const signOut = () => clear();

  const signOutEverywhere = async () => {
    const response = isOidc(current())
      ? await axios
          .post(`${api}/auth/oidc/logout`, {}, { headers: authHeader(), skipAuthRefresh: true })
          .catch(() => null)
      : null;
    clear();
    window.location.assign(response?.data?.redirect_url || '/');
  };

  return {
    id: 'backend',
    issuerUrl: '',
    authHeader,
    current,
    restore,
    load,
    reload,
    refresh,
    begin,
    login,
    complete,
    headers,
    claims,
    savePreferences,
    signOut,
    signOutEverywhere,
  };
};
