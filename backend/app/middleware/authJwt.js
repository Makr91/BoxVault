const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const db = require("../models");
const User = db.user;

const authConfigPath = path.join(__dirname, '../config/auth.config.yaml');
let authConfig;
try {
  const fileContents = fs.readFileSync(authConfigPath, 'utf8');
  authConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load auth configuration: ${e.message}`);
}

verifyToken = (req, res, next) => {
  let token = req.headers["x-access-token"];

  if (!token) {
    return res.status(403).send({ message: "No token provided!" });
  }

  jwt.verify(token, authConfig.jwt.jwt_secret.value, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized!" });
    }
    req.userId = decoded.id;
    req.isServiceAccount = decoded.isServiceAccount;
    next();
  });
};

isServiceAccount = (req, res, next) => {
  if (req.isServiceAccount) {
    next();
    return;
  }

  res.status(403).send({ message: "Require Service Account Role!" });
};

isUser = (req, res, next) => {
  // First, check if it's not a service account
  if (req.isServiceAccount) {
    return res.status(403).send({
      message: "Access denied for service accounts. This endpoint is for users only."
    });
  }

  // If it's not a service account, check for user, moderator, or admin role
  User.findByPk(req.userId).then(user => {
    user.getRoles().then(roles => {
      for (let i = 0; i < roles.length; i++) {
        if (roles[i].name === "user" || roles[i].name === "moderator" || roles[i].name === "admin") {
          next();
          return;
        }
      }

      res.status(403).send({
        message: "Require User, Moderator or Admin Role!"
      });
    });
  });
};

isSelfOrAdmin = (req, res, next) => {
  User.findByPk(req.userId).then(user => {
    user.getRoles().then(roles => {
      for (let i = 0; i < roles.length; i++) {
        if (roles[i].name === "admin") {
          next();
          return;
        }
      }

      // If not admin, check if the user is trying to delete their own account
      if (req.userId == req.params.userId) {
        next();
        return;
      }

      res.status(403).send({
        message: "Require Admin role or account ownership!"
      });
    });
  });
};

isUserOrServiceAccount = (req, res, next) => {
  if (req.isServiceAccount) {
    next();
    return;
  }

  User.findByPk(req.userId).then(user => {
    user.getRoles().then(roles => {
      for (let i = 0; i < roles.length; i++) {
        if (roles[i].name === "user" || roles[i].name === "moderator" || roles[i].name === "admin") {
          next();
          return;
        }
      }

      res.status(403).send({
        message: "Require User, Moderator or Admin Role!"
      });
    });
  });
};

isAdmin = (req, res, next) => {
  User.findByPk(req.userId).then(user => {
    user.getRoles().then(roles => {
      for (let i = 0; i < roles.length; i++) {
        if (roles[i].name === "admin") {
          next();
          return;
        }
      }

      res.status(403).send({
        message: "Require Admin Role!"
      });
      return;
    });
  });
};

isModerator = (req, res, next) => {
  User.findByPk(req.userId).then(user => {
    user.getRoles().then(roles => {
      for (let i = 0; i < roles.length; i++) {
        if (roles[i].name === "moderator") {
          next();
          return;
        }
      }

      res.status(403).send({
        message: "Require Moderator Role!"
      });
    });
  });
};

isModeratorOrAdmin = (req, res, next) => {
  User.findByPk(req.userId).then(user => {
    user.getRoles().then(roles => {
      for (let i = 0; i < roles.length; i++) {
        if (roles[i].name === "moderator") {
          next();
          return;
        }

        if (roles[i].name === "admin") {
          next();
          return;
        }
      }

      res.status(403).send({
        message: "Require Moderator or Admin Role!"
      });
    });
  });
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
