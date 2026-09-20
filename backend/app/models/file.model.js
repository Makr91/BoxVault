// file.model.js
export default (sequelize, Sequelize) => {
  const File = sequelize.define('files', {
    fileName: {
      type: Sequelize.STRING,
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
    downloadCount: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    fileSize: {
      type: Sequelize.BIGINT,
      allowNull: false,
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
  });

  File.associate = function (models) {
    File.belongsTo(models.architectures, {
      foreignKey: 'architectureId',
      as: 'architecture',
    });
  };

  return File;
};
