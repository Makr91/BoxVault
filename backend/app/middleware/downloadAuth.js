import { log } from '../utils/Logger.js';
import {
  findServiceAccountByRawToken,
  hashServiceAccountToken,
} from '../utils/serviceAccountAuth.js';
import { verifyDownloadToken } from '../utils/auth.js';
import db from '../models/index.js';

const { service_account: ServiceAccount, user: User, Sequelize } = db;

const validateBasicAuth = async (username, password) => {
  try {
    // Tokens are stored as sha256 hashes — hash the presented password first
    const serviceAccount = await ServiceAccount.findOne({
      where: {
        username,
        token: hashServiceAccountToken(password || ''),
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

    // Service accounts impersonate their owning user — surface suspension so
    // the caller can reject with the proper message.
    if (serviceAccount.user.suspended) {
      return { suspended: true };
    }

    return {
      userId: serviceAccount.user.id,
      isServiceAccount: true,
      serviceAccountId: serviceAccount.id,
    };
  } catch (err) {
    log.error.error('Error validating basic auth credentials:', err.message);
    return null;
  }
};

const downloadAuth = async (req, res, next) => {
  // 1. Check for ?token= query parameter (time-limited JWT download token).
  // verifyDownloadToken enforces signature, issuer/audience, and the
  // type:'download' claim — ordinary session JWTs are rejected here.
  const downloadToken = req.query.token;
  if (downloadToken) {
    try {
      const decoded = await verifyDownloadToken(downloadToken);
      // Suspended users may not redeem download tokens
      if (decoded.userId) {
        const tokenUser = await User.findByPk(decoded.userId);
        if (tokenUser?.suspended) {
          return res.status(403).send({ message: req.__('auth.accountSuspended') });
        }
      }

      req.downloadTokenDecoded = decoded;
      req.userId = decoded.userId;
      req.isServiceAccount = decoded.isServiceAccount;
      return next();
    } catch {
      // Already logged by verifyDownloadToken
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

      if (authInfo.suspended) {
        return res.status(403).send({ message: req.__('auth.accountSuspended') });
      }

      req.userId = authInfo.userId;
      req.isServiceAccount = authInfo.isServiceAccount;
      req.serviceAccountId = authInfo.serviceAccountId;
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
      const serviceAccount = await findServiceAccountByRawToken(token);

      if (serviceAccount) {
        // Service accounts impersonate their owning user
        req.userId = serviceAccount.user.id;
        req.isServiceAccount = true;
        req.serviceAccountId = serviceAccount.id;
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
