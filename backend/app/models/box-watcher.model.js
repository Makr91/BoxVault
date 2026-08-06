export default (sequelize, Sequelize) => {
  const BoxWatcher = sequelize.define(
    'box_watcher',
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
      box_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'boxes',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        field: 'box_id',
      },
    },
    {
      tableName: 'box_watchers',
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'box_id'],
          name: 'unique_box_watcher',
        },
      ],
    }
  );

  BoxWatcher.associate = function (models) {
    BoxWatcher.belongsTo(models.user, {
      foreignKey: 'user_id',
      as: 'user',
    });
    BoxWatcher.belongsTo(models.box, {
      foreignKey: 'box_id',
      as: 'box',
    });
    models.user.hasMany(BoxWatcher, {
      foreignKey: 'user_id',
      as: 'boxWatches',
    });
    models.box.hasMany(BoxWatcher, {
      foreignKey: 'box_id',
      as: 'watchers',
    });
  };

  return BoxWatcher;
};
