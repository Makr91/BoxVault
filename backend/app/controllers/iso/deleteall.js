import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { removeUnreferencedIsoFiles } from './helpers.js';
const { iso: ISO, isoVersions: IsoVersion, isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso:
 *   delete:
 *     summary: Delete all ISOs in an organization
 *     description: Delete every ISO of the organization with their versions and file records. A physical file is removed only when no ISO file record of any organization references it any more (deduplication).
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
 *     responses:
 *       200:
 *         description: All ISOs deleted
 *       404:
 *         description: No ISOs to delete
 *       500:
 *         description: Internal server error
 */
const deleteAll = async (req, res) => {
  try {
    const isos = await ISO.findAll({
      where: { organizationId: req.organizationId },
      include: [
        {
          model: IsoVersion,
          as: 'versions',
          include: [{ model: IsoFile, as: 'files' }],
        },
      ],
    });
    if (isos.length === 0) {
      return res.status(404).send({ message: req.__('isos.noIsosFound') });
    }

    const files = isos
      .flatMap(iso => iso.versions)
      .flatMap(version => version.files.map(file => file.toJSON()));

    const deleted = await ISO.destroy({ where: { organizationId: req.organizationId } });
    await removeUnreferencedIsoFiles(files);

    return res.send({ message: req.__('isos.deletedAll', { count: deleted }) });
  } catch (err) {
    log.error.error('Error deleting all ISOs', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { deleteAll };
