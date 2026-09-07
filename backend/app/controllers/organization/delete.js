// delete.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { removeUnreferencedIsoFiles } from '../iso/helpers.js';

const { organization: Organization, iso: ISO, isoVersions: IsoVersion, isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organizationName}:
 *   delete:
 *     summary: Delete an organization
 *     description: Delete an organization with its boxes, ISOs and their files. The rows go in one transaction; the box directory and the ISO files no other record references are removed after it commits (org owner or global admin).
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to delete
 *     responses:
 *       200:
 *         description: Organization deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization and its files deleted successfully."
 *       404:
 *         description: Organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
const _delete = async (req, res) => {
  const { organization: organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    const isos = await ISO.findAll({
      where: { organizationId: organization.id },
      include: [
        {
          model: IsoVersion,
          as: 'versions',
          include: [{ model: IsoFile, as: 'files' }],
        },
      ],
    });
    const isoFiles = isos
      .flatMap(iso => iso.versions)
      .flatMap(version => version.files.map(file => file.toJSON()));

    const transaction = await db.sequelize.transaction();
    try {
      await ISO.destroy({ where: { organizationId: organization.id }, transaction });
      await organization.destroy({ transaction });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    await removeUnreferencedIsoFiles(isoFiles);

    const dirPath = getSecureBoxPath(organizationName);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }

    return res.status(200).send({
      message: req.__('organizations.deleted'),
    });
  } catch (err) {
    log.error.error('Error deleting organization:', err);
    return res.status(500).send({
      message: req.__('organizations.deleteError'),
    });
  }
};

export { _delete as delete };
