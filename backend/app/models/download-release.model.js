export default (sequelize, Sequelize) => {
  const DownloadRelease = sequelize.define(
    'download_release',
    {
      versionNumber: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING,
      },
      downloadId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'downloads',
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
      tableName: 'download_releases',
      indexes: [
        {
          unique: true,
          fields: ['downloadId', 'versionNumber'],
        },
      ],
    }
  );

  DownloadRelease.associate = function (models) {
    DownloadRelease.belongsTo(models.download, {
      foreignKey: 'downloadId',
      as: 'download',
    });
    DownloadRelease.hasMany(models.downloadPatches, {
      foreignKey: 'downloadReleaseId',
      as: 'patches',
    });
  };

  return DownloadRelease;
};
