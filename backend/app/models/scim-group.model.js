/**
 * ScimGroup Model
 * Raw mirror of one SCIM Group pushed by the auth server. Each row is one
 * (issuer, org_uuid, role) group with its full member list (auth-server user
 * UUIDs) plus the org metadata carried by the Group extension. Membership in
 * the mirrored BoxVault org is recomputed from ALL rows of an org_uuid on
 * every change (highest privilege wins across overlapping groups).
 */
export default (sequelize, Sequelize) => {
  const ScimGroup = sequelize.define(
    'scim_group',
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: 'Unique SCIM group row identifier; doubles as the BoxVault-assigned SCIM id',
      },
      issuer: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'OIDC issuer (iss) of the auth server that pushed this group',
      },
      org_uuid: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Immutable org UUID from the auth server (Group extension orgUuid)',
        field: 'org_uuid',
      },
      role: {
        type: Sequelize.ENUM('owner', 'admin', 'member'),
        allowNull: false,
        comment: 'Auth-server org role this group carries (Group externalId = <orgUuid>:<role>)',
      },
      members: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: [],
        comment: 'Auth-server user UUIDs in this group (full desired state)',
      },
      org_name: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Mutable org display name from the Group displayName',
        field: 'org_name',
      },
      customer_id: {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: 'Admin-assigned 6-hex customer ID from the Group extension (nullable)',
        field: 'customer_id',
      },
      personal: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Whether the auth server marks this org as a personal org',
      },
    },
    {
      tableName: 'scim_group_members',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          unique: true,
          fields: ['issuer', 'org_uuid', 'role'],
          name: 'unique_scim_group',
        },
        {
          fields: ['org_uuid'],
          name: 'idx_scim_group_org_uuid',
        },
      ],
      comment: 'Raw SCIM Group state pushed by the auth server, per (issuer, org, role)',
    }
  );

  /**
   * All stored role groups of one org for one issuer.
   * @param {string} issuer - OIDC issuer
   * @param {string} orgUuid - Auth-server org UUID
   * @param {Object|null} transaction - Optional transaction
   * @returns {Promise<ScimGroup[]>}
   */
  ScimGroup.findByOrg = function (issuer, orgUuid, transaction = null) {
    return this.findAll({
      where: { issuer, org_uuid: orgUuid },
      ...(transaction ? { transaction } : {}),
    });
  };

  return ScimGroup;
};
