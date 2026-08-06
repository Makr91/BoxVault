import db from '../models/index.js';
const { ROLES, user: User } = db;

// Usernames become the personal-org name, URL path segment, and filesystem
// directory (#33) — enforce the same URL-safe charset as organization names
// (see verifyOrganization.validateOrganization).
const USERNAME_PATTERN = /^[A-Za-z0-9.-]+$/;

const checkDuplicateUsernameOrEmail = async (req, res, next) => {
  try {
    const { username } = req.body || {};

    if (!username || !USERNAME_PATTERN.test(username) || username.includes('..')) {
      return res.status(400).send({
        message: req.__('auth.invalidUsername'),
      });
    }

    // Username
    const user = await User.findOne({
      where: {
        username: req.body.username,
      },
    });

    if (user) {
      return res.status(400).send({
        message: 'Failed! Username is already in use!',
      });
    }

    // Email
    const emailUser = await User.findOne({
      where: {
        email: req.body.email,
      },
    });

    if (emailUser) {
      return res.status(400).send({
        message: 'Failed! Email is already in use!',
      });
    }

    return next();
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while checking for duplicate username/email.',
    });
  }
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

export default verifySignUp;
