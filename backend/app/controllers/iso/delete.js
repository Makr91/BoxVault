import fs from 'fs';
import { join } from 'path';
import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { getIsoStorageRoot } from './helpers.js';
const { iso: ISO } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{isoId}:
 *   delete:
 *     summary: Delete an ISO
 *     description: Delete an ISO file and its database record. Physical file is only deleted if no other records reference it (deduplication).
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
 *         name: isoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the ISO to delete
 *     responses:
 *       200:
 *         description: ISO deleted successfully
 *       404:
 *         description: ISO not found
 *       500:
 *         description: Internal server error
 */
const deleteIso = async (req, res) => {
  const { isoId } = req.params;

  try {
    const iso = await ISO.findByPk(isoId);
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    const { checksum } = iso;
    const { storagePath } = iso;

    // Delete the DB record first
    await iso.destroy();

    // Check if any OTHER ISOs use this checksum/file
    const count = await ISO.count({
      where: { checksum },
    });

    if (count === 0) {
      // No other records reference this file, safe to delete physical file
      const fullPath = join(getIsoStorageRoot(), storagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        log.file.info(`ISO Physical Delete: Removed ${fullPath} as no references remain.`);
      }
    } else {
      log.file.info(
        `ISO Delete: Kept physical file ${storagePath} because ${count} other records reference it.`
      );
    }

    return res.send({ message: req.__('isos.deleted') });
  } catch (err) {
    log.error.error('Error deleting ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { deleteIso as delete };
