// setup.controller.js
import { verifySetupToken } from './setup/verify.js';
import { uploadSSL } from './setup/upload.js';
import { updateConfigs } from './setup/update.js';
import { getConfigs } from './setup/get.js';
import { isSetupComplete } from './setup/check.js';

export { verifySetupToken, uploadSSL, updateConfigs, getConfigs, isSetupComplete };
