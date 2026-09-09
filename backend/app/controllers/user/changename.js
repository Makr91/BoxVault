// changename.js
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { user: User } = db;

/**
 * @swagger
 * /api/users/{userId}/change-name:
 *   put:
 *     summary: Change a user's display name
 *     description: Set or clear the display name shown across BoxVault. An empty name clears it and the username becomes the fallback again. For SCIM-provisioned accounts the identity provider stays authoritative — its next push overwrites whatever is set here.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 255
 *                 nullable: true
 *                 description: New display name, or empty to clear it
 *     responses:
 *       200:
 *         description: Display name changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 name:
 *                   type: string
 *                   nullable: true
 *       404:
 *         description: User not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: The name is not a string, or is too long
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
export const changeName = async (req, res) => {
  const { userId } = req.params;
  const { name } = req.body || {};
  const trimmed = typeof name === 'string' ? name.trim() : '';

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('users.userNotFound'),
      });
    }

    user.name = trimmed || null;
    await user.save();

    return res.status(200).send({
      message: req.__('users.nameChanged'),
      name: user.name,
    });
  } catch (err) {
    log.error.error('Error changing display name:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
