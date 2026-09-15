import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { canSeeDownload, isMemberOf, resolveDownloadViewer } from '../visibility.js';

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file/{key}/info:
 *   get:
 *     summary: Get download file information
 *     description: Retrieve the file row of one file of a patch, by key or file name. The product must be visible to the caller.
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
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: File information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: string
 *                 fileName:
 *                   type: string
 *                 kind:
 *                   type: string
 *                 platform:
 *                   type: string
 *                 architecture:
 *                   type: string
 *                 language:
 *                   type: string
 *                 variant:
 *                   type: string
 *                   nullable: true
 *                 fileSize:
 *                   type: integer
 *                 checksum:
 *                   type: string
 *                 checksumType:
 *                   type: string
 *                 downloadCount:
 *                   type: integer
 *                   nullable: true
 *                   description: The count for a member of the organization, null for anyone else
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: The product is not visible to the caller
 *       404:
 *         description: Organization, product, release, patch or file not found
 *       500:
 *         description: Internal server error
 */
const info = async (req, res) => {
  try {
    const { download, file } = req.entities;

    const viewer = await resolveDownloadViewer(req);
    if (!canSeeDownload(viewer, download)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('files.info.unauthorized'),
      });
    }

    return res.send({
      key: file.key,
      fileName: file.fileName,
      kind: file.kind,
      platform: file.platform,
      architecture: file.architecture,
      language: file.language,
      variant: file.variant,
      fileSize: file.fileSize,
      checksum: file.checksum,
      checksumType: file.checksumType,
      downloadCount: isMemberOf(viewer, download.organizationId) ? file.downloadCount : null,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    });
  } catch (err) {
    log.error.error('Error retrieving download file info', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { info };
