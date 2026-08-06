// oidcProviders.js — shared issuer -> configured-OIDC-provider resolution.
//
// One implementation for every consumer that must map an issuer URL (a token's
// iss claim or an org's external_issuer) back to the enabled provider entry in
// the auth YAML: the resource-server middleware, the SCIM receiver gate, and
// the org-invite delegation caller.
import { loadConfig } from './config-loader.js';

/**
 * Resolve the enabled OIDC provider name whose configured issuer matches.
 * @param {string} issuer - Issuer URL (`iss` claim or org external_issuer)
 * @returns {string|null} Provider name or null
 */
const findProviderByIssuer = issuer => {
  const providersConfig = loadConfig('auth').auth?.oidc?.providers || {};
  return (
    Object.keys(providersConfig).find(
      name =>
        providersConfig[name]?.enabled?.value && providersConfig[name]?.issuer?.value === issuer
    ) || null
  );
};

export { findProviderByIssuer };
