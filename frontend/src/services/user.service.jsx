import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getPublicContent = () => axios.get(`${baseURL}/api/users/all`);

const getUserBoard = () =>
  axios.get(`${baseURL}/api/users/user`, { headers: authHeader() });

const getAdminBoard = () =>
  axios.get(`${baseURL}/api/users/admin`, { headers: authHeader() });

const getAllRoles = () =>
  axios.get(`${baseURL}/api/users/roles`, { headers: authHeader() });

const deleteUser = (userId) =>
  axios.delete(`${baseURL}/api/users/${userId}`, { headers: authHeader() });

const suspendUser = (userId) =>
  axios.put(
    `${baseURL}/api/users/${userId}/suspend`,
    {},
    { headers: authHeader() }
  );

const resumeUser = (userId) =>
  axios.put(
    `${baseURL}/api/users/${userId}/resume`,
    {},
    { headers: authHeader() }
  );

const changePassword = (userId, newPassword, signal) =>
  axios.put(
    `${baseURL}/api/users/${userId}/change-password`,
    { newPassword },
    {
      headers: authHeader(),
      signal,
    }
  );

const changeEmail = (userId, newEmail, signal) =>
  axios.put(
    `${baseURL}/api/users/${userId}/change-email`,
    { newEmail },
    {
      headers: authHeader(),
      signal,
    }
  );

const promoteToModerator = (userId) =>
  axios.put(
    `${baseURL}/api/users/${userId}/promote`,
    {},
    { headers: authHeader() }
  );

const demoteToUser = (userId) =>
  axios.put(
    `${baseURL}/api/users/${userId}/demote`,
    {},
    { headers: authHeader() }
  );

const getUserRoles = () =>
  axios.get(`${baseURL}/api/users/roles`, { headers: authHeader() });

const isOnlyUserInOrg = (organizationName) =>
  axios
    .get(`${baseURL}/api/organization/${organizationName}/users`, {
      headers: authHeader(),
    })
    .then((response) => response.data.length === 1);

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
 * Set user's primary organization
 */
const setPrimaryOrganization = (orgName) =>
  axios.put(
    `${baseURL}/api/user/primary-organization/${orgName}`,
    {},
    { headers: authHeader() }
  );

const UserService = {
  getPublicContent,
  getUserBoard,
  getAdminBoard,
  getAllRoles,
  getUserRoles,
  deleteUser,
  suspendUser,
  resumeUser,
  changePassword,
  changeEmail,
  promoteToModerator,
  demoteToUser,
  isOnlyUserInOrg,
  getUserOrganizations,
  leaveOrganization,
  setPrimaryOrganization,
};

export default UserService;
