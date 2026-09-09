// delete.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';

const Box = db.box;

const boxNotFound = (req, res) =>
  problem(res, req, { status: 404, type: 'not-found', title: req.__('boxes.boxNotFound') });

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
 *       403:
 *         description: The caller neither owns the box nor administers the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Box or organization not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const deleteBox = async (req, res) => {
  const { organization, name } = req.params;

  try {
    // Find the box first to check ownership
    const box = await Box.findOne({
      where: { name, organizationId: req.organizationId },
    });

    if (!box) {
      return boxNotFound(req, res);
    }

    // Check if user is owner OR has admin/owner role
    const isOwner = box.userId === req.userId;
    const canDelete = isOwner || ['admin', 'owner'].includes(req.userOrgRole);

    if (!canDelete) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('boxes.delete.permissionDenied'),
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

    return boxNotFound(req, res);
  } catch (err) {
    log.error.error('Error deleting box:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { deleteBox as delete };
