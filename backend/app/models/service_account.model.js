module.exports = (sequelize, Sequelize) => {
  const ServiceAccount = sequelize.define('service_accounts', {
    username: {
      type: Sequelize.STRING,
      unique: true,
    },
    token: {
      type: Sequelize.STRING,
      unique: true,
    },
    expiresAt: {
      type: Sequelize.DATE,
    },
    description: {
      type: Sequelize.STRING,
    },
    organization_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      comment: 'Organization this service account is scoped to',
      field: 'organization_id',
    },
  });

  ServiceAccount.associate = function (models) {
    ServiceAccount.belongsTo(models.user, {
      foreignKey: 'userId',
      as: 'user',
    });
    ServiceAccount.belongsTo(models.organization, {
      foreignKey: 'organization_id',
      as: 'organization',
    });
  };

  /**
   * Get service accounts for user filtered by organizations they can manage
   * @param {number} userId - User ID
   * @returns {Promise<ServiceAccount[]>}
   */
  ServiceAccount.getForUser = async function (userId) {
    const db = require('./index');

    // Get organizations where user has moderator or admin role
    const userOrgs = await db.UserOrg.findAll({
      where: {
        user_id: userId,
        role: {
          [Sequelize.Op.in]: ['moderator', 'admin'],
        },
      },
    });

    const orgIds = userOrgs.map(uo => uo.organization_id);

    return this.findAll({
      where: {
        userId,
        organization_id: {
          [Sequelize.Op.in]: orgIds,
        },
      },
      include: [
        {
          model: db.organization,
          as: 'organization',
          attributes: ['id', 'name'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  };

  return ServiceAccount;
};
