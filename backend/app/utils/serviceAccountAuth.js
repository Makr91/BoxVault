// serviceAccountAuth.js
// Shared optional-auth helper for raw service-account API keys.
// Tokens are stored at rest as sha256 hex hashes — every lookup hashes the
// presented raw token first. Validation matches vagrantHandler: hash match,
// expiresAt in the future OR null (never expires).
import { createHash } from 'crypto';
import db from '../models/index.js';
import { log } from './Logger.js';
const { service_account: ServiceAccount, user: User, Sequelize } = db;

export const hashServiceAccountToken = token => createHash('sha256').update(token).digest('hex');

export const extractBearerToken = req => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

/**
 * Stamp last_used_at on a service account whose raw key or JWT was just
 * accepted. A stamp that cannot be written is logged and never refuses the
 * request.
 * @param {number} id - Service account id
 * @returns {Promise<void>}
 */
export const touchServiceAccount = async id => {
  try {
    await ServiceAccount.update({ last_used_at: new Date() }, { where: { id } });
  } catch (err) {
    log.auth.warn('Service account last_used_at not recorded', { id, error: err.message });
  }
};

export const findServiceAccountByRawToken = async token => {
  if (!token) {
    return null;
  }

  const serviceAccount = await ServiceAccount.findOne({
    where: {
      token: hashServiceAccountToken(token),
      expiresAt: {
        [Sequelize.Op.or]: {
          [Sequelize.Op.gt]: new Date(),
          [Sequelize.Op.eq]: null,
        },
      },
    },
    include: [
      {
        model: User,
        as: 'user',
      },
    ],
  });

  if (!serviceAccount || !serviceAccount.user) {
    return null;
  }

  // Service accounts impersonate their owning user — a suspended owner
  // invalidates every raw API key they own.
  if (serviceAccount.user.suspended) {
    return null;
  }

  await touchServiceAccount(serviceAccount.id);

  return serviceAccount;
};
