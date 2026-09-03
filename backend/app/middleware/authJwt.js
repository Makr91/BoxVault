import { log } from '../utils/Logger.js';
import db from '../models/index.js';
import { authorizationCredential, resolveRequestAuth } from '../utils/requestAuth.js';
const { user: User, role: Role, organization } = db;

const isTokenRevoked = (auth, sessionsInvalidAfter) =>
  Boolean(
    !auth.isServiceAccount &&
    auth.claims?.iat &&
    sessionsInvalidAfter &&
    auth.claims.iat * 1000 < new Date(sessionsInvalidAfter).getTime()
  );

const verifyToken = async (req, res, next) => {
  try {
    if (!req.headers['x-access-token'] && !authorizationCredential(req)) {
      return res.status(403).send({ message: 'No token provided!' });
    }

    const refreshRoute = req.path.endsWith('/auth/refresh-token');
    const auth = await resolveRequestAuth(req, { sessionOnly: refreshRoute });

    if (!auth) {
      log.error.error('Request authentication failed', { path: req.path });
      return res.status(401).send({
        message: 'Unauthorized!',
        error: 'TOKEN_INVALID',
      });
    }

    req.userId = auth.userId;
    req.isServiceAccount = auth.isServiceAccount;
    req.stayLoggedIn = auth.stayLoggedIn;
    req.tokenClaims = auth.claims;
    if (auth.provider) {
      req.authProvider = auth.provider;
    }
    if (auth.oidcAccessToken) {
      req.oidcAccessToken = auth.oidcAccessToken;
    }

    if (refreshRoute) {
      if (auth.isServiceAccount) {
        return res.status(403).send({ message: 'Service accounts cannot refresh tokens' });
      }

      const user = await User.findByPk(auth.userId, {
        include: [
          {
            model: Role,
            as: 'roles',
            attributes: ['name'],
            through: { attributes: [] },
          },
          {
            model: organization,
            as: 'primaryOrganization',
            attributes: ['name'],
          },
        ],
      });

      if (!user) {
        return res.status(401).send({ message: 'User not found' });
      }

      if (user.suspended) {
        return res.status(403).send({ message: req.__('auth.accountSuspended') });
      }

      if (isTokenRevoked(auth, user.sessionsInvalidAfter)) {
        return res.status(401).send({
          message: 'Unauthorized!',
          error: 'TOKEN_INVALID',
        });
      }

      req.user = user;
    } else if (!auth.isServiceAccount && auth.claims?.iat) {
      const revocationRow = await User.findByPk(auth.userId, {
        attributes: ['sessionsInvalidAfter'],
      });
      if (revocationRow && isTokenRevoked(auth, revocationRow.sessionsInvalidAfter)) {
        return res.status(401).send({
          message: 'Unauthorized!',
          error: 'TOKEN_INVALID',
        });
      }
    }

    if (auth.isServiceAccount && auth.serviceAccountId) {
      req.serviceAccountId = auth.serviceAccountId;
    }

    if (auth.organizations) {
      req.userOrganizations = auth.organizations;
    }

    return next();
  } catch (err) {
    log.error.error('Token verification error:', {
      error: err.message,
      stack: err.stack,
    });
    return res.status(503).send({
      message: 'Error verifying authentication',
    });
  }
};

const isServiceAccount = (req, res, next) => {
  if (req.isServiceAccount) {
    return next();
  }

  return res.status(403).send({ message: 'Require Service Account Role!' });
};

// Shared gate step: load the requesting user (for service accounts, the owning
// user) and reject the request when the account is missing or suspended.
// Sends the response itself and returns null so callers can simply bail.
const loadActiveUser = async (req, res) => {
  const user = await User.findByPk(req.userId);
  if (!user) {
    res.status(401).send({
      message: 'User not found!',
    });
    return null;
  }

  if (user.suspended) {
    res.status(403).send({ message: req.__('auth.accountSuspended') });
    return null;
  }

  return user;
};

const isUser = async (req, res, next) => {
  try {
    // First, check if it's not a service account
    if (req.isServiceAccount) {
      return res.status(403).send({
        message: 'Access denied for service accounts. This endpoint is for users only.',
      });
    }

    const user = await loadActiveUser(req, res);
    if (!user) {
      return undefined;
    }

    const roles = await user.getRoles();
    const hasValidRole = roles.some(role => ['user', 'admin'].includes(role.name));

    if (hasValidRole) {
      return next();
    }

    return res.status(403).send({
      message: 'Require User or Admin Role!',
    });
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    return res.status(500).send({
      message: 'Error checking user permissions',
    });
  }
};

const isSelfOrAdmin = async (req, res, next) => {
  try {
    const user = await loadActiveUser(req, res);
    if (!user) {
      return undefined;
    }

    const roles = await user.getRoles();
    const isAdminRole = roles.some(role => role.name === 'admin');

    // Use loose equality to handle string/number mismatch for userId
    if (isAdminRole || String(req.userId) === String(req.params.userId)) {
      return next();
    }

    return res.status(403).send({
      message: 'Require Admin role or account ownership!',
    });
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    return res.status(500).send({
      message: 'Error checking user permissions',
    });
  }
};

const isUserOrServiceAccount = async (req, res, next) => {
  try {
    if (req.isServiceAccount) {
      // Impersonation model: the owning user must still be active
      const owner = await loadActiveUser(req, res);
      if (!owner) {
        return undefined;
      }
      return next();
    }

    const user = await loadActiveUser(req, res);
    if (!user) {
      return undefined;
    }

    const roles = await user.getRoles();
    const hasValidRole = roles.some(role => ['user', 'admin'].includes(role.name));

    if (hasValidRole) {
      return next();
    }

    return res.status(403).send({
      message: 'Require User or Admin Role!',
    });
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    return res.status(500).send({
      message: 'Error checking user permissions',
    });
  }
};

const isAdmin = async (req, res, next) => {
  try {
    const user = await loadActiveUser(req, res);
    if (!user) {
      return undefined;
    }

    const roles = await user.getRoles();
    const isAdminRole = roles.some(role => role.name === 'admin');

    if (isAdminRole) {
      return next();
    }

    return res.status(403).send({
      message: 'Require Admin Role!',
    });
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    return res.status(500).send({
      message: 'Error checking user permissions',
    });
  }
};

const authJwt = {
  verifyToken,
  isAdmin,
  isUserOrServiceAccount,
  isServiceAccount,
  isUser,
  isSelfOrAdmin,
};

export default authJwt;
