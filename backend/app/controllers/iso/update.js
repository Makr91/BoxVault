import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
const { iso: ISO } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{isoId}:
 *   put:
 *     summary: Update ISO details
 *     description: Update details of an existing ISO (e.g., visibility)
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
 *         description: ID of the ISO
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isPublic:
 *                 type: boolean
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: ISO updated successfully
 *       404:
 *         description: ISO not found
 *       500:
 *         description: Internal server error
 */
const update = async (req, res) => {
  const { isoId } = req.params;
  const { isPublic, name, description } = req.body || {};

  try {
    const iso = await ISO.findByPk(isoId);
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    if (isPublic !== undefined) {
      iso.isPublic = isPublic;
    }

    if (name !== undefined && name.trim() !== '') {
      iso.name = name.trim();
    }

    if (description !== undefined) {
      iso.description = description;
    }

    await iso.save();
    return res.send(iso);
  } catch (err) {
    log.error.error('Error updating ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { update };
