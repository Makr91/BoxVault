import jwt from 'jsonwebtoken';
import configLoader from './config-loader.js';
import { log } from './Logger.js';
import db from '../models/index.js';

const { UserOrg } = db;
const { verify } = jwt;

/**
 * Resolve the signed-in BoxVault user behind an x-access-token JWT for the
 * optional-auth discover routes.
 *
 * @param {import('express').Request} req - The request carrying the header.
 * @returns {Promise<{userId: number, orgIds: number[]}|null>} The user id and
 *   the ids of every organization the user is a member of, or null when the
 *   header is missing or the token does not verify; an invalid token never
 *   errors, it only leaves the caller on the anonymous public-only view.
 */
export const resolveJwtUser = async req => {
  const token = req.headers['x-access-token'];
  if (!token) {
    return null;
  }

  let authConfig;
  try {
    authConfig = configLoader.loadConfig('auth');
  } catch (e) {
    log.error.error(`Failed to load auth configuration: ${e.message}`);
    return null;
  }

  try {
    const decoded = verify(token, authConfig.auth.jwt.jwt_secret.value);
    const memberships = await UserOrg.getUserOrganizations(decoded.id);
    return {
      userId: decoded.id,
      orgIds: memberships.map(membership => membership.organization_id),
    };
  } catch {
    return null;
  }
};
