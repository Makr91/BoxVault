// externalInvites.js — delegation caller for the auth server's org-invite API.
//
// Customer orgs (external_issuer set) are IdP-truth only: their invites live on
// the auth server, never in BoxVault's invitations table. Invite actions are
// human actions (contract v2 Mode B): BoxVault calls POST/GET/DELETE
// {issuer}/api/org/invites with the ACTING USER's own OIDC access token — the
// auth server derives the actor from the token and enforces membership + role
// server-side. The invite token itself is never returned by their API.
// getS2sToken stays for genuinely machine-initiated work (notification
// producers), minted for the DEDICATED service-to-service client
// (auth.oidc.s2s_client_id / s2s_client_secret knobs — NOT the login client).
import axios from 'axios';
import { loadConfig } from './config-loader.js';
import { log } from './Logger.js';
import { findProviderByIssuer } from './oidcProviders.js';
import { getOidcConfiguration } from '../auth/passport.js';

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
 * Create an invite on the auth server for an externally-managed org as the
 * acting user. Their 500-after-email-failure is retry-safe: re-POSTing
 * replaces the pending invite for the same address.
 * @param {Object} organization - BoxVault org (external_issuer + external_org_id set)
 * @param {string} email - Invitee email
 * @param {string} role - Auth-server role, lowercase (member|admin)
 * @param {string} oidcAccessToken - The acting user's OIDC access token
 * @returns {Promise<Object>} Their invite record ({ invite_id, status, expires_at, ... })
 */
const createExternalInvite = async (organization, email, role, oidcAccessToken) => {
  const issuer = organization.external_issuer;
  const response = await axios.post(
    inviteApiBase(issuer),
    {
      email,
      org_uuid: organization.external_org_id,
      role,
    },
    { headers: { Authorization: `Bearer ${oidcAccessToken}` } }
  );
  return response.data;
};

/**
 * List the auth server's invites for an externally-managed org as the acting
 * user. Records come back with UPPERCASE status enums and without created_at;
 * accepted_at and invited_by_user_uuid are conditional — callers must map
 * defensively.
 * @param {Object} organization - BoxVault org (external_issuer + external_org_id set)
 * @param {string} oidcAccessToken - The acting user's OIDC access token
 * @returns {Promise<Object[]>} Their invite records
 */
const listExternalInvites = async (organization, oidcAccessToken) => {
  const issuer = organization.external_issuer;
  const response = await axios.get(inviteApiBase(issuer), {
    params: { org_uuid: organization.external_org_id },
    headers: { Authorization: `Bearer ${oidcAccessToken}` },
  });
  const { data } = response;
  if (Array.isArray(data)) {
    return data;
  }
  return Array.isArray(data?.invites) ? data.invites : [];
};

/**
 * Delete an invite on the auth server as the acting user. Their API requires
 * the org_uuid query parameter alongside the invite id; success is 204, a
 * missing invite is 404 {error:'not_found'}.
 * @param {Object} organization - BoxVault org (external_issuer + external_org_id set)
 * @param {string} inviteId - The auth server's invite_id
 * @param {string} oidcAccessToken - The acting user's OIDC access token
 * @returns {Promise<void>}
 */
const deleteExternalInvite = async (organization, inviteId, oidcAccessToken) => {
  const issuer = organization.external_issuer;
  await axios.delete(`${inviteApiBase(issuer)}/${encodeURIComponent(inviteId)}`, {
    params: { org_uuid: organization.external_org_id },
    headers: { Authorization: `Bearer ${oidcAccessToken}` },
  });
};

export { getS2sToken, createExternalInvite, listExternalInvites, deleteExternalInvite };
