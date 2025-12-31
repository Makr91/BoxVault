const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');
const jwt = require('jsonwebtoken');
const db = require('../models');
const User = db.user;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers['x-access-token'];

    if (!token) {
      return res.status(403).send({ message: 'No token provided!' });
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
      if (req.path === '/api/auth/refresh-token') {
        const user = await User.findByPk(decoded.id, {
          include: [
            {
              model: db.role,
              as: 'roles',
              attributes: ['name'],
              through: { attributes: [] },
            },
            {
              model: db.organization,
              as: 'organization',
              attributes: ['name'],
            },
          ],
        });

        if (!user) {
          return res.status(401).send({ message: 'User not found' });
        }

        req.user = user;
      }

      return next();
    } catch (jwtError) {
      log.error.error('JWT verification error:', {
        error: jwtError.message,
        token: token ? '(token present)' : '(no token)',
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

    if (isAdminRole || req.userId === req.params.userId) {
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

module.exports = authJwt;
