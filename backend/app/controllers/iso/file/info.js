import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { canSeeIso, resolveIsoViewer } from '../visibility.js';
const { isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}/architecture/{architecture}/file/info:
 *   get:
 *     summary: Get ISO file information
 *     description: Retrieve the file record of one architecture of an ISO version. A public, published ISO is readable by anyone; any other ISO requires membership of its organization.
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
 *                 fileName:
 *                   type: string
 *                 fileSize:
 *                   type: integer
 *                 checksum:
 *                   type: string
 *                 checksumType:
 *                   type: string
 *                 downloadCount:
 *                   type: integer
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: The ISO is not visible to the caller
 *       404:
 *         description: Organization, ISO, version or file not found
 *       500:
 *         description: Internal server error
 */
const info = async (req, res) => {
  const { architecture } = req.params;

  try {
    const { iso, version } = req.entities;

    const viewer = await resolveIsoViewer(req);
    if (!canSeeIso(viewer, iso)) {
      return res.status(403).send({ message: req.__('files.info.unauthorized') });
    }

    const fileRecord = await IsoFile.findOne({
      where: { isoVersionId: version.id, architecture },
    });
    if (!fileRecord) {
      return res.status(404).send({ message: req.__('files.notFound') });
    }

    return res.send({
      fileName: fileRecord.fileName,
      fileSize: fileRecord.fileSize,
      checksum: fileRecord.checksum,
      checksumType: fileRecord.checksumType,
      downloadCount: fileRecord.downloadCount,
      createdAt: fileRecord.createdAt,
      updatedAt: fileRecord.updatedAt,
    });
  } catch (err) {
    log.error.error('Error retrieving ISO file info', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { info };
