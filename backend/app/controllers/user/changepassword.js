// changepassword.js
const bcrypt = require('bcryptjs');
const db = require('../../models');

const User = db.user;

/**
 * @swagger
 * /api/users/{userId}/change-password:
 *   put:
 *     summary: Change user password
 *     description: Change the password for a specific user
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
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: New password
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password changed successfully!"
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
exports.changePassword = async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: 'User not found.' });
    }

    user.password = bcrypt.hashSync(newPassword, 8);
    await user.save();

    return res.status(200).send({ message: 'Password changed successfully!' });
  } catch (err) {
    return res
      .status(500)
      .send({ message: err.message || 'Some error occurred while changing the password.' });
  }
};
