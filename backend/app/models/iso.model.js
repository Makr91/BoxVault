module.exports = (sequelize, Sequelize) => {
  const ISO = sequelize.define('iso', {
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    description: {
      type: Sequelize.STRING,
    },
    filename: {
      type: Sequelize.STRING,
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
    storagePath: {
      type: Sequelize.STRING,
    },
  });

  return ISO;
};
