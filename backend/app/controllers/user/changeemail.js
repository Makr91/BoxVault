// changeemail.js
const db = require('../../models');

const User = db.user;

/**
 * @swagger
 * /api/users/{userId}/change-email:
 *   put:
 *     summary: Change user email
 *     description: Change the email address for a specific user
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
 *             required:
 *               - newEmail
 *             properties:
 *               newEmail:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *     responses:
 *       200:
 *         description: Email changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email changed successfully!"
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
exports.changeEmail = async (req, res) => {
  const { userId } = req.params;
  const { newEmail } = req.body;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }

    user.email = newEmail;
    await user.save();

    return res.status(200).send({ message: req.__('users.emailChanged') });
  } catch (err) {
    return res.status(500).send({ message: err.message || req.__('errors.operationFailed') });
  }
};
