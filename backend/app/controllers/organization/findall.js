// findall.js
import db from '../../models/index.js'; // Keep this for Sequelize
const { organization: Organization, user: User, box: Box, Sequelize } = db;
const { Op } = Sequelize;

/**
 * @swagger
 * /api/organization:
 *   get:
 *     summary: Get all organizations
 *     description: Retrieve all organizations with optional name filtering and box counts
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organization
 *         schema:
 *           type: string
 *         description: Filter organizations by name (partial match)
 *     responses:
 *       200:
 *         description: List of organizations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Organization'
 *                   - type: object
 *                     properties:
 *                       totalBoxes:
 *                         type: integer
 *                         description: Total number of boxes accessible to the requesting user
 *       401:
 *         description: Unauthorized - invalid token
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
// Retrieve all Organizations from the database.
export const findAll = async (req, res) => {
  const { organization } = req.query;
  const { userId } = req;

  try {
    const condition = organization ? { name: { [Op.like]: `%${organization}%` } } : null;
    const organizations = await Organization.findAll({
      where: condition,
      include: [
        {
          model: User,
          as: 'members',
          attributes: ['id'],
          include: [
            {
              model: Box,
              as: 'box',
              attributes: ['isPublic', 'userId'],
              required: false,
            },
          ],
        },
      ],
    });

    const result = organizations.map(org => ({
      ...org.toJSON(),
      totalBoxes: org.members.reduce(
        (acc, user) =>
          acc + user.box.filter(box => box.isPublic || (userId && user.id === userId)).length,
        0
      ),
    }));

    return res.status(200).send(result);
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('organizations.findAllError'),
    });
  }
};
