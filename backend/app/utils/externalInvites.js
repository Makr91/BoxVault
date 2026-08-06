// externalInvites.js — delegation caller for the auth server's org-invite API.
//
// Customer orgs (external_issuer set) are IdP-truth only: their invites live on
// the auth server, never in BoxVault's invitations table. BoxVault calls
// POST/GET/DELETE {issuer}/api/org/invites with a client_credentials token
// (scope org:invite) minted for a DEDICATED service-to-service client
// (auth.oidc.s2s_client_id / s2s_client_secret knobs — NOT the main login
// client) against the issuer's standard token endpoint. The invite token
// itself is never returned by their API.
import axios from 'axios';
import { loadConfig } from './config-loader.js';
import { log } from './Logger.js';
import { findProviderByIssuer } from './oidcProviders.js';
import { getOidcConfiguration } from '../auth/passport.js';
import db from '../models/index.js';

const INVITE_SCOPE = 'org:invite';

// Fallbacks only for missing/malformed knobs — the real values live in the
// auth YAML (auth.oidc.s2s_client_id / s2s_client_secret).
const DEFAULT_S2S_CLIENT_ID = 'boxvault_s2s';

// `issuer scope` -> { token, expiresAt } (ms epoch). Tokens are short-lived;
// refresh with a small safety margin instead of per-request round-trips.
const tokenCache = new Map();
const EXPIRY_MARGIN_MS = 30 * 1000;

/**
 * Get (or mint) a client_credentials access token for the auth server behind
 * the given issuer, using the dedicated s2s client credentials against the
 * issuer's standard token endpoint. The scope is always sent explicitly and
 * tokens are cached per (issuer, scope) pair.
 * @param {string} issuer - The org's external_issuer
 * @param {string} scope - OAuth scope to request (e.g. org:invite)
 * @returns {Promise<string>} Bearer access token carrying the requested scope
 * @throws {Error} When no enabled provider matches or the grant fails
 */
const getS2sToken = async (issuer, scope) => {
  const cacheKey = `${issuer} ${scope}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return cached.token;
  }

  const providerName = findProviderByIssuer(issuer);
  if (!providerName) {
    throw new Error(`No enabled OIDC provider configured for issuer ${issuer}`);
  }

  const oidcConfig = getOidcConfiguration(providerName);
  if (!oidcConfig) {
    throw new Error(`OIDC provider ${providerName} has not completed discovery yet`);
  }

  const authConfig = loadConfig('auth');
  const clientId = authConfig.auth?.oidc?.s2s_client_id?.value || DEFAULT_S2S_CLIENT_ID;
  const clientSecret = authConfig.auth?.oidc?.s2s_client_secret?.value;
  if (!clientSecret) {
    throw new Error(
      'auth.oidc.s2s_client_secret is not configured; cannot mint service-to-service tokens'
    );
  }

  const tokenEndpoint = oidcConfig.serverMetadata().token_endpoint;
  const response = await axios.post(
    tokenEndpoint,
    new URLSearchParams({ grant_type: 'client_credentials', scope }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: clientId, password: clientSecret },
    }
  );

  const expiresInSeconds = Number(response.data?.expires_in) || 60;
  tokenCache.set(cacheKey, {
    token: response.data.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  });

  log.auth.info('S2S delegation: minted client_credentials token', {
    provider: providerName,
    clientId,
    scope,
    expiresInSeconds,
  });
  return response.data.access_token;
};

/**
 * Base URL of the auth server's org-invite API for an issuer.
 * @param {string} issuer
 * @returns {string}
 */
const inviteApiBase = issuer => `${issuer.replace(/\/+$/, '')}/api/org/invites`;

/**
 * Resolve a BoxVault user's auth-server UUID from their issuer-scoped
 * credential (the subject IS their UUID at that issuer). Pre-issuer rows
 * stored under the flat 'oidc' provider are claimed for the issuer via the
 * model's lazy backfill. Purely-local users have no credential -> null, and
 * the auth server's own 400 surfaces to the caller.
 * @param {number} userId - BoxVault user id of the inviter/approver
 * @param {string} issuer - The org's external_issuer
 * @returns {Promise<string|null>} Auth-server user UUID or null
 */
const resolveInviterUuid = async (userId, issuer) => {
  const { credential: Credential } = db;
  const credential = await Credential.findOne({ where: { user_id: userId, provider: issuer } });
  if (credential) {
    return credential.subject;
  }

  const flat = await Credential.findOne({ where: { user_id: userId, provider: 'oidc' } });
  if (flat) {
    const backfilled = await Credential.findByIssuerAndSubject(issuer, flat.subject);
    return backfilled ? backfilled.subject : null;
  }

  return null;
};

/**
 * Create an invite on the auth server for an externally-managed org.
 * Their 500-after-email-failure is retry-safe: re-POSTing replaces the pending
 * invite for the same address.
 * @param {Object} organization - BoxVault org (external_issuer + external_org_id set)
 * @param {string} email - Invitee email
 * @param {string} role - Auth-server role, lowercase (member|admin)
 * @param {string|null} invitedByUserUuid - Auth-server UUID of the inviting
 *   user (their API requires it; null lets their 400 surface for purely-local
 *   admins with no credential at this issuer)
 * @returns {Promise<Object>} Their invite record ({ invite_id, status, expires_at, ... })
 */
const createExternalInvite = async (organization, email, role, invitedByUserUuid) => {
  const issuer = organization.external_issuer;
  const token = await getS2sToken(issuer, INVITE_SCOPE);
  const response = await axios.post(
    inviteApiBase(issuer),
    {
      email,
      org_uuid: organization.external_org_id,
      role,
      invited_by_user_uuid: invitedByUserUuid,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

/**
 * List the auth server's invites for an externally-managed org. Records come
 * back with UPPERCASE status enums and without created_at; accepted_at and
 * invited_by_user_uuid are conditional — callers must map defensively.
 * @param {Object} organization - BoxVault org (external_issuer + external_org_id set)
 * @returns {Promise<Object[]>} Their invite records
 */
const listExternalInvites = async organization => {
  const issuer = organization.external_issuer;
  const token = await getS2sToken(issuer, INVITE_SCOPE);
  const response = await axios.get(inviteApiBase(issuer), {
    params: { org_uuid: organization.external_org_id },
    headers: { Authorization: `Bearer ${token}` },
  });
  const { data } = response;
  if (Array.isArray(data)) {
    return data;
  }
  return Array.isArray(data?.invites) ? data.invites : [];
};

/**
 * Delete an invite on the auth server. Their API requires the org_uuid query
 * parameter alongside the invite id; success is 204, a missing invite is
 * 404 {error:'not_found'}.
 * @param {Object} organization - BoxVault org (external_issuer + external_org_id set)
 * @param {string} inviteId - The auth server's invite_id
 * @returns {Promise<void>}
 */
const deleteExternalInvite = async (organization, inviteId) => {
  const issuer = organization.external_issuer;
  const token = await getS2sToken(issuer, INVITE_SCOPE);
  await axios.delete(`${inviteApiBase(issuer)}/${encodeURIComponent(inviteId)}`, {
    params: { org_uuid: organization.external_org_id },
    headers: { Authorization: `Bearer ${token}` },
  });
};

export {
  getS2sToken,
  createExternalInvite,
  listExternalInvites,
  deleteExternalInvite,
  resolveInviterUuid,
};
