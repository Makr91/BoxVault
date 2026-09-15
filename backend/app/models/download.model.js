export default (sequelize, Sequelize) => {
  const Download = sequelize.define('download', {
    name: {
      type: Sequelize.STRING,
    },
    description: {
      type: Sequelize.STRING,
    },
    published: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    isPublic: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    family: {
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
    userId: {
      type: Sequelize.INTEGER,
      references: {
        model: 'users',
        key: 'id',
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
  });

  Download.associate = function (models) {
    Download.belongsTo(models.user, {
      foreignKey: 'userId',
      as: 'user',
    });
    Download.belongsTo(models.organization, {
      foreignKey: 'organizationId',
      as: 'organization',
    });
    Download.hasMany(models.downloadReleases, {
      foreignKey: 'downloadId',
      as: 'releases',
    });
  };

  return Download;
};
