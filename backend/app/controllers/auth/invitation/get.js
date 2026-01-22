// get.js
import { log } from '../../../utils/Logger.js';
import db from '../../../models/index.js';
const { organization: Organization, invitation: Invitation } = db;

/**
 * @swagger
 * /api/invitations/active/{organizationName}:
 *   get:
 *     summary: Get active invitations for an organization
 *     description: Retrieve all invitations (active, expired, accepted) for a specific organization
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the organization
 *     responses:
 *       200:
 *         description: List of invitations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: Invitation ID
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: Invited email address
 *                   token:
 *                     type: string
 *                     description: Invitation token
 *                   expires:
 *                     type: string
 *                     format: date-time
 *                     description: Expiration date
 *                   accepted:
 *                     type: boolean
 *                     description: Whether invitation was accepted
 *                   expired:
 *                     type: boolean
 *                     description: Whether invitation has expired
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                     description: Creation date
 *       404:
 *         description: Organization not found
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
export const getActiveInvitations = async (req, res) => {
  const { organization: organizationName } = req.params;

  try {
    // First, find the organization by name
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    const activeInvitations = await Invitation.findAll({
      where: {
        organizationId: organization.id,
        // Remove the 'accepted: false' and 'expired: false' conditions to get all invitations
      },
      attributes: ['id', 'email', 'token', 'expires', 'accepted', 'expired', 'createdAt'],
    });

    return res.status(200).send(activeInvitations);
  } catch (err) {
    log.error.error('Error in getActiveInvitations:', err);
    return res.status(500).send({
      message: err.message || req.__('invitations.get.error'),
    });
  }
};
