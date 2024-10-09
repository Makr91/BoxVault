// user.model.js
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
    suspended: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    }
  });

  User.associate = function(models) {
    console.log("Associating User with Organization using alias 'organization'");
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