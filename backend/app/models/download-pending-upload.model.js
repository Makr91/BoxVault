export default (sequelize, Sequelize) => {
  const DownloadPendingUpload = sequelize.define(
    'download_pending_upload',
    {
      id: {
        type: Sequelize.STRING(32),
        primaryKey: true,
        allowNull: false,
      },
      fileName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      size: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      checksum: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      checksumType: {
        type: Sequelize.ENUM,
        values: ['NULL', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512'],
        allowNull: true,
      },
      storagePath: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      guessProduct: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
        field: 'guess_product',
      },
      guessRelease: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
        field: 'guess_release',
      },
      guessPatch: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'release',
        field: 'guess_patch',
      },
      guessKey: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
        field: 'guess_key',
      },
      guessKind: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'other',
        field: 'guess_kind',
      },
      guessPlatform: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'any',
        field: 'guess_platform',
      },
      guessArchitecture: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'any',
        field: 'guess_architecture',
      },
      guessLanguage: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'any',
        field: 'guess_language',
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      organizationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'organizations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'download_pending_uploads',
    }
  );

  DownloadPendingUpload.associate = function (models) {
    DownloadPendingUpload.belongsTo(models.user, {
      foreignKey: 'userId',
      as: 'user',
    });
    DownloadPendingUpload.belongsTo(models.organization, {
      foreignKey: 'organizationId',
      as: 'organization',
    });
  };

  return DownloadPendingUpload;
};
