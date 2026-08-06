export default (sequelize, Sequelize) => {
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
    accepted_at: {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When the invitation was accepted',
      field: 'accepted_at',
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
    invited_role: {
      type: Sequelize.ENUM('member', 'admin'),
      allowNull: false,
      defaultValue: 'member',
      comment: 'Role to assign when invitation is accepted',
      field: 'invited_role',
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
