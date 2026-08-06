export default (sequelize, Sequelize) => {
  const Box = sequelize.define('box', {
    name: {
      type: Sequelize.STRING,
    },
    description: {
      type: Sequelize.STRING,
    },
    published: {
      type: Sequelize.BOOLEAN,
    },
    isPublic: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
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
    githubRepo: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        is: /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/i,
      },
    },
    workflowFile: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        is: /^[a-zA-Z0-9._-]+\.(?:yml|yaml)$/i,
      },
    },
    cicdUrl: {
      type: Sequelize.STRING,
      allowNull: true,
      validate: {
        isUrl: true,
      },
    },
    shortDescription: {
      type: Sequelize.STRING,
      allowNull: true,
      field: 'short_description',
    },
    metadata: {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Structured box facts pushed by the build pipeline (whitelisted keys only)',
    },
    readme: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    artwork: {
      type: Sequelize.STRING(64),
      allowNull: true,
      comment: "Stored artwork FILENAME inside the box storage directory (e.g. 'artwork.svg')",
    },
  });

  Box.associate = function (models) {
    Box.belongsTo(models.user, {
      foreignKey: 'userId',
      as: 'user',
    });
    Box.belongsTo(models.organization, {
      foreignKey: 'organizationId',
      as: 'organization',
    });
    Box.hasMany(models.versions, {
      foreignKey: 'boxId',
      as: 'versions',
    });
  };

  return Box;
};
