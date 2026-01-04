const uploadController = require('./iso/upload');
const findAllController = require('./iso/findall');
const findOneController = require('./iso/findone');
const deleteController = require('./iso/delete');
const downloadController = require('./iso/download');
const updateController = require('./iso/update');
const linkController = require('./iso/link');

module.exports = {
  upload: uploadController.upload,
  findAll: findAllController.findAll,
  findOne: findOneController.findOne,
  delete: deleteController.delete,
  download: downloadController.download,
  downloadByName: downloadController.downloadByName,
  update: updateController.update,
  getDownloadLink: linkController.getDownloadLink,
};
