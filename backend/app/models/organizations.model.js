module.exports = (sequelize, Sequelize) => {
  const Organization = sequelize.define("organizations", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: Sequelize.STRING,
      unique: true
    },
    email: {
      type: Sequelize.STRING,
      defaultValue: ""
    },
    emailHash: {
      type: Sequelize.STRING,
      defaultValue: ""
    },
    description: {
      type: Sequelize.STRING,
      defaultValue: ""
    },
    suspended: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    } 
  });

  Organization.associate = function(models) {
    Organization.hasMany(models.user, { 
      foreignKey: "organizationId",
      as: "users"
    });
  };

  return Organization;
};