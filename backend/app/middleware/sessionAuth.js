const jwt = require('jsonwebtoken');
const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

const sessionAuth = async (req, res, next) => {
  void res;
  const token = req.headers['x-access-token'];

  if (token) {
    try {
      const decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, authConfig.auth.jwt.jwt_secret.value, (err, decodedToken) => {
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

module.exports = { sessionAuth };
