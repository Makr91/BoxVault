import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { isGuestOf } from '../../../utils/orgMembership.js';
import { canSeeIso, canSeeIsoFile, canSeeIsoVersion, resolveIsoViewer } from '../visibility.js';
const { isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}/architecture/{architecture}/file/info:
 *   get:
 *     summary: Get ISO file information
 *     description: Retrieve the file record of one architecture of an ISO version. A public, published ISO is readable by anyone; any other ISO requires a writing membership of its organization, a guest of the organization reading it only while it is published and flagged for guests. download_count is null to a guest of the organization; a version or file beyond the caller's reach answers 404.
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
 *                 file_name:
 *                   type: string
 *                 file_size:
 *                   type: integer
 *                 checksum:
 *                   type: string
 *                 checksum_type:
 *                   type: string
 *                 download_count:
 *                   type: integer
 *                   nullable: true
 *                   description: The count, null to a guest of the organization
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 updated_at:
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
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('files.info.unauthorized'),
      });
    }

    const fileRecord = canSeeIsoVersion(viewer, iso, version)
      ? await IsoFile.findOne({ where: { isoVersionId: version.id, architecture } })
      : null;
    if (!fileRecord || !canSeeIsoFile(viewer, iso, version, fileRecord)) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('files.notFound'),
      });
    }

    return res.send({
      file_name: fileRecord.fileName,
      file_size: fileRecord.fileSize,
      checksum: fileRecord.checksum,
      checksum_type: fileRecord.checksumType,
      download_count: isGuestOf(viewer, iso.organizationId) ? null : fileRecord.downloadCount,
      created_at: fileRecord.createdAt,
      updated_at: fileRecord.updatedAt,
    });
  } catch (err) {
    log.error.error('Error retrieving ISO file info', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { info };
