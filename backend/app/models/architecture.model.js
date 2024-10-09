// architecture.model.js
module.exports = (sequelize, Sequelize) => {
    const Architecture = sequelize.define("architectures", {
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      defaultBox: {
        type: Sequelize.BOOLEAN
      },
      providerId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'providers',
          key: 'id'
        }
      }
    });
  
    Architecture.associate = function(models) {
      Architecture.belongsTo(models.providers, {
        foreignKey: "providerId",
        as: "provider"
      });
      Architecture.hasMany(models.files, {
        foreignKey: "architectureId",
        as: "files"
      });
    };
  
    return Architecture;
  };