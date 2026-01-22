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

    Organization.hasMany(models.box, {
      foreignKey: 'organizationId',
      as: 'box',
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
    const whereClause = {};
    if (!isAdmin) {
      whereClause.access_mode = {
        [sequelize.Sequelize.Op.in]: ['invite_only', 'request_to_join'],
      };
    }

    const organizations = await this.findAll({
      where: whereClause,
      include: [
        {
          model: db.box,
          as: 'box',
          attributes: ['id', 'isPublic'],
        },
        {
          model: db.user,
          as: 'members',
          attributes: ['id'],
          through: { attributes: [] },
        },
      ],
    });

    return organizations.map(org => {
      const boxes = org.box || [];
      const publicBoxes = boxes.filter(b => b.isPublic);
      const orgData = org.toJSON();

      orgData.memberCount = org.members ? org.members.length : 0;
      orgData.publicBoxCount = publicBoxes.length;
      orgData.totalBoxCount = boxes.length;

      return orgData;
    });
  };

  return Organization;
};
