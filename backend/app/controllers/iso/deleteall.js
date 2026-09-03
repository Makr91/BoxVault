import fs from 'fs';
import { join } from 'path';
import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { getIsoStorageRoot } from './helpers.js';
const { iso: ISO, Sequelize } = db;
const { Op } = Sequelize;

/**
 * @swagger
 * /api/organization/{organization}/iso:
 *   delete:
 *     summary: Delete all ISOs in an organization
 *     description: Delete every ISO of the organization. A physical file is removed only when no ISO of any organization references it any more (deduplication).
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
    const isos = await ISO.findAll({ where: { organizationId: req.organizationId } });
    if (isos.length === 0) {
      return res.status(404).send({ message: req.__('isos.noIsosFound') });
    }

    const deleted = await ISO.destroy({ where: { organizationId: req.organizationId } });

    const checksums = [...new Set(isos.map(iso => iso.checksum))];
    const stillReferenced = await ISO.findAll({
      where: { checksum: { [Op.in]: checksums } },
      attributes: ['checksum'],
    });
    const keep = new Set(stillReferenced.map(iso => iso.checksum));
    const root = getIsoStorageRoot();
    isos
      .filter(iso => !keep.has(iso.checksum))
      .forEach(iso => {
        const fullPath = join(root, iso.storagePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          log.file.info(`ISO Physical Delete: Removed ${fullPath} as no references remain.`);
        }
      });

    return res.send({ message: req.__('isos.deletedAll', { count: deleted }) });
  } catch (err) {
    log.error.error('Error deleting all ISOs', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { deleteAll };
