// delete.js
const fs = require('fs');
const { getSecureBoxPath } = require('../../utils/paths');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const Organization = db.organization;
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
exports.delete = async (req, res) => {
  const { organization, name } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFound'),
      });
    }

    // Find the box first to check ownership
    const box = await Box.findOne({
      where: { name, organizationId: organizationData.id },
    });

    if (!box) {
      throw new Error(req.__('boxes.boxNotFound'));
    }

    // Check if user is owner OR has moderator/admin role
    const membership = await db.UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canDelete = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canDelete) {
      return res.status(403).send({
        message: 'You can only delete boxes you own, or you need moderator/admin role.',
      });
    }

    const deleted = await Box.destroy({
      where: { id: box.id },
    });

    if (deleted) {
      // Delete the box's directory
      const boxPath = getSecureBoxPath(organization, name);
      fs.rm(boxPath, { recursive: true, force: true }, err => {
        if (err) {
          log.app.info(`Could not delete the box directory: ${err}`);
        }
      });

      return res.send({ message: req.__('boxes.boxDeleted') });
    }

    throw new Error(req.__('boxes.boxNotFound'));
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('errors.operationFailed'),
    });
  }
};
