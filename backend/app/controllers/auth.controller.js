// auth.controller.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require('crypto');
const db = require("../models");
const User = db.user;
const Role = db.role;
const Organization = db.organization;
const Op = db.Sequelize.Op;
const authConfigPath = path.join(__dirname, '../config/auth.config.yaml');
let authConfig;
try {
  const fileContents = fs.readFileSync(authConfigPath, 'utf8');
  authConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load auth configuration: ${e.message}`);
}

const generateEmailHash = (email) => {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
};

exports.signup = async (req, res) => {
  const { organizationName } = req.params;
  const { username, email, password } = req.body;

  try {
    let organization;

    if (organizationName) {
      organization = await Organization.findOne({
        where: { name: organizationName }
      });

      if (!organization) {
        return res.status(404).send({
          message: "Organization not found."
        });
      }
    } else {
      organization = await Organization.create({
        name: username
      });
    }

    const emailHash = generateEmailHash(email);

    const user = await User.create({
      username,
      email,
      password: bcrypt.hashSync(password, 8),
      emailHash,
      organizationId: organization.id
    });

    const userCount = await User.count();

    if (userCount === 1) {
      // Assign "admin" role to the first user
      const adminRole = await Role.findOne({ where: { name: "admin" } });
      await user.setRoles([adminRole]);
    } else {
      // Assign "user" role to all subsequent users
      const userRole = await Role.findOne({ where: { name: "user" } });
      await user.setRoles([userRole]);
    }

    res.status(201).send({ message: "User registered successfully!" });
  } catch (err) {
    console.error("Error during signup:", err);
    res.status(500).send({
      message: err.message || "Some error occurred while signing up the user."
    });
  }
};

exports.signin = (req, res) => {
  User.findOne({
    where: {
      username: req.body.username
    },
    include: [{
      model: Organization,
      as: 'organization',
      attributes: ['name']
    }]
  })
    .then(user => {
      if (!user) {
        return res.status(404).send({ message: "User Not found." });
      }
      console.log("debug")
      var passwordIsValid = bcrypt.compareSync(
        req.body.password,
        user.password
      );

      if (!passwordIsValid) {
        return res.status(401).send({
          accessToken: null,
          message: "Invalid Password!"
        });
      }

      const token = jwt.sign({ id: user.id },
                              authConfig.jwt.jwt_secret,
                              {
                                algorithm: 'HS256',
                                allowInsecureKeySizes: true,
                                expiresIn: authConfig.jwt.jwt_token_time_valid,
                              });

      var authorities = [];
      user.getRoles().then(roles => {
        for (let i = 0; i < roles.length; i++) {
          authorities.push("ROLE_" + roles[i].name.toUpperCase());
        }
        res.status(200).send({
          id: user.id,
          username: user.username,
          email: user.email,
          emailHash: user.emailHash,
          organization: user.organization ? user.organization.name : null,
          roles: authorities,
          accessToken: token
        });
      });
    })
    .catch(err => {
      res.status(500).send({ message: err.message });
    });
};

 exports.deleteUser = async (req, res) => {
     const { userId } = req.params;
     try {
       const user = await User.findByPk(userId);
       if (!user) {
         return res.status(404).send({ message: "User not found." });
       }
       await user.destroy();
       res.status(200).send({ message: "User deleted successfully." });
     } catch (err) {
       res.status(500).send({ message: err.message || "Some error occurred while deleting the user." });
     }
   };

   // Method to suspend a user
   exports.suspendUser = async (req, res) => {
     const { userId } = req.params;
     try {
       const user = await User.findByPk(userId);
       if (!user) {
         return res.status(404).send({ message: "User not found." });
       }
       // Assuming there's a 'suspended' field in the User model
       await user.update({ suspended: true });
       res.status(200).send({ message: "User suspended successfully." });
     } catch (err) {
       res.status(500).send({ message: err.message || "Some error occurred while suspending the user." });
     }
   };

   exports.resumeUser = async (req, res) => {
    const { userId } = req.params;

    try {
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).send({ message: "User not found." });
      }

      user.suspended = false;
      await user.save();

      res.status(200).send({ message: "User resumed successfully!" });
    } catch (err) {
      res.status(500).send({ message: err.message || "Some error occurred while resuming the user." });
    }
  };

// If you have an update user function, ensure it also updates the email hash
exports.updateUser = async (req, res) => {
  const { userId } = req.params;
  const { email } = req.body;

  try {
    const emailHash = generateEmailHash(email);

    await User.update(
      { email, emailHash },
      { where: { id: userId } }
    );

    res.send({ message: "User updated successfully!" });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};
