// provider.model.js
module.exports = (sequelize, Sequelize) => {
  const Provider = sequelize.define('providers', {
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    description: {
      type: Sequelize.STRING,
    },
    versionId: {
      type: Sequelize.INTEGER,
      references: {
        model: 'versions',
        key: 'id',
      },
    },
  });

  // provider.model.js
  Provider.associate = function (models) {
    Provider.belongsTo(models.versions, {
      foreignKey: 'versionId',
      as: 'version',
    });
    Provider.hasMany(models.architectures, {
      foreignKey: 'providerId',
      as: 'architectures',
    });
  };

  return Provider;
};
