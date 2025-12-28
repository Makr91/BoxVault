module.exports = (sequelize, Sequelize) => {
  const User = sequelize.define('users', {
    username: {
      type: Sequelize.STRING,
    },
    email: {
      type: Sequelize.STRING,
    },
    password: {
      type: Sequelize.STRING,
    },
    emailHash: {
      type: Sequelize.STRING,
    },
    verified: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    verificationToken: {
      type: Sequelize.STRING,
    },
    verificationTokenExpires: {
      type: Sequelize.DATE,
    },
    suspended: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    authProvider: {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: 'local',
      field: 'auth_provider',
    },
    externalId: {
      type: Sequelize.STRING(255),
      allowNull: true,
      field: 'external_id',
    },
    linkedAt: {
      type: Sequelize.DATE,
      allowNull: true,
      field: 'linked_at',
    },
  });

  User.associate = function (models) {
    User.belongsTo(models.organization, {
      foreignKey: 'organizationId',
      as: 'organization',
    });
    User.hasMany(models.box, {
      foreignKey: 'userId',
      as: 'box',
    });
    User.hasMany(models.credential, {
      foreignKey: 'user_id',
      as: 'credentials',
    });
  };

  return User;
};
