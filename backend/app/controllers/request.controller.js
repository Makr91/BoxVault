const db = require('../models');
const { log } = require('../utils/Logger');
const { Request } = db;
const { UserOrg } = db;
const Organization = db.organization;

/**
 * @swagger
 * /api/organization/{organization}/requests:
 *   post:
 *     summary: Create a join request for an organization
 *     description: Submit a request to join an organization that has 'request_to_join' access mode
 *     tags: [Join Requests]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to request to join
 *         example: acme-corp
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: Optional message explaining why you want to join
 *                 example: "I would like to contribute to this organization's boxes"
 *     responses:
 *       201:
 *         description: Join request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Join request submitted successfully!"
 *                 request:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     organizationName:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid request - already a member or already has pending request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Organization does not allow join requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const createJoinRequest = async (req, res) => {
  try {
    const { organization: orgName } = req.params;
    const { message } = req.body;
    const { userId } = req;

    // Find the organization
    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    // Check if organization allows join requests
    if (organization.access_mode !== 'request_to_join') {
      return res.status(403).send({
        message: 'Organization does not allow join requests!',
      });
    }

    // Check if user is already a member
    const existingMembership = await UserOrg.findUserOrgRole(userId, organization.id);
    if (existingMembership) {
      return res.status(400).send({
        message: 'You are already a member of this organization!',
      });
    }

    // Check if user already has a pending request
    const hasPending = await Request.hasPendingRequest(userId, organization.id);
    if (hasPending) {
      return res.status(400).send({
        message: 'You already have a pending request for this organization!',
      });
    }

    // Create the join request
    const joinRequest = await Request.createJoinRequest(userId, organization.id, message);

    log.api.info('Join request created', {
      userId,
      organizationName: orgName,
      requestId: joinRequest.id,
    });

    return res.status(201).send({
      message: 'Join request submitted successfully!',
      request: {
        id: joinRequest.id,
        organizationName: orgName,
        status: 'pending',
        createdAt: joinRequest.created_at,
      },
    });
  } catch (err) {
    log.error.error('Error creating join request:', {
      error: err.message,
      userId: req.userId,
      organization: req.params.organization,
    });
    return res.status(500).send({ message: 'Error creating join request' });
  }
};

/**
 * @swagger
 * /api/organization/{organization}/requests:
 *   get:
 *     summary: Get pending join requests for an organization
 *     description: Retrieve all pending join requests for the organization (moderator/admin only)
 *     tags: [Join Requests]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: acme-corp
 *     responses:
 *       200:
 *         description: List of pending join requests
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   user_id:
 *                     type: integer
 *                   organization_id:
 *                     type: integer
 *                   status:
 *                     type: string
 *                     example: "pending"
 *                   message:
 *                     type: string
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   user:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       username:
 *                         type: string
 *                       email:
 *                         type: string
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Requires moderator or admin role in organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const getOrgJoinRequests = async (req, res) => {
  try {
    const { organizationId } = req; // Set by verifyOrgAccess middleware

    const requests = await Request.getPendingRequests(organizationId);

    return res.send(requests);
  } catch (err) {
    log.error.error('Error fetching organization join requests:', {
      error: err.message,
      organizationId: req.organizationId,
    });
    return res.status(500).send({ message: 'Error fetching join requests' });
  }
};

/**
 * @swagger
 * /api/user/requests:
 *   get:
 *     summary: Get current user's pending join requests
 *     description: Retrieve all pending join requests submitted by the authenticated user
 *     tags: [Join Requests]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: List of user's pending join requests
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   user_id:
 *                     type: integer
 *                   organization_id:
 *                     type: integer
 *                   status:
 *                     type: string
 *                     example: "pending"
 *                   message:
 *                     type: string
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   organization:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const getUserJoinRequests = async (req, res) => {
  try {
    const { userId } = req;

    const requests = await Request.getUserPendingRequests(userId);

    return res.send(requests);
  } catch (err) {
    log.error.error('Error fetching user join requests:', {
      error: err.message,
      userId: req.userId,
    });
    return res.status(500).send({ message: 'Error fetching your join requests' });
  }
};

/**
 * @swagger
 * /api/organization/{organization}/requests/{requestId}/approve:
 *   post:
 *     summary: Approve a join request
 *     description: Approve a pending join request and add the user to the organization (moderator/admin only)
 *     tags: [Join Requests]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: acme-corp
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Join request ID to approve
 *         example: 1
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assignedRole:
 *                 type: string
 *                 enum: [user, moderator]
 *                 description: Role to assign to the user (defaults to 'user')
 *                 example: "user"
 *     responses:
 *       200:
 *         description: Join request approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Join request approved successfully!"
 *                 assignedRole:
 *                   type: string
 *                   example: "user"
 *       400:
 *         description: Invalid role or request already processed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Requires moderator or admin role in organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Join request not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const approveJoinRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { assignedRole } = req.body;
    const { userId: reviewerId, organizationId } = req;

    // Validate assigned role
    const validRoles = ['user', 'moderator'];
    if (assignedRole && !validRoles.includes(assignedRole)) {
      return res.status(400).send({
        message: 'Invalid role. Must be user or moderator.',
      });
    }

    // Verify request belongs to this organization
    const request = await Request.findByPk(requestId);
    if (!request || request.organization_id !== organizationId) {
      return res.status(404).send({ message: 'Join request not found!' });
    }

    if (request.status !== 'pending') {
      return res.status(400).send({ message: 'Request has already been processed!' });
    }

    // Approve the request
    await Request.approveRequest(requestId, reviewerId, assignedRole || 'user');

    log.api.info('Join request approved', {
      requestId,
      reviewerId,
      organizationId,
      assignedRole: assignedRole || 'user',
    });

    return res.send({
      message: 'Join request approved successfully!',
      assignedRole: assignedRole || 'user',
    });
  } catch (err) {
    log.error.error('Error approving join request:', {
      error: err.message,
      requestId: req.params.requestId,
      reviewerId: req.userId,
    });
    return res.status(500).send({ message: 'Error approving join request' });
  }
};

/**
 * @swagger
 * /api/organization/{organization}/requests/{requestId}/deny:
 *   post:
 *     summary: Deny a join request
 *     description: Deny a pending join request (moderator/admin only)
 *     tags: [Join Requests]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: acme-corp
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Join request ID to deny
 *         example: 1
 *     responses:
 *       200:
 *         description: Join request denied successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Join request denied."
 *       400:
 *         description: Request already processed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Requires moderator or admin role in organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Join request not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const denyJoinRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { userId: reviewerId, organizationId } = req;

    // Verify request belongs to this organization
    const request = await Request.findByPk(requestId);
    if (!request || request.organization_id !== organizationId) {
      return res.status(404).send({ message: 'Join request not found!' });
    }

    if (request.status !== 'pending') {
      return res.status(400).send({ message: 'Request has already been processed!' });
    }

    // Deny the request
    await Request.denyRequest(requestId, reviewerId);

    log.api.info('Join request denied', {
      requestId,
      reviewerId,
      organizationId,
    });

    return res.send({ message: 'Join request denied.' });
  } catch (err) {
    log.error.error('Error denying join request:', {
      error: err.message,
      requestId: req.params.requestId,
      reviewerId: req.userId,
    });
    return res.status(500).send({ message: 'Error denying join request' });
  }
};

/**
 * @swagger
 * /api/user/requests/{requestId}:
 *   delete:
 *     summary: Cancel a join request
 *     description: Cancel the user's own pending join request
 *     tags: [Join Requests]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Join request ID to cancel
 *         example: 1
 *     responses:
 *       200:
 *         description: Join request cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Join request cancelled successfully!"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Join request not found or not owned by user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const cancelJoinRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { userId } = req;

    // Find the request and verify ownership
    const request = await Request.findOne({
      where: {
        id: requestId,
        user_id: userId,
        status: 'pending',
      },
    });

    if (!request) {
      return res.status(404).send({
        message: 'Join request not found or cannot be cancelled!',
      });
    }

    // Delete the request (cancellation)
    await request.destroy();

    log.api.info('Join request cancelled', {
      requestId,
      userId,
      organizationId: request.organization_id,
    });

    return res.send({ message: 'Join request cancelled successfully!' });
  } catch (err) {
    log.error.error('Error cancelling join request:', {
      error: err.message,
      requestId: req.params.requestId,
      userId: req.userId,
    });
    return res.status(500).send({ message: 'Error cancelling join request' });
  }
};

module.exports = {
  createJoinRequest,
  getOrgJoinRequests,
  getUserJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
  cancelJoinRequest,
};
