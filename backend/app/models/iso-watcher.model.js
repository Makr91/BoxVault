export default (sequelize, Sequelize) => {
  const IsoWatcher = sequelize.define(
    'iso_watcher',
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
      iso_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'isos',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        field: 'iso_id',
      },
    },
    {
      tableName: 'iso_watchers',
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'iso_id'],
          name: 'unique_iso_watcher',
        },
      ],
    }
  );

  IsoWatcher.associate = function (models) {
    IsoWatcher.belongsTo(models.user, {
      foreignKey: 'user_id',
      as: 'user',
    });
    IsoWatcher.belongsTo(models.iso, {
      foreignKey: 'iso_id',
      as: 'iso',
    });
    models.user.hasMany(IsoWatcher, {
      foreignKey: 'user_id',
      as: 'isoWatches',
    });
    models.iso.hasMany(IsoWatcher, {
      foreignKey: 'iso_id',
      as: 'watchers',
    });
  };

  return IsoWatcher;
};
