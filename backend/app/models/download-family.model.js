export default (sequelize, Sequelize) => {
  const DownloadFamily = sequelize.define(
    'download_family',
    {
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      vendor: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      docsUrl: {
        type: Sequelize.STRING,
        allowNull: true,
        field: 'docs_url',
        validate: {
          isUrl: true,
        },
      },
      notesUrl: {
        type: Sequelize.STRING,
        allowNull: true,
        field: 'notes_url',
        validate: {
          isUrl: true,
        },
      },
      iconUrl: {
        type: Sequelize.STRING,
        allowNull: true,
        field: 'icon_url',
        validate: {
          isUrl: true,
        },
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
        field: 'organizationId',
      },
    },
    {
      tableName: 'download_families',
      indexes: [
        {
          unique: true,
          fields: ['organizationId', 'name'],
        },
      ],
    }
  );

  DownloadFamily.associate = function (models) {
    DownloadFamily.belongsTo(models.organization, {
      foreignKey: 'organizationId',
      as: 'organization',
    });
  };

  return DownloadFamily;
};
