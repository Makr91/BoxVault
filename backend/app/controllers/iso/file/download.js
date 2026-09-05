import fs from 'fs';
import { join } from 'path';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { getIsoStorageRoot } from '../helpers.js';
const { isoFiles: IsoFile, UserOrg } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}/architecture/{architecture}/file/download:
 *   get:
 *     summary: Download an ISO file
 *     description: Stream the ISO file of one architecture of a version, with range support. Public, published ISOs can be downloaded by anyone; any other ISO requires a download token scoped to this file or organization membership.
 *     tags: [ISOs]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: architecture
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: Optional short-lived download token
 *       - in: header
 *         name: Range
 *         schema:
 *           type: string
 *         description: Range header for partial content requests
 *     responses:
 *       200:
 *         description: File download stream
 *       206:
 *         description: Partial content
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Organization, ISO, version or file not found
 *       500:
 *         description: Internal server error
 */
const download = async (req, res) => {
  const { organization, name, versionNumber, architecture } = req.params;
  const { iso, version } = req.entities;
  const isPublic = Boolean(iso.isPublic && iso.published);
  let userId;

  if (req.downloadTokenDecoded) {
    const decoded = req.downloadTokenDecoded;
    ({ userId } = decoded);

    if (
      decoded.organization !== organization ||
      decoded.iso !== name ||
      decoded.versionNumber !== versionNumber ||
      decoded.architecture !== architecture
    ) {
      return res.status(403).send({ message: req.__('files.invalidDownloadToken') });
    }
  } else if (req.userId) {
    ({ userId } = req);
  } else if (!isPublic) {
    return res.status(403).send({ message: req.__('files.noDownloadToken') });
  }

  try {
    if (!isPublic) {
      if (!userId) {
        return res.status(403).send({ message: req.__('files.download.unauthorized') });
      }

      const membership = await UserOrg.findUserOrgRole(userId, iso.organizationId);
      if (!membership) {
        return res.status(403).send({ message: req.__('files.download.unauthorized') });
      }
    }

    const fileRecord = await IsoFile.findOne({
      where: { isoVersionId: version.id, architecture },
    });
    if (!fileRecord) {
      return res.status(404).send({ message: req.__('files.notFound') });
    }

    const fullPath = join(getIsoStorageRoot(), fileRecord.storagePath);

    try {
      await fs.promises.access(fullPath, fs.constants.R_OK);
    } catch (e) {
      log.error.error(`ISO file not found or not readable: ${fullPath}`, e);
      return res.status(404).send({ message: req.__('files.notFound') });
    }

    await fileRecord.increment('downloadCount');

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const { fileName } = fileRecord;

    const { range } = req.headers;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      });
      fs.createReadStream(fullPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      });
      fs.createReadStream(fullPath).pipe(res);
    }
    return undefined;
  } catch (err) {
    log.error.error('Error downloading ISO file', err);
    if (!res.headersSent) {
      return res.status(500).send({ message: req.__('errors.operationFailed') });
    }
    res.end();
    return undefined;
  }
};

export { download };
