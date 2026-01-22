// file.controller.js
import { upload } from './file/upload.js';
import { download } from './file/download.js';
import { info } from './file/info.js';
import { remove } from './file/remove.js';
import { update } from './file/update.js';
import { getDownloadLink } from './file/link.js';

export { upload, download, remove, update, info, getDownloadLink };
