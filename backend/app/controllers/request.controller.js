const db = require('../models');
const { log } = require('../utils/Logger');
const { Request } = db;
const { UserOrg } = db;
const Organization = db.organization;

/**
 * Create a join request for an organization
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
 * Get pending join requests for organization (moderator/admin only)
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
 * Get user's pending join requests
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
 * Approve a join request (moderator/admin only)
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
 * Deny a join request (moderator/admin only)
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
 * Cancel user's own join request
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
