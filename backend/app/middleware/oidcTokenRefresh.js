import jwt from 'jsonwebtoken';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';
import { getJwtClaimOptions } from '../utils/auth.js';
import { problem } from '../utils/problem.js';
import { isGrantRefused, refreshOidcSession, adoptRefreshedSession } from '../utils/oidcRefresh.js';

const verifiedClaims = token => {
  try {
    return jwt.verify(token, loadConfig('auth').auth.jwt.jwt_secret, getJwtClaimOptions());
  } catch (error) {
    log.auth.debug('JWT verification failed in refresh middleware', { error: error.message });
    return null;
  }
};

const needsRefresh = claims => {
  if (!claims.oidc_expires_at || !claims.oidc_refresh_token) {
    log.auth.warn('OIDC token missing refresh data, skipping refresh', {
      userId: claims.id,
      provider: claims.provider,
      hasExpiresAt: !!claims.oidc_expires_at,
      hasRefreshToken: !!claims.oidc_refresh_token,
    });
    return false;
  }
  const thresholdMinutes = loadConfig('auth').auth.oidc.token_refresh_threshold_minutes;
  return claims.oidc_expires_at - Date.now() <= thresholdMinutes * 60 * 1000;
};

/**
 * Refresh the identity-provider tokens inside a BoxVault session JWT when
 * they are within the configured threshold of expiry. A grant the token
 * endpoint refuses with `invalid_grant` ends the session with 401 (RFC 6749
 * §5.2); any other failure logs and lets the request continue on the tokens
 * it already carries, the way RFC 6749 §5.2 and RFC 9110 §15.6 describe
 * client-request and server faults.
 * @param {import('express').Request} req - The request
 * @param {import('express').Response} res - The response
 * @param {import('express').NextFunction} next - The next handler
 * @returns {Promise<void>}
 */
const oidcTokenRefresh = async (req, res, next) => {
  const token = req.headers['x-access-token'];
  if (!token) {
    return next();
  }
  const claims = verifiedClaims(token);
  if (!claims?.provider?.startsWith('oidc-') || !needsRefresh(claims)) {
    return next();
  }
  log.auth.info('OIDC token expiring soon, attempting refresh', {
    userId: claims.id,
    provider: claims.provider,
    isExpired: claims.oidc_expires_at < Date.now(),
  });
  try {
    const session = await refreshOidcSession(claims);
    adoptRefreshedSession(req, res, claims, session);
    log.auth.info('OIDC token refresh successful', {
      userId: claims.id,
      provider: claims.provider,
      hasRefreshToken: !!session.tokens.oidc_refresh_token,
    });
    return next();
  } catch (error) {
    log.auth.error('OIDC token refresh failed', {
      provider: claims.provider,
      userId: claims.id,
      error: error.message,
      status: error.response?.status,
      errorData: error.response?.data,
    });
    if (isGrantRefused(error)) {
      return problem(res, req, { status: 401, type: 'authentication' });
    }
    return next();
  }
};

export { oidcTokenRefresh };
