import axios from 'axios';
import jwt from 'jsonwebtoken';
import { loadConfig } from './config-loader.js';
import { getJwtClaimOptions } from './auth.js';
import { getOidcConfiguration } from '../auth/passport.js';

const REGISTERED_CLAIMS = ['exp', 'iat', 'nbf', 'iss', 'aud'];

const inFlight = new Map();

/**
 * Whether the token endpoint refused the grant itself: RFC 6749 §5.2
 * `invalid_grant`, the refresh token "invalid, expired, revoked ... or issued
 * to another client". Every other answer names a fault in the request or
 * the server and leaves the grant standing.
 * @param {Error} error - The axios error of the refresh request
 * @returns {boolean} True when the grant is dead
 */
const isGrantRefused = error =>
  error.response?.status === 400 && error.response?.data?.error === 'invalid_grant';

const providerNameOf = claims => claims.provider.replace('oidc-', '');

const tokenRequest = (providerName, refreshToken) => {
  const authConfig = loadConfig('auth');
  const oidcConfig = getOidcConfiguration(providerName);
  const providerConfig = authConfig.auth?.oidc?.providers?.[providerName];
  if (!oidcConfig || !providerConfig?.client_id) {
    throw new Error(`provider ${providerName} is not configured for refresh`);
  }
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: providerConfig.client_id,
  });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const authMethod = providerConfig.token_endpoint_auth_method || 'client_secret_basic';
  if (authMethod === 'client_secret_basic') {
    const credentials = Buffer.from(
      `${providerConfig.client_id}:${providerConfig.client_secret}`
    ).toString('base64');
    headers.Authorization = `Basic ${credentials}`;
  } else if (authMethod === 'client_secret_post') {
    params.append('client_secret', providerConfig.client_secret);
  }
  return axios.post(oidcConfig.serverMetadata().token_endpoint, params.toString(), { headers });
};

const mintSession = (claims, newTokens) => {
  const authConfig = loadConfig('auth');
  const oidcExpiresAt = newTokens.expires_in
    ? Date.now() + newTokens.expires_in * 1000
    : Date.now() + authConfig.auth.oidc.token_default_expiry_minutes * 60 * 1000;
  const carried = { ...claims };
  REGISTERED_CLAIMS.forEach(name => delete carried[name]);
  const tokens = {
    id_token: newTokens.id_token || claims.id_token,
    oidc_access_token: newTokens.access_token,
    oidc_refresh_token: newTokens.refresh_token || claims.oidc_refresh_token,
    oidc_expires_at: oidcExpiresAt,
  };
  const token = jwt.sign({ ...carried, ...tokens }, authConfig.auth.jwt.jwt_secret, {
    algorithm: 'HS256',
    expiresIn: authConfig.auth.jwt.jwt_expiration,
    ...getJwtClaimOptions(),
  });
  return { token, tokens };
};

/**
 * Refresh the identity-provider tokens of a BoxVault session once per refresh
 * token: concurrent callers holding the same refresh token share one token
 * request and one minted session, so a rotated-out token is never presented
 * twice (RFC 6749 §6, RFC 9700 §4.14.2).
 * @param {Object} claims - The verified claims of the session JWT
 * @returns {Promise<{token: string, tokens: Object}>} The new session JWT and the provider fields it carries
 * @throws {Error} The token endpoint's refusal, or the provider not being configured
 */
const refreshOidcSession = claims => {
  const key = claims.oidc_refresh_token;
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }
  const pending = Promise.resolve()
    .then(() => tokenRequest(providerNameOf(claims), key))
    .then(response => mintSession(claims, response.data))
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
};

/**
 * Put a refreshed session on the request and the response: the new JWT in
 * `X-Refreshed-Token` for the client to adopt, the fresh provider fields for
 * the handlers of this request.
 * @param {import('express').Request} req - The request being served
 * @param {import('express').Response} res - Its response
 * @param {Object} claims - The verified claims of the presented JWT
 * @param {{token: string, tokens: Object}} session - The refreshed session
 * @returns {void}
 */
const adoptRefreshedSession = (req, res, claims, session) => {
  res.setHeader('X-Refreshed-Token', session.token);
  req.userId = claims.id;
  req.isServiceAccount = false;
  req.oidcAccessToken = session.tokens.oidc_access_token;
  req.oidcTokens = session.tokens;
};

export { isGrantRefused, refreshOidcSession, adoptRefreshedSession };
