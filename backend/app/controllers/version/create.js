// create.js
const db = require('../../models');

const Version = db.versions;
const Box = db.box;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version:
 *   post:
 *     summary: Create a new version for a box
 *     tags: [Versions]
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
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name/ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateVersionRequest'
 *     responses:
 *       200:
 *         description: Version created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Version'
 *       404:
 *         description: Organization or box not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization not found with name: example-org."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while creating the Version."
 */
exports.create = async (req, res) => {
  const { organization, boxId } = req.params;
  const { versionNumber, description } = req.body;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [
        {
          model: db.user,
          as: 'members',
          include: [
            {
              model: Box,
              as: 'box',
              where: { name: boxId },
            },
          ],
        },
      ],
    });

    if (!organizationData) {
      return res
        .status(404)
        .send({ message: `Organization not found with name: ${organization}.` });
    }

    // Extract the box from the organization data
    const box = organizationData.members.flatMap(u => u.box).find(b => b.name === boxId);

    if (!box) {
      return res.status(404).send({ message: `Box not found with name: ${boxId}.` });
    }

    // Create the version
    const version = await Version.create({
      versionNumber,
      description,
      boxId: box.id,
    });

    return res.send(version);
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while creating the Version.',
    });
  }
};
