// deleteall.js
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const Organization = db.organization;
const Users = db.user;
const Box = db.box;

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load App configuration: ${e.message}`);
}

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
      include: [
        {
          model: Users,
          as: 'users',
          include: [
            {
              model: Box,
              as: 'box',
            },
          ],
        },
      ],
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`,
      });
    }

    const boxes = organizationData.users.flatMap(u => u.box);

    if (boxes.length === 0) {
      return res.status(404).send({
        message: `No boxes found under organization ${organization}.`,
      });
    }

    // Delete all boxes from the database
    const deleted = await Box.destroy({
      where: { id: boxes.map(b => b.id) },
      truncate: false,
    });

    if (deleted) {
      // Delete each box's directory
      boxes.forEach(b => {
        const boxPath = path.join(
          appConfig.boxvault.box_storage_directory.value,
          organization,
          b.name
        );
        fs.rm(boxPath, { recursive: true, force: true }, err => {
          if (err) {
            log.app.info(`Could not delete the box directory for ${b.name}: ${err}`);
          }
        });
      });

      return res.send({
        message: `${deleted} Boxes were deleted successfully under organization=${organization}!`,
      });
    }

    throw new Error('No boxes found to delete');
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while removing all boxes.',
    });
  }
};
