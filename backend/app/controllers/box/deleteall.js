// deleteall.js
const fs = require('fs');
const { getSecureBoxPath } = require('../../utils/paths');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const Organization = db.organization;
const Box = db.box;

/**
 * @swagger
 * /api/organization/{organization}/box:
 *   delete:
 *     summary: Delete all boxes in an organization
 *     description: Delete all boxes belonging to a specific organization and their associated files
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
 *     responses:
 *       200:
 *         description: All boxes deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "5 Boxes were deleted successfully under organization=myorg!"
 *       404:
 *         description: Organization not found or no boxes to delete
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
// Delete all Boxes under an organization
exports.deleteAll = async (req, res) => {
  const { organization } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', { organization }),
      });
    }

    const boxes = await Box.findAll({
      where: { organizationId: organizationData.id },
    });

    if (boxes.length === 0) {
      return res.status(404).send({
        message: req.__('boxes.noBoxesFoundInOrg', { organization }),
      });
    }

    // Delete all boxes from the database
    const deleted = await Box.destroy({
      where: { organizationId: organizationData.id },
      truncate: false,
    });

    if (deleted) {
      // Delete each box's directory
      boxes.forEach(b => {
        const boxPath = getSecureBoxPath(organization, b.name);
        fs.rm(boxPath, { recursive: true, force: true }, err => {
          if (err) {
            log.app.info(`Could not delete the box directory for ${b.name}: ${err}`);
          }
        });
      });

      return res.send({
        message: req.__('boxes.deletedAllInOrg', { count: deleted, organization }),
      });
    }

    throw new Error(req.__('boxes.notFoundToDelete'));
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('boxes.deleteAll.error'),
    });
  }
};
