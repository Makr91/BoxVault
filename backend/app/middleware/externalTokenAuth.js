import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import axios from 'axios';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';
import { getOidcConfiguration } from '../auth/passport.js';
import externalUserHandler from '../auth/external-user-handler.js';
import db from '../models/index.js';

const { credential: Credential, user: User } = db;

/**
 * Resource-server authentication (Track A).
 *
 * Lets a client (e.g. a desktop app) present an access token minted by one of
 * BoxVault's configured OIDC providers as `Authorization: Bearer <token>` and be
 * authenticated as the matching BoxVault user — no manually-generated API key.
 *
 * This is deliberately separate from BoxVault's own internal HS256 JWT
 * (validated in sessionAuth/authJwt via the local jwt_secret). Here we validate
 * a THIRD-PARTY RS256 token against the issuing auth-server's published JWKS.
 *
 * Ordering: runs after downloadAuth (which consumes service-account tokens and
 * falls through on a miss) and before sessionAuth. It never errors on a miss —
 * it calls next() so public-box access and other auth paths still work.
 */

// Cache one JWKS key set per jwks_uri. createRemoteJWKSet handles its own
// key-fetch caching and rotation, so we only need to avoid rebuilding it.
const jwksByUri = new Map();

const getJwks = jwksUri => {
  if (!jwksByUri.has(jwksUri)) {
    jwksByUri.set(jwksUri, createRemoteJWKSet(new URL(jwksUri)));
  }
  return jwksByUri.get(jwksUri);
};

/**
 * Fetch the userinfo profile for a freshly-validated access token. Only used
 * when minting/linking a user for the first time — existing users resolve from
 * the credential table without a network call.
 * @param {string} userinfoEndpoint
 * @param {string} token - The validated access token
 * @param {Object} verifiedClaims - Already-verified JWT payload (fallback)
 * @returns {Promise<Object>} Profile claims for handleExternalUser
 */
const fetchUserInfo = async (userinfoEndpoint, token, verifiedClaims) => {
  if (!userinfoEndpoint) {
    return verifiedClaims;
  }

  try {
    const response = await axios.get(userinfoEndpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Merge: userinfo is authoritative, verified claims fill any gaps.
    return { ...verifiedClaims, ...response.data };
  } catch (err) {
    log.auth.warn('Resource-server: userinfo fetch failed, using token claims', {
      error: err.message,
    });
    return verifiedClaims;
  }
};

/**
 * Resolve the enabled OIDC provider whose configured issuer matches the token.
 * @param {Object} providersConfig - authConfig.auth.oidc.providers
 * @param {string} issuer - `iss` from the token
 * @returns {string|null} Provider name or null
 */
const findProviderByIssuer = (providersConfig, issuer) =>
  Object.keys(providersConfig).find(
    name => providersConfig[name]?.enabled?.value && providersConfig[name]?.issuer?.value === issuer
  ) || null;

const externalTokenAuth = async (req, res, next) => {
  void res;

  // Already authenticated by an earlier middleware (service account, etc.) — leave it.
  if (req.userId) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.substring(7);

  const authConfig = loadConfig('auth');
  if (!authConfig.auth?.resource_server?.enabled?.value) {
    return next();
  }

  // Opaque service-account tokens are not JWTs; only 3-segment tokens are ours to try.
  if (token.split('.').length !== 3) {
    return next();
  }

  let unverified;
  try {
    unverified = decodeJwt(token);
  } catch {
    return next();
  }

  const issuer = unverified.iss;
  if (!issuer) {
    return next();
  }

  const providersConfig = authConfig.auth?.oidc?.providers || {};
  const providerName = findProviderByIssuer(providersConfig, issuer);
  if (!providerName) {
    return next();
  }

  const oidcConfig = getOidcConfiguration(providerName);
  if (!oidcConfig) {
    log.auth.warn('Resource-server: OIDC provider not discovered yet', { providerName });
    return next();
  }

  const meta = oidcConfig.serverMetadata();
  const audience = authConfig.auth.resource_server.audience?.value;

  let claims;
  try {
    const { payload } = await jwtVerify(token, getJwks(meta.jwks_uri), {
      issuer,
      audience: audience || undefined,
    });
    claims = payload;
  } catch (err) {
    log.auth.debug('Resource-server: token validation failed', { error: err.message });
    return next();
  }

  // Map on the stable custom UUID claim (never reassigned), falling back to sub
  // for generic OIDC providers that do not emit one. Matches handleExternalUser.
  const subject = claims.UUID || claims.sub;
  if (!subject) {
    return next();
  }

  try {
    const credential = await Credential.findByProviderAndSubject('oidc', subject);

    let userId;
    if (credential) {
      userId = credential.user_id;
      if (Array.isArray(claims.organizations)) {
        const user = await User.findByPk(userId);
        if (user) {
          await externalUserHandler.syncOrganizationsFromClaim(user, claims, issuer, db);
        }
      }
    } else {
      // First contact for this subject — mint/link via the same provisioning
      // path the browser OIDC callback uses. Needs a full profile (email, name).
      const profile = await fetchUserInfo(meta.userinfo_endpoint, token, claims);
      const user = await externalUserHandler.handleExternalUser(
        `oidc-${providerName}`,
        profile,
        db,
        authConfig
      );
      if (!user) {
        return next();
      }
      userId = user.id;
    }

    req.userId = userId;
    req.isServiceAccount = false;
    req.authProvider = `oidc-${providerName}`;
    req.oidcAccessToken = token;

    log.auth.info('Resource-server: authenticated via external token', {
      provider: providerName,
      userId,
    });

    return next();
  } catch (err) {
    log.error.error('Resource-server: user resolution failed', {
      error: err.message,
      stack: err.stack,
    });
    return next();
  }
};

export { externalTokenAuth };
