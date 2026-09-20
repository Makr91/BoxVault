// provider.model.js
export default (sequelize, Sequelize) => {
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
    isPublic: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_public',
    },
    guestAccess: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'guest_access',
    },
    published: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
