export default (sequelize, Sequelize) => {
  const RevokedSession = sequelize.define(
    'revoked_session',
    {
      sid: {
        type: Sequelize.STRING(255),
        primaryKey: true,
        allowNull: false,
      },
      issuer: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        field: 'user_id',
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: 'expires_at',
      },
    },
    {
      tableName: 'revoked_sessions',
    }
  );

  return RevokedSession;
};
