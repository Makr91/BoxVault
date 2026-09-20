import fs from 'fs';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { absolutePath } from '../helpers.js';
import { canSeeDownload, canSeeFile, resolveDownloadViewer } from '../visibility.js';

const forbidden = (req, res, key) =>
  problem(res, req, { status: 403, type: 'forbidden', title: req.__(key) });

const fileNotFound = (req, res) =>
  problem(res, req, { status: 404, type: 'not-found', title: req.__('files.notFound') });

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/{key}/download:
 *   get:
 *     summary: Download a file of a patch
 *     description: Stream the bytes of one file of a patch, by key or file name, with range support and Content-Disposition attachment carrying the file name. A public product, release, patch and file can be downloaded by anyone; anything narrower requires a download token scoped to this file, or credentials (session JWT, service account as Basic or Bearer) of a caller whose reach meets the product, release, patch and file, a row beyond it answering 404.
 *     tags: [Downloads]
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
 *         description: Product name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Release identifier
 *       - in: path
 *         name: patch
 *         required: true
 *         schema:
 *           type: string
 *         description: Patch name
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: File key or file name
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
 *         description: Organization, product, release, patch or file not found
 *       500:
 *         description: Internal server error
 */
const download = async (req, res) => {
  const { organization, name, versionNumber, patch: patchName, key } = req.params;
  const { download: product, release, patch: patchData, file } = req.entities;
  const isPublic = Boolean(product.isPublic && product.published);
  const open = isPublic && canSeeFile(null, product, release, patchData, file);

  if (req.downloadTokenDecoded) {
    const decoded = req.downloadTokenDecoded;

    if (
      decoded.organization !== organization ||
      decoded.download !== name ||
      decoded.version_number !== versionNumber ||
      decoded.patch !== patchName ||
      (decoded.key !== key && decoded.key !== file.key)
    ) {
      return forbidden(req, res, 'files.invalidDownloadToken');
    }
  } else if (!req.userId && !isPublic) {
    return forbidden(req, res, 'files.noDownloadToken');
  }

  try {
    if (!open && !req.downloadTokenDecoded) {
      const viewer = await resolveDownloadViewer(req);
      if (!canSeeDownload(viewer, product)) {
        return forbidden(req, res, 'files.download.unauthorized');
      }
      if (!canSeeFile(viewer, product, release, patchData, file)) {
        return fileNotFound(req, res);
      }
    }

    if (!file.storagePath) {
      return fileNotFound(req, res);
    }

    const fullPath = absolutePath(file.storagePath);

    try {
      await fs.promises.access(fullPath, fs.constants.R_OK);
    } catch (e) {
      log.error.error(`Download file not found or not readable: ${fullPath}`, e);
      return fileNotFound(req, res);
    }

    await file.increment('downloadCount');

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const { fileName } = file;

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
    log.error.error('Error downloading download file', err);
    if (!res.headersSent) {
      return problem(res, req, {
        status: 500,
        type: 'internal',
        title: req.__('errors.operationFailed'),
      });
    }
    res.end();
    return undefined;
  }
};

export { download };
