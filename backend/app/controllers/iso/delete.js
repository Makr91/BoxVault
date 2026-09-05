import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { removeUnreferencedIsoFiles } from './helpers.js';
const { iso: ISO, isoVersions: IsoVersion, isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}:
 *   delete:
 *     summary: Delete an ISO
 *     description: Delete an ISO with its versions and file records. A physical file is removed only when no other ISO file record shares its checksum (deduplication).
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
 *     responses:
 *       200:
 *         description: ISO deleted successfully
 *       404:
 *         description: ISO not found
 *       500:
 *         description: Internal server error
 */
const deleteIso = async (req, res) => {
  const { name } = req.params;

  try {
    const iso = await ISO.findOne({
      where: { name, organizationId: req.organizationId },
      include: [
        {
          model: IsoVersion,
          as: 'versions',
          include: [{ model: IsoFile, as: 'files' }],
        },
      ],
    });
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    const files = iso.versions.flatMap(version => version.files.map(file => file.toJSON()));

    await iso.destroy();
    await removeUnreferencedIsoFiles(files);

    return res.send({ message: req.__('isos.deleted') });
  } catch (err) {
    log.error.error('Error deleting ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { deleteIso as delete };
