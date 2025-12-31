const db = require('../models');
const { ROLES } = db;
const User = db.user;

const checkDuplicateUsernameOrEmail = (req, res, next) => {
  // Username
  User.findOne({
    where: {
      username: req.body.username,
    },
  }).then(user => {
    if (user) {
      res.status(400).send({
        message: 'Failed! Username is already in use!',
      });
      return;
    }

    // Email
    User.findOne({
      where: {
        email: req.body.email,
      },
    }).then(emailUser => {
      if (emailUser) {
        res.status(400).send({
          message: 'Failed! Email is already in use!',
        });
        return;
      }

      next();
    });
  });
};

const checkRolesExisted = async (req, res, next) => {
  try {
    const userCount = await User.count();

    if (userCount === 0) {
      // If no users exist, assign the "Admin" role to the first user
      req.body.roles = ['admin'];
    } else if (req.body.roles) {
      for (let i = 0; i < req.body.roles.length; i++) {
        if (!ROLES.includes(req.body.roles[i])) {
          res.status(400).send({
            message: `Failed! Role does not exist = ${req.body.roles[i]}`,
          });
          return;
        }
      }
    }

    next();
  } catch (err) {
    res.status(500).send({
      message: err.message || 'Some error occurred while checking roles.',
    });
  }
};

const verifySignUp = {
  checkDuplicateUsernameOrEmail,
  checkRolesExisted,
};

module.exports = verifySignUp;
