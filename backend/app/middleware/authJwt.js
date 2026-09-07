import { log } from '../utils/Logger.js';
import db from '../models/index.js';
import { authorizationCredential, resolveRequestAuth } from '../utils/requestAuth.js';
import { problem } from '../utils/problem.js';
import { serviceAccountIsSuperadmin } from '../utils/orgMembership.js';
const { user: User, role: Role, organization } = db;

const isTokenRevoked = (auth, sessionsInvalidAfter) =>
  Boolean(
    auth.claims?.iat &&
    sessionsInvalidAfter &&
    auth.claims.iat * 1000 < new Date(sessionsInvalidAfter).getTime()
  );

const unauthenticated = (req, res) =>
  problem(res, req, {
    status: 401,
    type: 'authentication',
    title: req.__('auth.unauthorized'),
  });

const forbidden = (req, res, key) =>
  problem(res, req, { status: 403, type: 'forbidden', title: req.__(key) });

const verifyToken = async (req, res, next) => {
  try {
    if (!req.headers['x-access-token'] && !authorizationCredential(req)) {
      return forbidden(req, res, 'auth.noTokenProvided');
    }

    const refreshRoute = req.path.endsWith('/auth/refresh-token');
    const auth = await resolveRequestAuth(req, { sessionOnly: refreshRoute });

    if (!auth) {
      log.error.error('Request authentication failed', { path: req.path });
      return unauthenticated(req, res);
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
        return forbidden(req, res, 'auth.serviceAccountCannotRefresh');
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
        return problem(res, req, {
          status: 401,
          type: 'authentication',
          title: req.__('users.userNotFound'),
        });
      }

      if (user.suspended) {
        return forbidden(req, res, 'auth.accountSuspended');
      }

      if (isTokenRevoked(auth, user.sessionsInvalidAfter)) {
        return unauthenticated(req, res);
      }

      req.user = user;
    } else if (auth.claims?.iat) {
      const revocationRow = await User.findByPk(auth.userId, {
        attributes: ['sessionsInvalidAfter'],
      });
      if (revocationRow && isTokenRevoked(auth, revocationRow.sessionsInvalidAfter)) {
        return unauthenticated(req, res);
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
      message: req.__('auth.verificationError'),
    });
  }
};

const isServiceAccount = (req, res, next) => {
  if (req.isServiceAccount) {
    return next();
  }

  return forbidden(req, res, 'auth.requireServiceAccount');
};

// Shared gate step: load the requesting user (for service accounts, the owning
// user) and reject the request when the account is missing or suspended.
// Sends the response itself and returns null so callers can simply bail.
const loadActiveUser = async (req, res) => {
  const user = await User.findByPk(req.userId);
  if (!user) {
    problem(res, req, {
      status: 401,
      type: 'authentication',
      title: req.__('users.userNotFound'),
    });
    return null;
  }

  if (user.suspended) {
    forbidden(req, res, 'auth.accountSuspended');
    return null;
  }

  return user;
};

const isUser = async (req, res, next) => {
  try {
    // First, check if it's not a service account
    if (req.isServiceAccount) {
      return forbidden(req, res, 'auth.serviceAccountsDenied');
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

    return forbidden(req, res, 'auth.requireUserOrAdmin');
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    return res.status(500).send({
      message: req.__('auth.permissionCheckError'),
    });
  }
};

const isSelfOrAdmin = async (req, res, next) => {
  try {
    if (req.isServiceAccount && !(await serviceAccountIsSuperadmin(req.serviceAccountId))) {
      return forbidden(req, res, 'auth.serviceAccountsDenied');
    }

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

    return forbidden(req, res, 'auth.requireAdminOrSelf');
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    return res.status(500).send({
      message: req.__('auth.permissionCheckError'),
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

    return forbidden(req, res, 'auth.requireUserOrAdmin');
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    return res.status(500).send({
      message: req.__('auth.permissionCheckError'),
    });
  }
};

const isAdmin = async (req, res, next) => {
  try {
    if (req.isServiceAccount && !(await serviceAccountIsSuperadmin(req.serviceAccountId))) {
      return forbidden(req, res, 'auth.serviceAccountsDenied');
    }

    const user = await loadActiveUser(req, res);
    if (!user) {
      return undefined;
    }

    const roles = await user.getRoles();
    const isAdminRole = roles.some(role => role.name === 'admin');

    if (isAdminRole) {
      return next();
    }

    return forbidden(req, res, 'auth.requireAdmin');
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
    });
    return res.status(500).send({
      message: req.__('auth.permissionCheckError'),
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
