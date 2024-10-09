// file.model.js
module.exports = (sequelize, Sequelize) => {
    const File = sequelize.define("files", {
      fileName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      checksum: {
        type: Sequelize.STRING,
        allowNull: true
      },
      checksumType: {
        type: Sequelize.ENUM,
        values: ['NULL', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512'],
        allowNull: true
      },
      downloadCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      fileSize: {
        type: Sequelize.STRING,
        allowNull: false
      },
    });
  
    File.associate = function(models) {
      File.belongsTo(models.architectures, {
        foreignKey: "architectureId",
        as: "architecture"
      });
    };
  
    return File;
  };