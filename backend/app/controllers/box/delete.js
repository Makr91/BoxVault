// delete.js
const fs = require('fs');
const { getSecureBoxPath } = require('../../utils/paths');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const Organization = db.organization;
const Users = db.user;
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
      include: [
        {
          model: Users,
          as: 'users',
          include: [
            {
              model: Box,
              as: 'box',
              where: { name },
            },
          ],
        },
      ],
    });

    if (!organizationData) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFound'),
      });
    }

    const box = organizationData.users.flatMap(u => u.box).find(b => b.name === name);

    if (!box) {
      return res.status(404).send({
        message: req.__('boxes.boxNotFound'),
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
