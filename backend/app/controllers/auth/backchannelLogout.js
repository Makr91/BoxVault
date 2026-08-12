import { decodeJwt, jwtVerify } from 'jose';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { findProviderByIssuer } from '../../utils/oidcProviders.js';
import { getRemoteJwks } from '../../utils/jwks.js';
import { getOidcConfiguration } from '../../auth/passport.js';
import { notifySessionTerminated } from '../../utils/sessionEvents.js';
import db from '../../models/index.js';

const { credential: Credential, user: User } = db;

const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

const logoutError = (res, description) =>
  res.status(400).json({ error: 'invalid_request', error_description: description });

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const validateLogoutClaims = payload => {
  if (!payload.sub && !payload.sid) {
    return 'logout token must contain a sub or sid claim';
  }
  if (!isPlainObject(payload.events) || !isPlainObject(payload.events[BACKCHANNEL_LOGOUT_EVENT])) {
    return 'logout token events claim must contain the back-channel logout event member';
  }
  if ('nonce' in payload) {
    return 'logout token must not contain a nonce claim';
  }
  return null;
};

const verifyLogoutToken = async logoutToken => {
  const issuer = decodeJwt(logoutToken).iss;
  const providerName = issuer ? findProviderByIssuer(issuer) : null;
  if (!providerName) {
    log.auth.warn('Back-channel logout: token issuer matches no enabled OIDC provider', { issuer });
    return { error: 'unknown token issuer' };
  }

  const oidcConfig = getOidcConfiguration(providerName);
  if (!oidcConfig) {
    log.auth.warn('Back-channel logout: OIDC provider not discovered yet', { providerName });
    return { error: 'identity provider metadata not available' };
  }

  const clientId = loadConfig('auth').auth?.oidc?.providers?.[providerName]?.client_id?.value;
  if (!clientId) {
    log.auth.warn('Back-channel logout: provider has no client_id configured', { providerName });
    return { error: 'provider client_id is not configured' };
  }

  try {
    const { payload } = await jwtVerify(
      logoutToken,
      getRemoteJwks(oidcConfig.serverMetadata().jwks_uri),
      {
        issuer,
        audience: clientId,
        requiredClaims: ['iat', 'exp'],
        maxTokenAge: '10 minutes',
        clockTolerance: 30,
      }
    );
    return { payload, issuer };
  } catch (err) {
    log.auth.info('Back-channel logout: token validation failed', { error: err.message });
    return { error: 'logout token validation failed' };
  }
};

const findCredentialForSubject = (issuer, subject) =>
  subject ? Credential.findByIssuerAndSubject(issuer, String(subject)) : Promise.resolve(null);

const resolveLogoutUserId = async (issuer, payload) => {
  const credential =
    (await findCredentialForSubject(issuer, payload.UUID)) ||
    (await findCredentialForSubject(issuer, payload.sub));
  if (credential) {
    return credential.user_id;
  }
  if (typeof payload.sub === 'string' && payload.sub.includes('@')) {
    const user = await User.findOne({ where: { email: payload.sub } });
    if (user) {
      return user.id;
    }
  }
  return null;
};

const revokeUserSessions = async (issuer, payload) => {
  if (!payload.sub && !payload.UUID) {
    log.auth.info('Back-channel logout: token carries only sid, nothing to map locally', {
      issuer,
    });
    return;
  }

  const userId = await resolveLogoutUserId(issuer, payload);
  if (userId === null) {
    log.auth.info('Back-channel logout: subject matches no local credential', { issuer });
    return;
  }

  await User.update({ sessionsInvalidAfter: new Date() }, { where: { id: userId } });
  notifySessionTerminated(userId);
  log.auth.info('Back-channel logout: user sessions revoked', {
    issuer,
    userId,
  });
};

const backchannelLogout = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  const logoutToken = req.body?.logout_token;
  if (typeof logoutToken !== 'string' || logoutToken.split('.').length !== 3) {
    log.auth.info('Back-channel logout: rejected', {
      reason: 'missing or malformed logout_token',
    });
    return logoutError(res, 'missing or malformed logout_token');
  }

  let verified;
  try {
    verified = await verifyLogoutToken(logoutToken);
  } catch (err) {
    log.auth.info('Back-channel logout: rejected', {
      reason: 'logout_token could not be decoded',
      error: err.message,
    });
    return logoutError(res, 'missing or malformed logout_token');
  }
  if (verified.error) {
    return logoutError(res, verified.error);
  }

  const claimError = validateLogoutClaims(verified.payload);
  if (claimError) {
    log.auth.info('Back-channel logout: rejected', { reason: claimError });
    return logoutError(res, claimError);
  }

  try {
    await revokeUserSessions(verified.issuer, verified.payload);
  } catch (err) {
    log.error.error('Back-channel logout: session revocation failed', {
      error: err.message,
      stack: err.stack,
    });
    return logoutError(res, 'logout failed');
  }

  return res.status(200).end();
};

export { backchannelLogout };
