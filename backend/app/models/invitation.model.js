module.exports = (sequelize, Sequelize) => {
  const Invitation = sequelize.define('invitations', {
    email: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    token: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true,
    },
    expires: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    accepted: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    expired: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    organizationId: {
      type: Sequelize.INTEGER,
      references: {
        model: 'organizations',
        key: 'id',
      },
    },
  });

  Invitation.associate = function (models) {
    Invitation.belongsTo(models.organization, {
      foreignKey: 'organizationId',
      as: 'organization',
    });
  };

  return Invitation;
};
