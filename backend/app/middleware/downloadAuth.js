import jwt from 'jsonwebtoken';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';
import db from '../models/index.js';

const { verify } = jwt;
const { service_account: ServiceAccount, user: User, Sequelize } = db;

const validateBasicAuth = async (username, password) => {
  try {
    const serviceAccount = await ServiceAccount.findOne({
      where: {
        username,
        token: password,
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

    return {
      userId: serviceAccount.user.id,
      isServiceAccount: true,
    };
  } catch (err) {
    log.error.error('Error validating basic auth credentials:', err.message);
    return null;
  }
};

const downloadAuth = async (req, res, next) => {
  const authConfig = loadConfig('auth');

  // 1. Check for ?token= query parameter (time-limited JWT download token)
  const downloadToken = req.query.token;
  if (downloadToken) {
    try {
      const decoded = await new Promise((resolve, reject) => {
        verify(downloadToken, authConfig.auth.jwt.jwt_secret.value, (err, decodedToken) => {
          if (err) {
            reject(err);
          } else {
            resolve(decodedToken);
          }
        });
      });
      req.downloadTokenDecoded = decoded;
      req.userId = decoded.userId;
      req.isServiceAccount = decoded.isServiceAccount;
      return next();
    } catch (err) {
      log.app.warn('Invalid download token:', err.message);
      return res.status(403).send({ message: 'Invalid or expired download token.' });
    }
  }

  // 2. Check for Authorization: Basic header (service account credentials)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const encoded = authHeader.substring(6);
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separatorIndex = decoded.indexOf(':');

      if (separatorIndex === -1) {
        return res.status(401).send({ message: 'Invalid basic auth format.' });
      }

      const username = decoded.substring(0, separatorIndex);
      const password = decoded.substring(separatorIndex + 1);

      const authInfo = await validateBasicAuth(username, password);
      if (!authInfo) {
        return res.status(401).send({ message: 'Invalid credentials.' });
      }

      req.userId = authInfo.userId;
      req.isServiceAccount = authInfo.isServiceAccount;
      return next();
    } catch (err) {
      log.app.warn('Error processing basic auth:', err.message);
      return res.status(401).send({ message: 'Invalid credentials.' });
    }
  }

  // 3. Check for Authorization: Bearer header (raw service account token)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
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

      if (serviceAccount && serviceAccount.user) {
        req.userId = serviceAccount.user.id;
        req.isServiceAccount = true;
        return next();
      }
    } catch (err) {
      log.app.warn('Error processing bearer token:', err.message);
    }
  }

  // If no auth provided, continue to controller which handles public access
  return next();
};

export { downloadAuth };
