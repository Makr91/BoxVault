import jwt from 'jsonwebtoken';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';

const { verify } = jwt;

const downloadAuth = async (req, res, next) => {
  const authConfig = loadConfig('auth');
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
  // If no token, continue to controller which handles other auth methods
  return next();
};

export { downloadAuth };
