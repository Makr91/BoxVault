import { log } from './Logger.js';
import { resolveRequestAuth } from './requestAuth.js';
import { resolveViewer } from './orgMembership.js';

/**
 * Resolve the signed-in BoxVault caller behind a request's credentials for the
 * optional-auth discover routes: the session JWT, an identity-provider token
 * or a service-account key, by the one request-auth rule.
 *
 * @param {import('express').Request} req - The request carrying the credentials.
 * @returns {Promise<{userId: number, isServiceAccount: boolean, orgIds: number[], managedOrgIds: number[]}|null>}
 *   The viewer of resolveViewer, or null when no credential resolves; a
 *   refused credential never errors, it only leaves the caller on the
 *   anonymous public-only view.
 */
export const resolveJwtUser = async req => {
  try {
    const auth = await resolveRequestAuth(req);
    if (!auth) {
      return null;
    }
    return await resolveViewer(auth);
  } catch (err) {
    log.error.error(`Failed to resolve the request user: ${err.message}`);
    return null;
  }
};
