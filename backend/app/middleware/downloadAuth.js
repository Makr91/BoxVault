const jwt = require('jsonwebtoken');
const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

const downloadAuth = async (req, res, next) => {
  const downloadToken = req.query.token;
  if (downloadToken) {
    try {
      const decoded = await new Promise((resolve, reject) => {
        jwt.verify(downloadToken, authConfig.auth.jwt.jwt_secret.value, (err, decodedToken) => {
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

module.exports = { downloadAuth };
