import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { loadConfig, saveConfig } from './config-loader.js';
import { log } from './Logger.js';

const { verify, sign } = jwt;

/**
 * Write a random 64-character JWT secret into auth.config.yaml when none is
 * configured, as the service user, through the engine.
 * @returns {Promise<boolean>} True when a secret was written
 */
const ensureJwtSecret = async () => {
  const current = loadConfig('auth').auth.jwt.jwt_secret;
  if (typeof current === 'string' && current.trim() !== '') {
    return false;
  }
  await saveConfig(
    'auth',
    { auth: { jwt: { jwt_secret: randomBytes(32).toString('hex') } } },
    'boxvault'
  );
  log.app.info('Generated auth.jwt.jwt_secret');
  return true;
};

// Issuer/audience claims stamped on every BoxVault-minted JWT and enforced on
// every verification of our own tokens. Foreign OIDC access tokens are
// validated separately (externalTokenAuth) with their own audience config.
const getJwtClaimOptions = () => {
  const authConfig = loadConfig('auth');
  return {
    issuer: authConfig.auth.jwt.jwt_issuer || 'boxvault',
    audience: authConfig.auth.jwt.jwt_audience || 'boxvault-api',
  };
};

// Single implementation of BoxVault JWT verification (signature + issuer/audience).
// Every consumer of our own tokens (sessionAuth middleware, download tokens)
// decodes through here. Rejects on any verification failure.
const verifySessionToken = token => {
  const authConfig = loadConfig('auth');
  return new Promise((resolve, reject) => {
    verify(token, authConfig.auth.jwt.jwt_secret, getJwtClaimOptions(), (err, decodedToken) => {
      if (err) {
        reject(err);
      } else {
        resolve(decodedToken);
      }
    });
  });
};

const verifyDownloadToken = async token => {
  try {
    const decoded = await verifySessionToken(token);

    // Only tokens minted for downloads may be redeemed as download tokens
    if (decoded.type !== 'download') {
      throw new Error('Not a download token');
    }

    return decoded;
  } catch (err) {
    log.app.warn('Invalid download token:', err.message);
    throw err;
  }
};

const generateDownloadToken = (payload, expiresIn = '1h') => {
  const authConfig = loadConfig('auth');
  return sign({ ...payload, type: 'download' }, authConfig.auth.jwt.jwt_secret, {
    expiresIn,
    ...getJwtClaimOptions(),
  });
};

export {
  ensureJwtSecret,
  verifySessionToken,
  verifyDownloadToken,
  generateDownloadToken,
  getJwtClaimOptions,
};
