export default (sequelize, Sequelize) => {
  const ServiceAccount = sequelize.define(
    'service_accounts',
    {
      username: {
        type: Sequelize.STRING,
      },
      token: {
        type: Sequelize.STRING,
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
    },
    {
      indexes: [
        {
          unique: true,
          fields: ['username'],
          name: 'service_accounts_username',
        },
        {
          unique: true,
          fields: ['token'],
          name: 'service_accounts_token',
        },
      ],
    }
  );

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
    const { default: db } = await import('./index.js');

    // Get organizations where user has admin or owner role
    const userOrgs = await db.UserOrg.findAll({
      where: {
        user_id: userId,
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
      // Tokens are stored hashed and are shown exactly once at creation —
      // never return the stored hash to clients.
      attributes: { exclude: ['token'] },
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
