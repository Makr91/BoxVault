// version.model.js
module.exports = (sequelize, Sequelize) => {
  const Version = sequelize.define('versions', {
    versionNumber: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    description: {
      type: Sequelize.STRING,
    },
    boxId: {
      type: Sequelize.INTEGER,
      references: {
        model: 'boxes',
        key: 'id',
      },
    },
  });

  // version.model.js
  Version.associate = function (models) {
    Version.belongsTo(models.box, {
      foreignKey: 'boxId',
      as: 'box',
    });
    Version.hasMany(models.providers, {
      foreignKey: 'versionId',
      as: 'providers',
    });
  };

  return Version;
};
