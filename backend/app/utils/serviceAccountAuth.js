// serviceAccountAuth.js
// Shared optional-auth helper for raw service-account API keys.
// Validation matches vagrantHandler: token match, expiresAt in the future OR null (never expires).
import db from '../models/index.js';
const { service_account: ServiceAccount, user: User, Sequelize } = db;

export const extractBearerToken = req => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

export const findServiceAccountByRawToken = async token => {
  if (!token) {
    return null;
  }

  const serviceAccount = await ServiceAccount.findOne({
    where: {
      token,
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

  return serviceAccount;
};
