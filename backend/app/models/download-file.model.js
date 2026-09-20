export default (sequelize, Sequelize) => {
  const DownloadFile = sequelize.define(
    'download_file',
    {
      key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      fileName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      kind: {
        type: Sequelize.ENUM,
        values: [
          'installer',
          'fixpack',
          'hotfix',
          'interim-fix',
          'container-image',
          'package',
          'template',
          'notes',
          'tool',
          'other',
        ],
        allowNull: false,
        defaultValue: 'other',
      },
      platform: {
        type: Sequelize.ENUM,
        values: ['linux', 'windows', 'macos', 'omnios', 'other', 'any'],
        allowNull: false,
        defaultValue: 'any',
      },
      architecture: {
        type: Sequelize.ENUM,
        values: ['x64', 'x86', 'arm64', 'other', 'any'],
        allowNull: false,
        defaultValue: 'any',
      },
      language: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'any',
      },
      variant: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      fileSize: {
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
      downloadCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      storagePath: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      original: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      linksTo: {
        type: Sequelize.INTEGER,
        allowNull: true,
        field: 'links_to',
        references: {
          model: 'download_files',
          key: 'id',
        },
      },
      downloadPatchId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'download_patches',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'download_files',
      indexes: [
        {
          unique: true,
          fields: ['downloadPatchId', 'key'],
        },
      ],
    }
  );

  DownloadFile.associate = function (models) {
    DownloadFile.belongsTo(models.downloadPatches, {
      foreignKey: 'downloadPatchId',
      as: 'patch',
    });
  };

  return DownloadFile;
};
