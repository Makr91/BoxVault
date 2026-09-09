import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { removeUnreferencedIsoFiles } from '../helpers.js';
const { isoFiles: IsoFile, sequelize } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}/architecture/{architecture}/file/delete:
 *   delete:
 *     summary: Delete an ISO file
 *     description: Delete the file record of one architecture of an ISO version in a transaction. The physical file is removed after the commit, and only when no other ISO file record shares its storage path (deduplication within the organization).
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
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('files.notFound'),
      });
    }

    const removed = fileRecord.toJSON();

    const transaction = await sequelize.transaction();
    try {
      await fileRecord.destroy({ transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    await removeUnreferencedIsoFiles([removed]);

    return res.send({ message: req.__('files.deleted') });
  } catch (err) {
    log.error.error('Error deleting ISO file', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { remove };
