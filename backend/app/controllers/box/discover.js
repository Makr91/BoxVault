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
  try {
    let boxes;

    if (req.user) {
      // If the user is authenticated, retrieve all boxes
      boxes = await Box.findAll({
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
                as: 'organization',
                attributes: ['id', 'name', 'emailHash'],
              },
            ],
          },
        ],
      });
    } else {
      // If the user is not authenticated, retrieve only public boxes
      boxes = await Box.findAll({
        where: { isPublic: true },
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
                as: 'organization',
                attributes: ['id', 'name', 'emailHash'], // Include emailHash here
              },
            ],
          },
        ],
      });
    }

    // Ensure the emailHash is included in the response
    const restructuredBoxes = boxes.map(box => {
      const boxJson = box.toJSON();
      if (boxJson.user && boxJson.user.organization) {
        boxJson.user.organization.emailHash = boxJson.user.organization.emailHash || null;
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
