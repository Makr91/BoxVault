import { loadConfig } from '../utils/config-loader.js';
import { log } from '../utils/Logger.js';
import jwt from 'jsonwebtoken';
import db from '../models/index.js';
import { extractBearerToken, findServiceAccountByRawToken } from '../utils/serviceAccountAuth.js';
const { user: User, role: Role, organization } = db;

// Fallback for raw service-account API keys: when no valid JWT is present,
// look the token up in the service_account table and set the same request
// fields the JWT service-account path sets below.
const applyServiceAccountAuth = async (req, ...candidates) => {
  const tokens = candidates.filter(Boolean);
  const results = await Promise.all(tokens.map(t => findServiceAccountByRawToken(t)));
  const serviceAccount = results.find(Boolean);

  if (!serviceAccount) {
    return false;
  }

  req.userId = serviceAccount.userId;
  req.isServiceAccount = true;
  req.serviceAccountId = serviceAccount.id;
  req.serviceAccountOrgId = serviceAccount.organization_id;
  return true;
};

const verifyToken = async (req, res, next) => {
  try {
    const authConfig = loadConfig('auth');
    const token = req.headers['x-access-token'];
    const bearerToken = extractBearerToken(req);

    if (!token && !bearerToken) {
      return res.status(403).send({ message: 'No token provided!' });
    }

    // Raw service-account keys cannot refresh tokens
    const canFallbackToServiceAccount = !req.path.endsWith('/auth/refresh-token');

    if (!token) {
      // Only Authorization: Bearer present — raw service-account key
      if (canFallbackToServiceAccount && (await applyServiceAccountAuth(req, bearerToken))) {
        return next();
      }
      return res.status(401).send({
        message: 'Unauthorized!',
        error: 'TOKEN_INVALID',
      });
    }

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
      req.isServiceAccount = decoded.isServiceAccount;
      req.stayLoggedIn = decoded.stayLoggedIn;

      // If this is a refresh token request, attach the full user object
      // Check path instead of originalUrl to handle query parameters correctly
      if (req.path.endsWith('/auth/refresh-token')) {
        if (decoded.isServiceAccount) {
          return res.status(403).send({ message: 'Service accounts cannot refresh tokens' });
        }

        const user = await User.findByPk(decoded.id, {
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

        req.user = user;
      }

      // Attach JWT context for service accounts
      if (decoded.isServiceAccount) {
        if (decoded.serviceAccountOrgId) {
          req.serviceAccountOrgId = decoded.serviceAccountOrgId;
        }
        if (decoded.serviceAccountId) {
          req.serviceAccountId = decoded.serviceAccountId;
        }
      }

      // Attach user's organizations from JWT for frontend
      if (decoded.organizations) {
        req.userOrganizations = decoded.organizations;
      }

      return next();
    } catch (jwtError) {
      // Not a valid JWT — try it as a raw service-account key
      if (canFallbackToServiceAccount && (await applyServiceAccountAuth(req, bearerToken, token))) {
        return next();
      }

      log.error.error('JWT verification error:', {
        error: jwtError.message,
        token: '(token present)',
      });
      return res.status(401).send({
        message: 'Unauthorized!',
        error: 'TOKEN_INVALID',
      });
    }
  } catch (err) {
    log.error.error('Token verification error:', {
      error: err.message,
      stack: err.stack,
    });
    return res.status(500).send({
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

const isUser = async (req, res, next) => {
  try {
    // First, check if it's not a service account
    if (req.isServiceAccount) {
      return res.status(403).send({
        message: 'Access denied for service accounts. This endpoint is for users only.',
      });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: 'User not found!',
      });
    }

    const roles = await user.getRoles();
    const hasValidRole = roles.some(role => ['user', 'moderator', 'admin'].includes(role.name));

    if (hasValidRole) {
      return next();
    }

    return res.status(403).send({
      message: 'Require User, Moderator or Admin Role!',
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
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: 'User not found!',
      });
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
      return next();
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: 'User not found!',
      });
    }

    const roles = await user.getRoles();
    const hasValidRole = roles.some(role => ['user', 'moderator', 'admin'].includes(role.name));

    if (hasValidRole) {
      return next();
    }

    return res.status(403).send({
      message: 'Require User, Moderator or Admin Role!',
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
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: 'User not found!',
      });
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

const isModerator = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: 'User not found!',
      });
    }

    const roles = await user.getRoles();
    const isModeratorRole = roles.some(role => role.name === 'moderator');

    if (isModeratorRole) {
      return next();
    }

    return res.status(403).send({
      message: 'Require Moderator Role!',
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

const isModeratorOrAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: 'User not found!',
      });
    }

    const roles = await user.getRoles();
    const hasValidRole = roles.some(role => ['moderator', 'admin'].includes(role.name));

    if (hasValidRole) {
      return next();
    }

    return res.status(403).send({
      message: 'Require Moderator or Admin Role!',
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
  isModerator,
  isModeratorOrAdmin,
  isUserOrServiceAccount,
  isServiceAccount,
  isUser,
  isSelfOrAdmin,
};

export default authJwt;
