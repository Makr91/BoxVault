const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');
const jwt = require('jsonwebtoken');

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

const boxAuth = (req, res, next) => {
  void res;
  if (req.userId) {
    return next();
  }

  const token = req.headers['x-access-token'];

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
    req.userId = decoded.id;
    req.isServiceAccount = decoded.isServiceAccount || false;
  } catch (err) {
    log.app.debug('boxAuth: Invalid token, continuing without auth', {
      error: err.message,
    });
  }

  return next();
};

module.exports = { boxAuth };
