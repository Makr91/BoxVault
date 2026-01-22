// delete.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';

const Box = db.box;

/**
 * @swagger
 * /api/organization/{organization}/box/{name}:
 *   delete:
 *     summary: Delete a box
 *     description: Delete a specific box and its associated files from the organization
 *     tags: [Boxes]
 *     security:
 *       - bearerAuth: []
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
 *         description: Box name to delete
 *     responses:
 *       200:
 *         description: Box deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Box deleted successfully!"
 *       404:
 *         description: Box or organization not found
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
const deleteBox = async (req, res) => {
  const { organization, name } = req.params;

  try {
    // Find the box first to check ownership
    const box = await Box.findOne({
      where: { name, organizationId: req.organizationId },
    });

    if (!box) {
      return res.status(404).send({ message: req.__('boxes.boxNotFound') });
    }

    // Check if user is owner OR has moderator/admin role
    const isOwner = box.userId === req.userId;
    const canDelete = isOwner || ['moderator', 'admin'].includes(req.userOrgRole);

    if (!canDelete) {
      return res.status(403).send({
        message: req.__('boxes.delete.permissionDenied'),
      });
    }

    const deleted = await Box.destroy({
      where: { id: box.id },
    });

    if (deleted) {
      // Delete the box's directory
      const boxPath = getSecureBoxPath(organization, name);
      try {
        await fs.promises.rm(boxPath, { recursive: true, force: true });
      } catch (err) {
        log.app.info(`Could not delete the box directory: ${err}`);
      }

      return res.send({ message: req.__('boxes.boxDeleted') });
    }

    return res.status(404).send({ message: req.__('boxes.boxNotFound') });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('errors.operationFailed'),
    });
  }
};

export { deleteBox as delete };
