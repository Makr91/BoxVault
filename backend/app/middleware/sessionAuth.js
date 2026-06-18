import jwt from 'jsonwebtoken';
import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';

const { verify } = jwt;

const sessionAuth = async (req, res, next) => {
  void res;
  const authConfig = loadConfig('auth');
  const token = req.headers['x-access-token'];

  if (token) {
    try {
      const decoded = await new Promise((resolve, reject) => {
        verify(token, authConfig.auth.jwt.jwt_secret.value, (err, decodedToken) => {
          if (err) {
            reject(err);
          } else {
            resolve(decodedToken);
          }
        });
      });
      req.userId = decoded.id;
      req.isServiceAccount = decoded.isServiceAccount || false;
    } catch (err) {
      log.app.debug('Session auth check failed:', { error: err.message });
    }
  }
  next();
};

export { sessionAuth };
