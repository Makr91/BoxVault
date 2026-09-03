import { log } from './Logger.js';
import db from '../models/index.js';
import { resolveRequestAuth } from './requestAuth.js';

const { UserOrg } = db;

/**
 * Resolve the signed-in BoxVault user behind a request's credentials for the
 * optional-auth discover routes: the session JWT, an identity-provider token
 * or a service-account key, by the one request-auth rule.
 *
 * @param {import('express').Request} req - The request carrying the credentials.
 * @returns {Promise<{userId: number, orgIds: number[]}|null>} The user id and
 *   the ids of every organization the user is a member of, or null when no
 *   credential resolves; a refused credential never errors, it only leaves the
 *   caller on the anonymous public-only view.
 */
export const resolveJwtUser = async req => {
  try {
    const auth = await resolveRequestAuth(req);
    if (!auth) {
      return null;
    }
    const memberships = await UserOrg.getUserOrganizations(auth.userId);
    return {
      userId: auth.userId,
      orgIds: memberships.map(membership => membership.organization_id),
    };
  } catch (err) {
    log.error.error(`Failed to resolve the request user: ${err.message}`);
    return null;
  }
};
