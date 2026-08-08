/**
 * PushSubscription Model
 * Web Push endpoints registered by browsers against BoxVault's own VAPID keys
 */
export default (sequelize, Sequelize) => {
  const PushSubscription = sequelize.define(
    'PushSubscription',
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: 'Unique subscription identifier',
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Reference to users table',
        field: 'user_id',
      },
      endpoint: {
        type: Sequelize.STRING(512),
        allowNull: false,
        comment: 'Push service endpoint URL issued by the browser',
      },
      p256dh: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Client public key used to encrypt the payload',
      },
      auth: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Client auth secret used to encrypt the payload',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field: 'created_at',
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field: 'updated_at',
      },
    },
    {
      tableName: 'push_subscriptions',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          unique: true,
          fields: ['endpoint'],
          name: 'unique_push_endpoint',
        },
        {
          fields: ['user_id'],
          name: 'idx_push_subscriptions_user_id',
        },
      ],
      comment: 'Web Push subscriptions owned by BoxVault',
    }
  );

  PushSubscription.associate = function (models) {
    PushSubscription.belongsTo(models.user, {
      foreignKey: 'user_id',
      as: 'user',
    });
    models.user.hasMany(PushSubscription, {
      foreignKey: 'user_id',
      as: 'pushSubscriptions',
    });
  };

  return PushSubscription;
};
