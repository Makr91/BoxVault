module.exports = (sequelize, Sequelize) => {
  const Box = sequelize.define("box", {
    organization: {
      type: Sequelize.STRING
    },
    name: {
      type: Sequelize.STRING
    },
    description: {
      type: Sequelize.STRING
    },
    published: {
      type: Sequelize.BOOLEAN
    },
    isPublic: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    userId: {
      type: Sequelize.INTEGER,
      references: {
        model: 'users',
        key: 'id',
      }
    }
  });
  
  Box.associate = function(models) {
    Box.belongsTo(models.user, {
      foreignKey: "userId",
      as: "user"
    });
    Box.hasMany(models.versions, {
      foreignKey: "boxId",
      as: "versions"
    });
  };

  return Box;
};