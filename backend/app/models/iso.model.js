export default (sequelize, Sequelize) => {
  const ISO = sequelize.define('iso', {
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    description: {
      type: Sequelize.STRING,
    },
    fileName: {
      type: Sequelize.STRING,
      field: 'filename',
    },
    size: {
      type: Sequelize.BIGINT,
    },
    checksum: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    checksumType: {
      type: Sequelize.STRING,
      defaultValue: 'sha256',
    },
    isPublic: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    published: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    storagePath: {
      type: Sequelize.STRING,
    },
    downloadCount: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  });

  return ISO;
};
