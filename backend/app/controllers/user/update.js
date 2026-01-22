// update.js
import db from '../../models/index.js';
import { generateEmailHash } from '../auth/helpers.js';
const { user: User } = db;

/**
 * @swagger
 * /api/organization/{organizationName}/users/{userName}:
 *   put:
 *     summary: Update a user in an organization
 *     description: Update user information within an organization (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: userName
 *         required: true
 *         schema:
 *           type: string
 *         description: Username
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: New username
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *               password:
 *                 type: string
 *                 format: password
 *                 description: New password
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: User roles
 *               organization:
 *                 type: string
 *                 description: New organization name
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User or organization not found
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
export const update = async (req, res) => {
  const { userName } = req.params;
  const { email } = req.body;

  try {
    const user = await User.findOne({
      where: { username: userName },
    });

    if (!user) {
      return res.status(404).send({
        message: req.__('users.userNotFound'),
      });
    }

    if (email) {
      user.email = email;
      user.emailHash = generateEmailHash(email);
    }

    await user.save();
    return res.status(200).send({ message: 'User was updated successfully.' });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('users.update.error'),
    });
  }
};
