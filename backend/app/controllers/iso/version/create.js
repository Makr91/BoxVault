import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
const { isoVersions: IsoVersion } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version:
 *   post:
 *     summary: Create a new version for an ISO
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - versionNumber
 *             properties:
 *               versionNumber:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Version created
 *       400:
 *         description: Invalid version number
 *       404:
 *         description: Organization or ISO not found
 *       409:
 *         description: The version already exists for this ISO
 *       500:
 *         description: Internal server error
 */
const create = async (req, res) => {
  const { versionNumber, description } = req.body;

  try {
    const { isoData: iso } = req;

    const version = await IsoVersion.create({
      versionNumber,
      description,
      isoId: iso.id,
    });

    return res.status(201).send(version);
  } catch (err) {
    log.error.error('Error creating ISO version', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { create };
