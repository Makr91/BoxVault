export default (sequelize, Sequelize) => {
  const IsoVersion = sequelize.define(
    'iso_version',
    {
      versionNumber: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING,
      },
      isoId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'isos',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      releaseNotes: {
        type: Sequelize.TEXT,
        allowNull: true,
        field: 'release_notes',
      },
      deprecated: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      deprecationReason: {
        type: Sequelize.STRING(512),
        allowNull: true,
        field: 'deprecation_reason',
      },
      isPublic: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_public',
      },
      guestAccess: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'guest_access',
      },
      published: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: 'iso_versions',
      indexes: [
        {
          unique: true,
          fields: ['isoId', 'versionNumber'],
        },
      ],
    }
  );

  IsoVersion.associate = function (models) {
    IsoVersion.belongsTo(models.iso, {
      foreignKey: 'isoId',
      as: 'iso',
    });
    IsoVersion.hasMany(models.isoFiles, {
      foreignKey: 'isoVersionId',
      as: 'files',
    });
  };

  return IsoVersion;
};
