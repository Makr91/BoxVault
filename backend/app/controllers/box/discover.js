// discover.js
const db = require('../../models');

const Box = db.box;

/**
 * @swagger
 * /api/discover:
 *   get:
 *     summary: Discover all boxes
 *     description: Retrieve all boxes available to the user. If authenticated, returns all boxes; if not authenticated, returns only public boxes.
 *     tags: [Boxes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of discoverable boxes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BoxWithDetails'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
exports.discoverAll = async (req, res) => {
  void req;
  try {
    // Home page only shows published AND public boxes (for everyone)
    const boxes = await Box.findAll({
      where: { published: true, isPublic: true },
      include: [
        {
          model: db.versions,
          as: 'versions',
          include: [
            {
              model: db.providers,
              as: 'providers',
              include: [
                {
                  model: db.architectures,
                  as: 'architectures',
                  include: [
                    {
                      model: db.files,
                      as: 'files',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: db.user,
          as: 'user',
          include: [
            {
              model: db.organization,
              as: 'primaryOrganization',
              attributes: ['id', 'name', 'emailHash'],
            },
          ],
        },
      ],
    });

    // Ensure the emailHash is included in the response
    const restructuredBoxes = boxes.map(box => {
      const boxJson = box.toJSON();
      if (boxJson.user && boxJson.user.primaryOrganization) {
        boxJson.user.primaryOrganization.emailHash =
          boxJson.user.primaryOrganization.emailHash || null;
      }
      return boxJson;
    });

    return res.send(restructuredBoxes);
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while retrieving boxes.',
    });
  }
};
