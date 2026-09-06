import db from '../models/index.js';
const { ROLES, user: User } = db;

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
            message: req.__('auth.roleDoesNotExist', { role: req.body.roles[i] }),
          });
          return;
        }
      }
    }

    next();
  } catch (err) {
    res.status(500).send({
      message: err.message || req.__('errors.operationFailed'),
    });
  }
};

const verifySignUp = {
  checkRolesExisted,
};

export default verifySignUp;
