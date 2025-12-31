// file.controller.js
const { upload } = require('./file/upload');
const { download } = require('./file/download');
const { info } = require('./file/info');
const { remove } = require('./file/remove');
const { update } = require('./file/update');
const { getDownloadLink } = require('./file/link');

module.exports = {
  upload,
  download,
  remove,
  update,
  info,
  getDownloadLink,
};
