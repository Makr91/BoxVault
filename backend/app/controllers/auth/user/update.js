// update.js
const db = require('../../../models');
const { generateEmailHash } = require('../helpers');

const User = db.user;

/**
 * @swagger
 * /api/users/{userId}:
 *   put:
 *     summary: Update user information
 *     description: Update a user's email address and email hash
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User updated successfully!"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
exports.updateUser = (req, res) => {
  const { userId } = req.params;
  const { email } = req.body;

  const emailHash = generateEmailHash(email);

  User.update({ email, emailHash }, { where: { id: userId } })
    .then(() => {
      res.send({ message: req.__('users.updated') });
    })
    .catch(err => {
      res.status(500).send({ message: req.__('users.update.error') });
    });
};
