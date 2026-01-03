// suspend.js
const db = require('../../../models');

const User = db.user;

/**
 * @swagger
 * /api/users/{userId}/suspend:
 *   put:
 *     summary: Suspend a user
 *     description: Suspend a user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to suspend
 *     responses:
 *       200:
 *         description: User suspended successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User suspended successfully."
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
exports.suspendUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: req.__('users.userNotFound') });
    }
    // Assuming there's a 'suspended' field in the User model
    await user.update({ suspended: true });
    return res.status(200).send({ message: req.__('users.suspended') });
  } catch (err) {
    return res.status(500).send({ message: err.message || req.__('users.suspend.error') });
  }
};
