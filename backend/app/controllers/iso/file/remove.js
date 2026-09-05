import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { removeUnreferencedIsoFiles } from '../helpers.js';
const { isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}/architecture/{architecture}/file/delete:
 *   delete:
 *     summary: Delete an ISO file
 *     description: Delete the file record of one architecture of an ISO version. The physical file is removed only when no other ISO file record shares its checksum (deduplication).
 *     tags: [ISOs]
 *     security:
 *       - JwtAuth: []
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
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       404:
 *         description: Organization, ISO, version or file not found
 *       500:
 *         description: Internal server error
 */
const remove = async (req, res) => {
  const { architecture } = req.params;

  try {
    const { version } = req.entities;

    const fileRecord = await IsoFile.findOne({
      where: { isoVersionId: version.id, architecture },
    });
    if (!fileRecord) {
      return res.status(404).send({ message: req.__('files.notFound') });
    }

    const removed = fileRecord.toJSON();

    await fileRecord.destroy();
    await removeUnreferencedIsoFiles([removed]);

    return res.send({ message: req.__('files.deleted') });
  } catch (err) {
    log.error.error('Error deleting ISO file', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { remove };
