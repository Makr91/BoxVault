import { jwtVerify, decodeJwt } from 'jose';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';
import { findProviderByIssuer } from '../utils/oidcProviders.js';
import { getRemoteJwks } from '../utils/jwks.js';
import { getOidcConfiguration } from '../auth/passport.js';

/**
 * SCIM receiver authentication.
 *
 * Every SCIM push from the auth server carries a short-lived RS256 bearer JWT
 * minted for BoxVault (aud from the auth.scim.audience knob, default
 * "boxvault"). The token is validated against the issuing provider's published
 * JWKS — the same third-party-token pattern as the resource-server middleware
 * (externalTokenAuth), except this gate REJECTS on any miss instead of falling
 * through: /scim/v2 has no anonymous or alternative auth path.
 */

/**
 * Send a SCIM-shaped error response (RFC 7644 §3.12): the Error message
 * schema, "status" as a string, an optional scimType keyword (MUST be
 * "uniqueness" on duplicate-resource 409s per §3.3), and the SCIM media type.
 * @param {Object} res - Express response
 * @param {number} status - HTTP status code
 * @param {string} detail - Human-readable error detail
 * @param {string|null} scimType - SCIM detail error keyword (RFC 7644 §3.12)
 * @returns {Object} The response
 */
const scimError = (res, status, detail, scimType = null) =>
  res
    .status(status)
    .type('application/scim+json')
    .json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      ...(scimType ? { scimType } : {}),
      status: String(status),
      detail,
    });

const scimAuth = async (req, res, next) => {
  const authConfig = loadConfig('auth');

  if (!authConfig.auth?.scim?.enabled?.value) {
    return scimError(res, 403, 'SCIM provisioning is disabled on this BoxVault instance');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return scimError(res, 401, 'Missing bearer token');
  }
  const token = authHeader.substring(7);

  if (token.split('.').length !== 3) {
    return scimError(res, 401, 'Malformed bearer token');
  }

  let unverified;
  try {
    unverified = decodeJwt(token);
  } catch {
    return scimError(res, 401, 'Malformed bearer token');
  }

  const issuer = unverified.iss;
  if (!issuer) {
    return scimError(res, 401, 'Token carries no issuer');
  }

  const providerName = findProviderByIssuer(issuer);
  if (!providerName) {
    log.auth.warn('SCIM: token issuer matches no enabled OIDC provider', { issuer });
    return scimError(res, 401, 'Unknown token issuer');
  }

  const oidcConfig = getOidcConfiguration(providerName);
  if (!oidcConfig) {
    // Discovery has not completed (e.g. auth server unreachable at boot) —
    // 503 so the auth server's outbox retry machinery tries again later.
    log.auth.warn('SCIM: OIDC provider not discovered yet', { providerName });
    return scimError(res, 503, 'Identity provider metadata not available yet');
  }

  const audience = authConfig.auth.scim.audience?.value;
  if (!audience) {
    // Refuse to validate without an audience: skipping the aud check would
    // accept tokens minted for any other client at this issuer.
    log.auth.warn('SCIM: auth.scim.audience is not configured; refusing request');
    return scimError(res, 403, 'SCIM audience is not configured');
  }

  try {
    await jwtVerify(token, getRemoteJwks(oidcConfig.serverMetadata().jwks_uri), {
      issuer,
      audience,
    });
  } catch (err) {
    log.auth.info('SCIM: token validation failed', { error: err.message });
    return scimError(res, 401, 'Invalid or expired token');
  }

  req.scimIssuer = issuer;
  return next();
};

export { scimAuth, scimError };
