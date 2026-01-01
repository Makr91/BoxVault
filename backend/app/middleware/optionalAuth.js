const jwt = require('jsonwebtoken');
const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

const optionalAuth = (req, res, next) => {
  void res;
  const token = req.headers['x-access-token'];

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
    req.userId = decoded.id;
    req.isServiceAccount = decoded.isServiceAccount || false;
  } catch (err) {
    log.app.debug('Optional auth: Invalid token, continuing without auth', {
      error: err.message,
    });
  }

  return next();
};

module.exports = { optionalAuth };
