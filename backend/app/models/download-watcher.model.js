export default (sequelize, Sequelize) => {
  const DownloadWatcher = sequelize.define(
    'download_watcher',
    {
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        field: 'user_id',
      },
      download_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'downloads',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        field: 'download_id',
      },
    },
    {
      tableName: 'download_watchers',
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'download_id'],
          name: 'unique_download_watcher',
        },
      ],
    }
  );

  DownloadWatcher.associate = function (models) {
    DownloadWatcher.belongsTo(models.user, {
      foreignKey: 'user_id',
      as: 'user',
    });
    DownloadWatcher.belongsTo(models.download, {
      foreignKey: 'download_id',
      as: 'download',
    });
    models.user.hasMany(DownloadWatcher, {
      foreignKey: 'user_id',
      as: 'downloadWatches',
    });
    models.download.hasMany(DownloadWatcher, {
      foreignKey: 'download_id',
      as: 'watchers',
    });
  };

  return DownloadWatcher;
};
