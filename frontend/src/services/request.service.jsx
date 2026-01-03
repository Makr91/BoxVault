import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

/**
 * Request to join an organization
 */
const createJoinRequest = (orgName, message = null) =>
  axios.post(
    `${baseURL}/api/organization/${orgName}/requests`,
    { message },
    { headers: authHeader() }
  );

/**
 * Get user's pending join requests
 */
const getUserJoinRequests = () =>
  axios.get(`${baseURL}/api/user/requests`, { headers: authHeader() });

/**
 * Cancel user's own join request
 */
const cancelJoinRequest = (requestId) =>
  axios.delete(`${baseURL}/api/user/requests/${requestId}`, {
    headers: authHeader(),
  });

/**
 * Get pending join requests for organization (moderator/admin only)
 */
const getOrgJoinRequests = (orgName) =>
  axios.get(`${baseURL}/api/organization/${orgName}/requests`, {
    headers: authHeader(),
  });

/**
 * Approve a join request (moderator/admin only)
 */
const approveJoinRequest = (orgName, requestId, assignedRole = "user") =>
  axios.post(
    `${baseURL}/api/organization/${orgName}/requests/${requestId}/approve`,
    { assignedRole },
    { headers: authHeader() }
  );

/**
 * Deny a join request (moderator/admin only)
 */
const denyJoinRequest = (orgName, requestId) =>
  axios.post(
    `${baseURL}/api/organization/${orgName}/requests/${requestId}/deny`,
    {},
    { headers: authHeader() }
  );

const RequestService = {
  createJoinRequest,
  getUserJoinRequests,
  cancelJoinRequest,
  getOrgJoinRequests,
  approveJoinRequest,
  denyJoinRequest,
};

export default RequestService;
