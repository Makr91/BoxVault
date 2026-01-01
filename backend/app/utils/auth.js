const jwt = require('jsonwebtoken');
const { loadConfig } = require('./config-loader');
const { log } = require('./Logger');

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

const checkSessionAuth = req => {
  const token = req.headers['x-access-token'];

  if (!token) {
    return false;
  }

  try {
    const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
    req.userId = decoded.id;
    req.isServiceAccount = decoded.isServiceAccount || false;
    return true;
  } catch (err) {
    log.app.debug('Session auth check failed:', { error: err.message });
    return false;
  }
};

module.exports = { checkSessionAuth };
