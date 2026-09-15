import db from '../models/index.js';
import { log } from '../utils/Logger.js';
import { problem } from '../utils/problem.js';

const {
  organization: Organization,
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
  Sequelize,
} = db;
const { Op } = Sequelize;

const notFound = (req, res, title) => problem(res, req, { status: 404, type: 'not-found', title });

const verifyDownloadFilePath = async (req, res, next) => {
  const { organization, name, versionNumber, patch: patchName, key } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      log.app.warn('Download path verification failed: Organization not found', { organization });
      return notFound(
        req,
        res,
        req.__('organizations.organizationNotFoundWithName', { organization })
      );
    }

    const download = await Download.findOne({
      where: { name, organizationId: organizationData.id },
    });

    if (!download) {
      log.app.warn('Download path verification failed: Download not found', {
        name,
        organization,
      });
      return notFound(req, res, req.__('downloads.notFoundWithName', { name, organization }));
    }

    const release = await DownloadRelease.findOne({
      where: { versionNumber, downloadId: download.id },
    });

    if (!release) {
      log.app.warn('Download path verification failed: Release not found', {
        versionNumber,
        name,
      });
      return notFound(req, res, req.__('downloads.releases.notFound'));
    }

    const patch = await DownloadPatch.findOne({
      where: { name: patchName, downloadReleaseId: release.id },
    });

    if (!patch) {
      log.app.warn('Download path verification failed: Patch not found', {
        patchName,
        versionNumber,
      });
      return notFound(req, res, req.__('downloads.patches.notFound'));
    }

    const file = await DownloadFile.findOne({
      where: { downloadPatchId: patch.id, [Op.or]: [{ key }, { fileName: key }] },
    });

    if (!file) {
      log.app.warn('Download path verification failed: File not found', { key, patchName });
      return notFound(req, res, req.__('files.notFound'));
    }

    req.entities = {
      organization: organizationData,
      download,
      release,
      patch,
      file,
    };

    return next();
  } catch (err) {
    log.error.error('Error during download file path verification:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('files.pathVerificationError'),
    });
  }
};

export { verifyDownloadFilePath };
