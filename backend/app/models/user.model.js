module.exports = (sequelize, Sequelize) => {
  const User = sequelize.define("users", {
    username: {
      type: Sequelize.STRING
    },
    email: {
      type: Sequelize.STRING
    },
    password: {
      type: Sequelize.STRING
    },
    emailHash: {
      type: Sequelize.STRING
    },
    verified: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    verificationToken: {
      type: Sequelize.STRING
    },
    verificationTokenExpires: {
      type: Sequelize.DATE
    },
    suspended: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    }
  });

  User.associate = function(models) {
    User.belongsTo(models.organization, {
      foreignKey: "organizationId",
      as: "organization"
    });
    User.hasMany(models.box, {
      foreignKey: "userId",
      as: "box"
    });
  };

  return User;
};