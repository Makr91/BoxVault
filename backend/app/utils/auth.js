import jwt from 'jsonwebtoken';
import { loadConfig } from './config-loader.js';
import { log } from './Logger.js';

const { verify, sign } = jwt;

// Issuer/audience claims stamped on every BoxVault-minted JWT and enforced on
// every verification of our own tokens. Foreign OIDC access tokens are
// validated separately (externalTokenAuth) with their own audience config.
const getJwtClaimOptions = () => {
  const authConfig = loadConfig('auth');
  return {
    issuer: authConfig.auth.jwt.jwt_issuer?.value || 'boxvault',
    audience: authConfig.auth.jwt.jwt_audience?.value || 'boxvault-api',
  };
};

// Single implementation of BoxVault JWT verification (signature + issuer/audience).
// Every consumer of our own tokens (sessionAuth middleware, download tokens)
// decodes through here. Rejects on any verification failure.
const verifySessionToken = token => {
  const authConfig = loadConfig('auth');
  return new Promise((resolve, reject) => {
    verify(
      token,
      authConfig.auth.jwt.jwt_secret.value,
      getJwtClaimOptions(),
      (err, decodedToken) => {
        if (err) {
          reject(err);
        } else {
          resolve(decodedToken);
        }
      }
    );
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
  return sign({ ...payload, type: 'download' }, authConfig.auth.jwt.jwt_secret.value, {
    expiresIn,
    ...getJwtClaimOptions(),
  });
};

export { verifySessionToken, verifyDownloadToken, generateDownloadToken, getJwtClaimOptions };
