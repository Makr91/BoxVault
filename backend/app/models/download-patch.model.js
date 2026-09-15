export default (sequelize, Sequelize) => {
  const DownloadPatch = sequelize.define(
    'download_patch',
    {
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING,
      },
      kind: {
        type: Sequelize.ENUM,
        values: ['release', 'fixpack', 'interim-fix', 'hotfix'],
        allowNull: false,
        defaultValue: 'release',
      },
      releasedAt: {
        type: Sequelize.DATEONLY,
        allowNull: true,
        field: 'released_at',
      },
      notesUrl: {
        type: Sequelize.STRING,
        allowNull: true,
        field: 'notes_url',
      },
      downloadReleaseId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'download_releases',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'download_patches',
      indexes: [
        {
          unique: true,
          fields: ['downloadReleaseId', 'name'],
        },
      ],
    }
  );

  DownloadPatch.associate = function (models) {
    DownloadPatch.belongsTo(models.downloadReleases, {
      foreignKey: 'downloadReleaseId',
      as: 'release',
    });
    DownloadPatch.hasMany(models.downloadFiles, {
      foreignKey: 'downloadPatchId',
      as: 'files',
    });
  };

  return DownloadPatch;
};
