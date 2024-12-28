import axios from "axios";
import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getPublicContent = () => {
  return axios.get(`${baseURL}/api/users/all`);
};

const getUserBoard = () => {
  return axios.get(`${baseURL}/api/users/user`, { headers: authHeader() });
};

const getAdminBoard = () => {
  return axios.get(`${baseURL}/api/users/admin`, { headers: authHeader() });
};

const getAllRoles = () => {
  return axios.get(`${baseURL}/api/users/roles`, { headers: authHeader() });
};

const deleteUser = (userId) => {
  return axios.delete(`${baseURL}/api/users/${userId}`, { headers: authHeader() });
};

const suspendUser = (userId) => {
  return axios.put(`${baseURL}/api/users/${userId}/suspend`, {}, { headers: authHeader() });
};

const resumeUser = (userId) => {
  return axios.put(`${baseURL}/api/users/${userId}/resume`, {}, { headers: authHeader() });
};

const changePassword = (userId, newPassword, signal) => {
  return axios.put(
    `${baseURL}/api/users/${userId}/change-password`, 
    { newPassword }, 
    { 
      headers: authHeader(),
      signal
    }
  );
};

const changeEmail = (userId, newEmail, signal) => {
  return axios.put(
    `${baseURL}/api/users/${userId}/change-email`, 
    { newEmail }, 
    { 
      headers: authHeader(),
      signal
    }
  );
};

const promoteToModerator = (userId) => {
  return axios.put(`${baseURL}/api/users/${userId}/promote`, {}, { headers: authHeader() });
};

const demoteToUser = (userId) => {
  return axios.put(`${baseURL}/api/users/${userId}/demote`, {}, { headers: authHeader() });
};

const getUserRoles = () => {
  return axios.get(`${baseURL}/api/users/roles`, { headers: authHeader() });
};

const isOnlyUserInOrg = (organizationName) => {
  return axios.get(`${baseURL}/api/organization/${organizationName}/users`, { headers: authHeader() })
    .then(response => response.data.length === 1);
};

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
  isOnlyUserInOrg
};

export default UserService;
