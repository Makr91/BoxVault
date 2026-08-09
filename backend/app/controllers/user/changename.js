// changename.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { user: User } = db;

const MAX_NAME_LENGTH = 255;

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
 *       400:
 *         description: Name is not a string, or is too long
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
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
export const changeName = async (req, res) => {
  const { userId } = req.params;
  const { name } = req.body || {};

  if (typeof name !== 'undefined' && name !== null && typeof name !== 'string') {
    return res.status(400).send({ message: req.__('users.nameInvalid') });
  }

  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length > MAX_NAME_LENGTH) {
    return res.status(400).send({ message: req.__('users.nameTooLong') });
  }

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }

    user.name = trimmed || null;
    await user.save();

    return res.status(200).send({
      message: req.__('users.nameChanged'),
      name: user.name,
    });
  } catch (err) {
    log.error.error('Error changing display name:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
