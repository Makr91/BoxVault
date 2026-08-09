export default (sequelize, Sequelize) => {
  const User = sequelize.define('users', {
    username: {
      type: Sequelize.STRING,
    },
    email: {
      type: Sequelize.STRING,
    },
    name: {
      type: Sequelize.STRING,
      allowNull: true,
      comment:
        'Human display name. Optional: SCIM displayName/name.formatted at provision/PUT, then the OIDC name claim at login (fresher, overwrites), else null and username is the render-time fallback',
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
    preferredLanguage: {
      type: Sequelize.STRING(35),
      allowNull: true,
      comment:
        'RFC 7643 preferredLanguage: BCP 47 tag the user reads. Drives outbound mail and notification language. Null means unset and the org locale, then the configured default, apply',
      field: 'preferred_language',
    },
    locale: {
      type: Sequelize.STRING(35),
      allowNull: true,
      comment:
        'RFC 7643 locale: BCP 47 tag for formatting (dates, numbers). Distinct from preferredLanguage and only a fallback for it',
    },
    preferredTheme: {
      type: Sequelize.STRING(10),
      allowNull: true,
      comment:
        'Colour-scheme preference: light, dark, or auto. Variant only — the brand pack is a property of the site, never of the user. Null means unset and the browser-local choice applies',
      field: 'preferred_theme',
    },
    timezone: {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: 'RFC 7643 timezone: Olson name, stored for consumers that need it',
    },
    sessionsInvalidAfter: {
      type: Sequelize.DATE,
      allowNull: true,
      field: 'sessions_invalid_after',
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
    avatar_url: {
      type: Sequelize.STRING,
      allowNull: true,
      comment:
        'Provider avatar URL. Three-tier contract: SCIM photos at provision/PUT, then the OIDC picture claim at login (fresher, overwrites), else null and the email-hash gravatar is the render-time fallback',
      field: 'avatar_url',
    },
    primary_organization_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Primary organization for this user (denormalized for performance)',
      field: 'primary_organization_id',
    },
    entitlements: {
      type: Sequelize.JSON,
      allowNull: true,
      comment:
        'RFC 7643 core entitlements pushed by SCIM: array of {value,type,display}. Full desired state — absent attribute on push clears to null',
      field: 'entitlements',
    },
  });

  User.associate = function (models) {
    // Primary organization relationship (denormalized)
    User.belongsTo(models.organization, {
      foreignKey: 'primary_organization_id',
      as: 'primaryOrganization',
    });

    // Multi-organization relationship through junction table
    User.belongsToMany(models.organization, {
      through: models.UserOrg,
      foreignKey: 'user_id',
      otherKey: 'organization_id',
      as: 'organizations',
    });

    User.hasMany(models.box, {
      foreignKey: 'userId',
      as: 'box',
    });
    User.hasMany(models.credential, {
      foreignKey: 'user_id',
      as: 'credentials',
    });
    User.hasMany(models.UserOrg, {
      foreignKey: 'user_id',
      as: 'userOrganizations',
    });
    User.hasMany(models.Request, {
      foreignKey: 'user_id',
      as: 'joinRequests',
    });
  };

  /**
   * Get user's role in specific organization
   * @param {number} organizationId - Organization ID
   * @returns {Promise<string|null>} Role name or null if not member
   */
  User.prototype.getOrganizationRole = async function (organizationId) {
    const membership = await sequelize.models.UserOrg.findUserOrgRole(this.id, organizationId);
    return membership ? membership.role : null;
  };

  /**
   * Check if user has specific role in organization
   * @param {number} organizationId - Organization ID
   * @param {string|string[]} requiredRole - Role(s) to check for
   * @returns {Promise<boolean>}
   */
  User.prototype.hasOrganizationRole = function (organizationId, requiredRole) {
    return sequelize.models.UserOrg.hasRole(this.id, organizationId, requiredRole);
  };

  /**
   * Get all organizations user belongs to with roles
   * @returns {Promise<UserOrg[]>}
   */
  User.prototype.getAllOrganizations = function () {
    return sequelize.models.UserOrg.getUserOrganizations(this.id);
  };

  /**
   * Get user's primary organization
   * @returns {Promise<UserOrg|null>}
   */
  User.prototype.getPrimaryOrganization = function () {
    return sequelize.models.UserOrg.getPrimaryOrganization(this.id);
  };

  return User;
};
