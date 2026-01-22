export default (sequelize, Sequelize) => {
  const Organization = sequelize.define(
    'organizations',
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING,
        unique: true,
      },
      email: {
        type: Sequelize.STRING,
        defaultValue: '',
      },
      emailHash: {
        type: Sequelize.STRING,
        defaultValue: '',
      },
      description: {
        type: Sequelize.STRING,
        defaultValue: '',
      },
      org_code: {
        type: Sequelize.STRING(10),
        unique: true,
        allowNull: true,
        comment: 'Organization code/identifier (e.g., A55D94)',
        field: 'org_code',
      },
      suspended: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      access_mode: {
        type: Sequelize.ENUM('private', 'invite_only', 'request_to_join'),
        allowNull: false,
        defaultValue: 'private',
        comment: 'Organization visibility and access mode',
        field: 'access_mode',
      },
      default_role: {
        type: Sequelize.ENUM('user', 'moderator'),
        allowNull: false,
        defaultValue: 'user',
        comment: 'Default role for new members',
        field: 'default_role',
      },
    },
    {
      defaultScope: {},
    }
  );

  Organization.associate = function (models) {
    // Multi-user relationship through junction table
    Organization.belongsToMany(models.user, {
      through: models.UserOrg,
      foreignKey: 'organization_id',
      otherKey: 'user_id',
      as: 'members',
    });

    // Primary organization users (denormalized)
    Organization.hasMany(models.user, {
      foreignKey: 'primary_organization_id',
      as: 'primaryUsers',
    });

    Organization.hasMany(models.UserOrg, {
      foreignKey: 'organization_id',
      as: 'userOrganizations',
    });
    Organization.hasMany(models.Request, {
      foreignKey: 'organization_id',
      as: 'joinRequests',
    });
    Organization.hasMany(models.invitation, {
      foreignKey: 'organizationId',
      as: 'invitations',
    });
    Organization.hasMany(models.service_account, {
      foreignKey: 'organization_id',
      as: 'serviceAccounts',
    });
  };

  /**
   * Get discoverable organizations
   * @param {boolean} isAdmin - Whether requester is admin (sees all orgs)
   * @returns {Promise<Organization[]>}
   */
  Organization.getDiscoverable = async function (isAdmin = false) {
    const { default: db } = await import('./index.js');

    // Build where clause - admins see all orgs, others only see public access modes
    const whereClause = { suspended: false };
    if (!isAdmin) {
      whereClause.access_mode = {
        [sequelize.Sequelize.Op.in]: ['invite_only', 'request_to_join'],
      };
    }

    const orgs = await this.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'description', 'access_mode', 'emailHash'],
    });

    // Load member and box counts for each org in parallel
    const results = await Promise.all(
      orgs.map(async org => {
        const members = await db.UserOrg.findAll({
          where: { organization_id: org.id },
        });

        // Count boxes for all members in parallel
        const boxCounts = await Promise.all(
          members.map(async membership => {
            const boxes = await db.box.findAll({
              where: { userId: membership.user_id },
            });
            return {
              total: boxes.length,
              public: boxes.filter(box => box.isPublic).length,
            };
          })
        );

        const totalBoxCount = boxCounts.reduce((sum, count) => sum + count.total, 0);
        const publicBoxCount = boxCounts.reduce((sum, count) => sum + count.public, 0);

        // Return org with counts
        org.members = [];
        org.memberCount = members.length;
        org.publicBoxCount = publicBoxCount;
        org.totalBoxCount = totalBoxCount;

        return org;
      })
    );

    return results;
  };

  return Organization;
};
