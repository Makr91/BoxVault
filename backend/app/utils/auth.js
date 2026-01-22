import jwt from 'jsonwebtoken';
import { loadConfig } from './config-loader.js';
import { log } from './Logger.js';

const { verify, sign } = jwt;

const checkSessionAuth = async req => {
  const authConfig = loadConfig('auth');
  const token = req.headers['x-access-token'];

  if (!token) {
    return false;
  }

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
    return true;
  } catch (err) {
    log.app.debug('Session auth check failed:', { error: err.message });
    return false;
  }
};

const verifyDownloadToken = async token => {
  const authConfig = loadConfig('auth');
  try {
    return await new Promise((resolve, reject) => {
      verify(token, authConfig.auth.jwt.jwt_secret.value, (err, decodedToken) => {
        if (err) {
          reject(err);
        } else {
          resolve(decodedToken);
        }
      });
    });
  } catch (err) {
    log.app.warn('Invalid download token:', err.message);
    throw err;
  }
};

const generateDownloadToken = (payload, expiresIn = '1h') => {
  const authConfig = loadConfig('auth');
  return sign(payload, authConfig.auth.jwt.jwt_secret.value, { expiresIn });
};

export { checkSessionAuth, verifyDownloadToken, generateDownloadToken };
