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
      description: {
        type: Sequelize.STRING
      },
      suspended: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      } 
    });

    Organization.associate = function(models) {
      console.log("Associating Organization with Users using alias 'users'");
      Organization.hasMany(models.user, { 
        foreignKey: "organizationId",
        as: "users"
      });
    };
  
    return Organization;
  };