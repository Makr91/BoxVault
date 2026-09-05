import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { removeUnreferencedIsoFiles } from '../helpers.js';
const { isoVersions: IsoVersion, isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}:
 *   delete:
 *     summary: Delete a specific version of an ISO
 *     description: Delete the version and its file records. A physical file is removed only when no other ISO file record shares its checksum (deduplication).
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
 *         description: Version number to delete
 *     responses:
 *       200:
 *         description: Version deleted successfully
 *       404:
 *         description: Organization, ISO or version not found
 *       500:
 *         description: Internal server error
 */
const deleteVersion = async (req, res) => {
  const { versionNumber } = req.params;

  try {
    const { isoData: iso } = req;

    const version = await IsoVersion.findOne({
      where: { versionNumber, isoId: iso.id },
      include: [{ model: IsoFile, as: 'files' }],
    });
    if (!version) {
      return res.status(404).send({ message: req.__('isos.versions.notFound') });
    }

    const files = version.files.map(file => file.toJSON());

    await version.destroy();
    await removeUnreferencedIsoFiles(files);

    return res.send({ message: req.__('isos.versions.deleted') });
  } catch (err) {
    log.error.error('Error deleting ISO version', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { deleteVersion as delete };
