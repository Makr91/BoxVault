import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

/**
 * Get all organizations user belongs to with roles
 */
const getUserOrganizations = () =>
  axios.get(`${baseURL}/api/user/organizations`, { headers: authHeader() });

/**
 * Leave an organization
 */
const leaveOrganization = (orgName) =>
  axios.post(
    `${baseURL}/api/user/leave/${orgName}`,
    {},
    { headers: authHeader() }
  );

/**
 * Get user's primary organization
 */
const getPrimaryOrganization = () =>
  axios.get(`${baseURL}/api/user/primary-organization`, {
    headers: authHeader(),
  });

/**
 * Set user's primary organization
 */
const setPrimaryOrganization = (orgName) =>
  axios.put(
    `${baseURL}/api/user/primary-organization/${orgName}`,
    {},
    { headers: authHeader() }
  );

const UserOrganizationService = {
  getUserOrganizations,
  leaveOrganization,
  getPrimaryOrganization,
  setPrimaryOrganization,
};

export default UserOrganizationService;
