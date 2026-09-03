import { createHash } from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  EmbeddedJWK,
  calculateJwkThumbprint,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
} from 'jose';
import { loadConfig } from './config-loader.js';
import { log } from './Logger.js';
import { verifySessionToken } from './auth.js';
import { findProviderByIssuer } from './oidcProviders.js';
import { getRemoteJwks } from './jwks.js';
import { findServiceAccountByRawToken } from './serviceAccountAuth.js';
import { getOidcConfiguration } from '../auth/passport.js';
import externalUserHandler from '../auth/external-user-handler.js';
import db from '../models/index.js';

const { JsonWebTokenError } = jwt;
const { credential: Credential, user: User } = db;

const AUTHORIZATION_SCHEMES = ['Bearer', 'DPoP'];
const PROOF_MAX_AGE_SECONDS = 60;
const JTI_TTL_MS = 300 * 1000;

const seenProofs = new Map();

const purgeSeenProofs = () => {
  const now = Date.now();
  for (const [jti, expiresAt] of seenProofs) {
    if (expiresAt <= now) {
      seenProofs.delete(jti);
    }
  }
};

/**
 * The credential on the Authorization header, when its scheme is one a
 * BoxVault gate understands.
 * @param {import('express').Request} req - The request
 * @returns {{scheme: string, token: string}|null} The scheme and token, or null
 */
const authorizationCredential = req => {
  const [scheme, ...rest] = (req.headers.authorization || '').split(' ');
  const token = rest.join(' ').trim();
  if (!token || !AUTHORIZATION_SCHEMES.includes(scheme)) {
    return null;
  }
  return { scheme, token };
};

const issuerOf = token => {
  if (token.split('.').length !== 3) {
    return null;
  }
  try {
    return decodeJwt(token).iss || null;
  } catch {
    return null;
  }
};

const htuOf = req => {
  const { origin } = new URL(loadConfig('app').boxvault.origin.value);
  const [path] = req.originalUrl.split('?');
  return `${origin}${path}`;
};

/**
 * Verify a DPoP proof against the request and the token it binds, by the
 * rules the catalog Worker applies.
 * @param {string} proof - The DPoP header value
 * @param {import('express').Request} req - The request the proof covers
 * @param {string} token - The presented access token
 * @param {string} boundJkt - The token's cnf.jkt thumbprint
 * @returns {Promise<void>}
 * @throws {Error} With the reason the proof is refused
 */
const verifyProof = async (proof, req, token, boundJkt) => {
  const header = decodeProtectedHeader(proof);
  if (header.typ !== 'dpop+jwt' || header.alg !== 'ES256') {
    throw new Error('unsupported DPoP proof');
  }
  const { jwk } = header;
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || jwk.d) {
    throw new Error('bad DPoP proof key');
  }
  const { payload } = await jwtVerify(proof, EmbeddedJWK, {
    algorithms: ['ES256'],
    typ: 'dpop+jwt',
  });
  if (payload.htm !== req.method) {
    throw new Error('DPoP htm mismatch');
  }
  if (payload.htu !== htuOf(req)) {
    throw new Error('DPoP htu mismatch');
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.iat !== 'number' || Math.abs(now - payload.iat) > PROOF_MAX_AGE_SECONDS) {
    throw new Error('DPoP proof expired');
  }
  if (payload.ath !== createHash('sha256').update(token).digest('base64url')) {
    throw new Error('DPoP ath mismatch');
  }
  if ((await calculateJwkThumbprint(jwk)) !== boundJkt) {
    throw new Error('DPoP key does not match the token binding');
  }
  if (typeof payload.jti !== 'string' || !payload.jti) {
    throw new Error('DPoP jti required');
  }
  purgeSeenProofs();
  if (seenProofs.has(payload.jti)) {
    throw new Error('DPoP proof replayed');
  }
  seenProofs.set(payload.jti, Date.now() + JTI_TTL_MS);
};

const fetchUserInfo = async (userinfoEndpoint, token, verifiedClaims) => {
  if (!userinfoEndpoint) {
    return verifiedClaims;
  }
  try {
    const response = await axios.get(userinfoEndpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ...verifiedClaims, ...response.data };
  } catch (err) {
    log.auth.warn('Resource-server: userinfo fetch failed, using token claims', {
      error: err.message,
    });
    return verifiedClaims;
  }
};

const resolveExternalUserId = async ({ claims, token, issuer, providerName, meta, authConfig }) => {
  const subject = claims.UUID || claims.sub;
  if (!subject) {
    throw new Error('token carries no subject');
  }
  const credential = await Credential.findByIssuerAndSubject(issuer, subject);
  if (credential) {
    const linkedUser = await User.findByPk(credential.user_id);
    if (!linkedUser || linkedUser.suspended) {
      throw new Error('user missing or suspended');
    }
    if (Array.isArray(claims.organizations)) {
      await externalUserHandler.syncOrganizationsFromClaim(linkedUser, claims, issuer, db);
    }
    return linkedUser.id;
  }
  const profile = await fetchUserInfo(meta.userinfo_endpoint, token, claims);
  const provisionedUser = await externalUserHandler.handleExternalUser(
    `oidc-${providerName}`,
    profile,
    db,
    authConfig
  );
  return provisionedUser.id;
};

const resolveExternalAuth = async (req, { scheme, token }) => {
  const issuer = issuerOf(token);
  const providerName = issuer ? findProviderByIssuer(issuer) : null;
  if (!providerName) {
    return null;
  }
  const authConfig = loadConfig('auth');
  if (!authConfig.auth?.resource_server?.enabled?.value) {
    throw new Error('resource server disabled');
  }
  const audience = authConfig.auth.resource_server.audience?.value;
  if (!audience) {
    throw new Error('auth.resource_server.audience is not configured');
  }
  const oidcConfig = getOidcConfiguration(providerName);
  if (!oidcConfig) {
    throw new Error(`provider ${providerName} not discovered yet`);
  }
  const meta = oidcConfig.serverMetadata();
  const { payload: claims } = await jwtVerify(token, getRemoteJwks(meta.jwks_uri), {
    issuer,
    audience,
  });
  const boundJkt = claims.cnf?.jkt;
  if (scheme === 'Bearer' && boundJkt) {
    throw new Error('key-bound token presented as Bearer');
  }
  if (scheme === 'DPoP') {
    if (!boundJkt) {
      throw new Error('token is not key-bound');
    }
    const proof = req.headers.dpop;
    if (!proof) {
      throw new Error('DPoP proof required');
    }
    await verifyProof(proof, req, token, boundJkt);
  }
  const userId = await resolveExternalUserId({
    claims,
    token,
    issuer,
    providerName,
    meta,
    authConfig,
  });
  log.auth.info('Authenticated via identity-provider token', {
    provider: providerName,
    userId,
    scheme,
  });
  return {
    userId,
    isServiceAccount: false,
    provider: `oidc-${providerName}`,
    oidcAccessToken: token,
    claims,
  };
};

const resolveSessionAuth = async token => {
  try {
    const claims = await verifySessionToken(token);
    return {
      userId: claims.id,
      isServiceAccount: claims.isServiceAccount || false,
      serviceAccountId: claims.serviceAccountId,
      stayLoggedIn: claims.stayLoggedIn,
      organizations: claims.organizations,
      claims,
    };
  } catch (err) {
    if (!(err instanceof JsonWebTokenError)) {
      throw err;
    }
    log.auth.debug('Session token rejected', { error: err.message });
    return null;
  }
};

/**
 * Resolve the caller behind a request's credentials, in order: the BoxVault
 * session JWT on x-access-token; an access token of a configured identity
 * provider on Authorization, as Bearer or, when key-bound, as DPoP with a
 * proof; a raw service-account key on Authorization: Bearer or x-access-token.
 * A refused credential logs its reason and resolves to null.
 * @param {import('express').Request} req - The request
 * @param {{sessionOnly?: boolean}} [options] - sessionOnly accepts the session JWT alone
 * @returns {Promise<{userId: number, isServiceAccount: boolean, serviceAccountId?: number,
 *   stayLoggedIn?: boolean, organizations?: Object[], provider?: string,
 *   oidcAccessToken?: string, claims?: Object}|null>} The caller, or null
 * @throws {Error} When the configuration cannot be loaded
 */
const resolveRequestAuth = async (req, { sessionOnly = false } = {}) => {
  const sessionToken = req.headers['x-access-token'];
  if (sessionToken) {
    const session = await resolveSessionAuth(sessionToken);
    if (session) {
      return session;
    }
  }
  if (sessionOnly) {
    return null;
  }
  const credential = authorizationCredential(req);
  if (credential) {
    try {
      const external = await resolveExternalAuth(req, credential);
      if (external) {
        return external;
      }
    } catch (err) {
      log.auth.info('Identity-provider token refused', { error: err.message });
      return null;
    }
  }
  const rawKeys = [credential?.scheme === 'Bearer' ? credential.token : null, sessionToken].filter(
    Boolean
  );
  const accounts = await Promise.all(rawKeys.map(rawKey => findServiceAccountByRawToken(rawKey)));
  const serviceAccount = accounts.find(Boolean);
  if (!serviceAccount) {
    return null;
  }
  return {
    userId: serviceAccount.userId,
    isServiceAccount: true,
    serviceAccountId: serviceAccount.id,
  };
};

export { authorizationCredential, resolveRequestAuth };
