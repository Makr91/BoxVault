// architecture.model.js
export default (sequelize, Sequelize) => {
  const Architecture = sequelize.define('architectures', {
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    description: {
      type: Sequelize.STRING,
    },
    defaultBox: {
      type: Sequelize.BOOLEAN,
    },
    providerId: {
      type: Sequelize.INTEGER,
      references: {
        model: 'providers',
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

  Architecture.associate = function (models) {
    Architecture.belongsTo(models.providers, {
      foreignKey: 'providerId',
      as: 'provider',
    });
    Architecture.hasMany(models.files, {
      foreignKey: 'architectureId',
      as: 'files',
    });
  };

  return Architecture;
};
