// delete.js
const { log } = require('../../../utils/Logger');
const db = require('../../../models');

const Invitation = db.invitation;

/**
 * @swagger
 * /api/invitations/{invitationId}:
 *   delete:
 *     summary: Delete an invitation
 *     description: Remove an invitation from the system
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the invitation to delete
 *     responses:
 *       200:
 *         description: Invitation deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Invitation deleted successfully."
 *       404:
 *         description: Invitation not found
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
exports.deleteInvitation = async (req, res) => {
  const { invitationId } = req.params;

  try {
    const invitation = await Invitation.findByPk(invitationId);

    if (!invitation) {
      return res.status(404).send({ message: 'Invitation not found.' });
    }

    await invitation.destroy();
    return res.status(200).send({ message: 'Invitation deleted successfully.' });
  } catch (err) {
    log.error.error('Error in deleteInvitation:', err);
    return res.status(500).send({
      message: err.message || 'Some error occurred while deleting the invitation.',
    });
  }
};
