module.exports = (sequelize, Sequelize) => {
    const ServiceAccount = sequelize.define("service_accounts", {
      username: {
        type: Sequelize.STRING,
        unique: true
      },
      token: {
        type: Sequelize.STRING,
        unique: true
      },
      expiresAt: {
        type: Sequelize.DATE
      },
      description: {
        type: Sequelize.STRING
      }
    });
  
    ServiceAccount.associate = function(models) {
      ServiceAccount.belongsTo(models.user, {
        foreignKey: "userId",
        as: "user"
      });
    };
  
    return ServiceAccount;
  };