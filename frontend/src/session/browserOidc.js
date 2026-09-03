import axios from 'axios';

import { base64url, createDpop } from './dpop';
import { decodeJwt } from './jwt';

const PREFERENCES_PATH = '/api/user/preferences';
const THEME_VALUES = ['auto', 'light', 'dark'];

const randomUrlSafe = byteCount => {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
};

const s256 = async text => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return base64url(digest);
};

const applyAccountPreferences = preferences => {
  if (!preferences) {
    return;
  }
  if (THEME_VALUES.includes(preferences.theme)) {
    localStorage.setItem('theme', preferences.theme);
  }
  if (preferences.language) {
    localStorage.setItem('i18nextLng', preferences.language);
  }
};

const submitForm = (action, fields) => {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
};

const tokenFailure = requestError => {
  const body = requestError.response?.data;
  const failure = new Error(
    body?.error_description || body?.error || `token request failed (${requestError.message})`
  );
  failure.code = body?.error || '';
  if (failure.code === 'invalid_dpop_proof') {
    failure.messageKey = 'session.clockSkew';
  }
  return failure;
};

/**
 * The browser as the OIDC public client: authorization code with PKCE and
 * DPoP against the identity provider, tokens in localStorage under the
 * app's prefix, the refresh grant a minute before expiry, the provider's
 * userinfo as the claims, and the end-session form POST for signing out
 * everywhere. A session it restores or completes is
 * `{ user, organizations, oidc, issuerUrl }`, the user being the access
 * token's claims.
 *
 * @param {Object} options - The app's side of the client
 * @param {string} options.issuer - The identity provider's issuer URL
 * @param {string} options.clientId - The registered public client id
 * @param {string} options.scopes - Space-separated scopes to request
 * @param {string} options.storagePrefix - Prefix of every localStorage key and of the DPoP database
 * @param {Object} options.events - The bus from `createSessionEvents`; `login` is emitted after the exchange and `sessionEnded` when a refresh fails
 * @param {string} [options.apiBase] - Origin the preferences write is sent to, empty when a dev proxy answers same-origin
 * @param {string} [options.redirectPath] - The registered callback path on this origin
 * @returns {Object} The session provider `useSession` and the callback page drive
 */
export const createBrowserOidc = ({
  issuer,
  clientId,
  scopes,
  storagePrefix,
  events,
  apiBase = issuer,
  redirectPath = '/callback',
}) => {
  const STORE = {
    access: `${storagePrefix}.access_token`,
    refresh: `${storagePrefix}.refresh_token`,
    id: `${storagePrefix}.id_token`,
    tokenType: `${storagePrefix}.token_type`,
    expires: `${storagePrefix}.expires_at`,
    verifier: `${storagePrefix}.pkce_verifier`,
    state: `${storagePrefix}.pkce_state`,
    discovery: `${storagePrefix}.oidc_discovery`,
  };
  const dpop = createDpop({ storagePrefix });
  const redirectUri = `${window.location.origin}${redirectPath}`;
  let claimsPromise = null;

  const discover = async () => {
    const cached = sessionStorage.getItem(STORE.discovery);
    if (cached) {
      return JSON.parse(cached);
    }
    const { data } = await axios.get(`${issuer}/.well-known/openid-configuration`);
    sessionStorage.setItem(STORE.discovery, JSON.stringify(data));
    return data;
  };

  const storeTokens = tokens => {
    localStorage.setItem(STORE.access, tokens.access_token);
    if (tokens.refresh_token) {
      localStorage.setItem(STORE.refresh, tokens.refresh_token);
    }
    if (tokens.id_token) {
      localStorage.setItem(STORE.id, tokens.id_token);
    }
    localStorage.setItem(STORE.tokenType, tokens.token_type === 'DPoP' ? 'DPoP' : 'Bearer');
    const ttlSeconds = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;
    localStorage.setItem(STORE.expires, String(Date.now() + ttlSeconds * 1000));
  };

  const clearTokens = () => {
    localStorage.removeItem(STORE.access);
    localStorage.removeItem(STORE.refresh);
    localStorage.removeItem(STORE.id);
    localStorage.removeItem(STORE.tokenType);
    localStorage.removeItem(STORE.expires);
    claimsPromise = null;
  };

  const requestHeaders = async (method, url, token) => {
    if (localStorage.getItem(STORE.tokenType) !== 'DPoP') {
      return { Authorization: `Bearer ${token}` };
    }
    return { Authorization: `DPoP ${token}`, DPoP: await dpop.proof(method, url, token) };
  };

  const tokenRequest = async params => {
    const { token_endpoint } = await discover();
    try {
      const { data } = await axios.post(token_endpoint, new URLSearchParams(params), {
        headers: { DPoP: await dpop.proof('POST', token_endpoint) },
      });
      return data;
    } catch (requestError) {
      throw tokenFailure(requestError);
    }
  };

  const refreshTokens = async () => {
    const refreshToken = localStorage.getItem(STORE.refresh);
    if (!refreshToken) {
      throw new Error('no refresh token');
    }
    const tokens = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    });
    storeTokens(tokens);
  };

  const endSession = () => {
    clearTokens();
    events.endSession();
  };

  const getAccessToken = async () => {
    const token = localStorage.getItem(STORE.access);
    if (!token) {
      return null;
    }
    const expiresAt = Number(localStorage.getItem(STORE.expires) || 0);
    if (Date.now() < expiresAt - 60 * 1000) {
      return token;
    }
    try {
      await refreshTokens();
      return localStorage.getItem(STORE.access);
    } catch {
      endSession();
      return null;
    }
  };

  const sessionOf = token => {
    const user = token ? decodeJwt(token) : null;
    if (!user) {
      return null;
    }
    return { user, organizations: user.organizations || [], oidc: true, issuerUrl: issuer };
  };

  const restore = () => sessionOf(localStorage.getItem(STORE.access));

  const load = async () => sessionOf(await getAccessToken());

  const fetchClaims = async token => {
    try {
      const { userinfo_endpoint } = await discover();
      const { data } = await axios.get(userinfo_endpoint, {
        headers: await requestHeaders('GET', userinfo_endpoint, token),
      });
      return data;
    } catch {
      return null;
    }
  };

  const claims = () => {
    claimsPromise ||= getAccessToken().then(token => (token ? fetchClaims(token) : null));
    return claimsPromise;
  };

  const begin = async () => {
    const verifier = randomUrlSafe(48);
    const state = randomUrlSafe(24);
    localStorage.setItem(STORE.verifier, verifier);
    localStorage.setItem(STORE.state, state);
    const [{ authorization_endpoint }, challenge] = await Promise.all([discover(), s256(verifier)]);
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    window.location.assign(`${authorization_endpoint}?${query.toString()}`);
  };

  const complete = async () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
      throw new Error(params.get('error_description') || params.get('error'));
    }
    const code = params.get('code');
    const state = params.get('state');
    const expectedState = localStorage.getItem(STORE.state);
    const verifier = localStorage.getItem(STORE.verifier);
    localStorage.removeItem(STORE.state);
    localStorage.removeItem(STORE.verifier);
    if (!code) {
      throw new Error('no authorization code in callback');
    }
    if (!expectedState || state !== expectedState) {
      throw new Error('state mismatch — stale or forged callback');
    }
    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    });
    storeTokens(tokens);
    const info = await claims();
    applyAccountPreferences(info?.preferences);
    events.emit('login');
    return restore();
  };

  const headers = async (method, url) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('not signed in');
    }
    return requestHeaders(method, url, token);
  };

  const refresh = async () => {
    try {
      await refreshTokens();
    } catch {
      endSession();
      return null;
    }
    claimsPromise = null;
    return load();
  };

  const savePreferences = async patch => {
    const token = await getAccessToken();
    if (!token) {
      return;
    }
    const patchHeaders = await requestHeaders('PATCH', `${issuer}${PREFERENCES_PATH}`, token);
    await axios
      .patch(`${apiBase}${PREFERENCES_PATH}`, patch, { headers: patchHeaders })
      .catch(() => null);
  };

  const signOut = () => {
    clearTokens();
    dpop.clearKey().catch(() => null);
  };

  const signOutEverywhere = async () => {
    const idToken = localStorage.getItem(STORE.id);
    const { end_session_endpoint } = await discover();
    signOut();
    if (!end_session_endpoint) {
      window.location.assign('/');
      return;
    }
    const fields = {
      client_id: clientId,
      post_logout_redirect_uri: `${window.location.origin}/`,
      state: randomUrlSafe(24),
    };
    if (idToken) {
      fields.id_token_hint = idToken;
    }
    submitForm(end_session_endpoint, fields);
  };

  return {
    id: 'idp',
    issuerUrl: issuer,
    restore,
    load,
    reload: load,
    begin,
    complete,
    headers,
    refresh,
    claims,
    savePreferences,
    signOut,
    signOutEverywhere,
  };
};
