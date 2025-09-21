const { loadConfig } = require('../utils/config-loader');
const { log } = require('../utils/Logger');
const jwt = require("jsonwebtoken");
const db = require("../models");
const User = db.user;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

verifyToken = async (req, res, next) => {
  try {
    let token = req.headers["x-access-token"];

    if (!token) {
      return res.status(403).send({ message: "No token provided!" });
    }

    try {
      const decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, authConfig.auth.jwt.jwt_secret.value, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
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
              through: { attributes: [] }
            },
            {
              model: db.organization,
              as: 'organization',
              attributes: ['name']
            }
          ]
        });
        
        if (!user) {
          return res.status(401).send({ message: "User not found" });
        }

        req.user = user;
      }

      next();
    } catch (jwtError) {
      log.error.error('JWT verification error:', {
        error: jwtError.message,
        token: token ? '(token present)' : '(no token)'
      });
      return res.status(401).send({ 
        message: "Unauthorized!",
        error: "TOKEN_INVALID"
      });
    }
  } catch (err) {
    log.error.error('Token verification error:', {
      error: err.message,
      stack: err.stack
    });
    res.status(500).send({
      message: "Error verifying authentication"
    });
  }
};

isServiceAccount = (req, res, next) => {
  if (req.isServiceAccount) {
    next();
    return;
  }

  res.status(403).send({ message: "Require Service Account Role!" });
};

isUser = async (req, res, next) => {
  try {
    // First, check if it's not a service account
    if (req.isServiceAccount) {
      return res.status(403).send({
        message: "Access denied for service accounts. This endpoint is for users only."
      });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: "User not found!"
      });
    }

    const roles = await user.getRoles();
    const hasValidRole = roles.some(role => 
      ["user", "moderator", "admin"].includes(role.name)
    );

    if (hasValidRole) {
      next();
      return;
    }

    res.status(403).send({
      message: "Require User, Moderator or Admin Role!"
    });
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId
    });
    res.status(500).send({
      message: "Error checking user permissions"
    });
  }
};

isSelfOrAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: "User not found!"
      });
    }

    const roles = await user.getRoles();
    const isAdmin = roles.some(role => role.name === "admin");

    if (isAdmin || req.userId == req.params.userId) {
      next();
      return;
    }

    res.status(403).send({
      message: "Require Admin role or account ownership!"
    });
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId
    });
    res.status(500).send({
      message: "Error checking user permissions"
    });
  }
};

isUserOrServiceAccount = async (req, res, next) => {
  try {
    if (req.isServiceAccount) {
      next();
      return;
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: "User not found!"
      });
    }

    const roles = await user.getRoles();
    const hasValidRole = roles.some(role => 
      ["user", "moderator", "admin"].includes(role.name)
    );

    if (hasValidRole) {
      next();
      return;
    }

    res.status(403).send({
      message: "Require User, Moderator or Admin Role!"
    });
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId
    });
    res.status(500).send({
      message: "Error checking user permissions"
    });
  }
};

isAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: "User not found!"
      });
    }

    const roles = await user.getRoles();
    const isAdmin = roles.some(role => role.name === "admin");

    if (isAdmin) {
      next();
      return;
    }

    res.status(403).send({
      message: "Require Admin Role!"
    });
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId
    });
    res.status(500).send({
      message: "Error checking user permissions"
    });
  }
};

isModerator = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: "User not found!"
      });
    }

    const roles = await user.getRoles();
    const isModerator = roles.some(role => role.name === "moderator");

    if (isModerator) {
      next();
      return;
    }

    res.status(403).send({
      message: "Require Moderator Role!"
    });
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId
    });
    res.status(500).send({
      message: "Error checking user permissions"
    });
  }
};

isModeratorOrAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({
        message: "User not found!"
      });
    }

    const roles = await user.getRoles();
    const hasValidRole = roles.some(role => 
      ["moderator", "admin"].includes(role.name)
    );

    if (hasValidRole) {
      next();
      return;
    }

    res.status(403).send({
      message: "Require Moderator or Admin Role!"
    });
  } catch (err) {
    log.error.error('Auth middleware error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId
    });
    res.status(500).send({
      message: "Error checking user permissions"
    });
  }
};

const authJwt = {
  verifyToken: verifyToken,
  isAdmin: isAdmin,
  isModerator: isModerator,
  isModeratorOrAdmin: isModeratorOrAdmin,
  isUserOrServiceAccount: isUserOrServiceAccount,
  isServiceAccount: isServiceAccount,
  isUser: isUser,
  isSelfOrAdmin: isSelfOrAdmin
};

module.exports = authJwt;
