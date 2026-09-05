export default (sequelize, Sequelize) => {
  const IsoFile = sequelize.define(
    'iso_file',
    {
      architecture: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      fileName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      fileSize: {
        type: Sequelize.BIGINT,
        allowNull: false,
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
      downloadCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      isoVersionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'iso_versions',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'iso_files',
      indexes: [
        {
          unique: true,
          fields: ['isoVersionId', 'architecture'],
        },
      ],
    }
  );

  IsoFile.associate = function (models) {
    IsoFile.belongsTo(models.isoVersions, {
      foreignKey: 'isoVersionId',
      as: 'version',
    });
  };

  return IsoFile;
};
