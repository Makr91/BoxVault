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

const verifyDownloadToken = token => {
  try {
    return jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
  } catch (err) {
    log.app.warn('Invalid download token:', err.message);
    throw err;
  }
};

const generateDownloadToken = (payload, expiresIn = '1h') =>
  jwt.sign(payload, authConfig.auth.jwt.jwt_secret.value, { expiresIn });

module.exports = { checkSessionAuth, verifyDownloadToken, generateDownloadToken };
