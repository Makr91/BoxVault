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
    published: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    metadata: {
      type: Sequelize.JSON,
      allowNull: true,
    },
  });

  ISO.associate = function (models) {
    ISO.hasMany(models.isoVersions, {
      foreignKey: 'isoId',
      as: 'versions',
    });
  };

  return ISO;
};
