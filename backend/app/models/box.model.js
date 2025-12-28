module.exports = (sequelize, Sequelize) => {
  const Box = sequelize.define('box', {
    name: {
      type: Sequelize.STRING,
    },
    description: {
      type: Sequelize.STRING,
    },
    published: {
      type: Sequelize.BOOLEAN,
    },
    isPublic: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    userId: {
      type: Sequelize.INTEGER,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    githubRepo: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        is: /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/i,
      },
    },
    workflowFile: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        is: /^[a-zA-Z0-9._-]+\.(yml|yaml)$/i,
      },
    },
    cicdUrl: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        isUrl: true,
      },
    },
  });

  Box.associate = function (models) {
    Box.belongsTo(models.user, {
      foreignKey: 'userId',
      as: 'user',
    });
    Box.hasMany(models.versions, {
      foreignKey: 'boxId',
      as: 'versions',
    });
  };

  return Box;
};
