// discover.js
import db from '../../models/index.js';
const { box: Box, versions, providers, architectures, files, user, organization } = db;

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
export const discoverAll = async (req, res) => {
  void req;
  try {
    // Home page only shows published AND public boxes (for everyone)
    const boxes = await Box.findAll({
      where: { published: true, isPublic: true },
      include: [
        {
          model: versions,
          as: 'versions',
          include: [
            {
              model: providers,
              as: 'providers',
              include: [
                {
                  model: architectures,
                  as: 'architectures',
                  include: [
                    {
                      model: files,
                      as: 'files',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: user,
          as: 'user',
          include: [
            {
              model: organization,
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
      message: err.message || req.__('boxes.discover.error'),
    });
  }
};
