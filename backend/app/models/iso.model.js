export default (sequelize, Sequelize) => {
  const ISO = sequelize.define('iso', {
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    description: {
      type: Sequelize.STRING,
    },
    isPublic: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    guestAccess: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      field: 'guest_access',
    },
    published: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    metadata: {
      type: Sequelize.JSON,
      allowNull: true,
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
  });

  ISO.associate = function (models) {
    ISO.belongsTo(models.user, {
      foreignKey: 'userId',
      as: 'user',
    });
    ISO.hasMany(models.isoVersions, {
      foreignKey: 'isoId',
      as: 'versions',
    });
  };

  return ISO;
};
