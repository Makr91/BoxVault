import axios from "axios";
import authHeader from "./auth-header";

const API_URL = process.env.REACT_APP_API_BASE_URL + '/users/';

const getPublicContent = () => {
  return axios.get(API_URL + "all");
};

const getUserBoard = () => {
  return axios.get(API_URL + "user", { headers: authHeader() });
};

const getAdminBoard = () => {
  return axios.get(API_URL + "admin", { headers: authHeader() });
};

const getAllRoles = () => {
  return axios.get(`${API_URL}roles`, { headers: authHeader() });
};

const deleteUser = (userId) => {
  return axios.delete(process.env.REACT_APP_API_BASE_URL + `/users/${userId}`, { headers: authHeader() });
};

const suspendUser = (userId) => {
  return axios.put(process.env.REACT_APP_API_BASE_URL + `/users/${userId}/suspend`, {}, { headers: authHeader() });
};

const resumeUser = (userId) => {
  return axios.put(process.env.REACT_APP_API_BASE_URL + `/users/${userId}/resume`, {}, { headers: authHeader() });
};

const changePassword = (userId, newPassword) => {
  return axios.put(process.env.REACT_APP_API_BASE_URL + `/users/${userId}/change-password`, { newPassword }, { headers: authHeader() });
};

const changeEmail = (userId, newEmail) => {
  return axios.put(process.env.REACT_APP_API_BASE_URL + `/users/${userId}/change-email`, { newEmail }, { headers: authHeader() });
};

const promoteToModerator = (userId) => {
  return axios.put(API_URL + `${userId}/promote`, {}, { headers: authHeader() });
};

const demoteToUser = (userId) => {
  return axios.put(API_URL + `${userId}/demote`, {}, { headers: authHeader() });
};

const getUserRoles = () => {
  return axios.get(API_URL + "roles", { headers: authHeader() });
};

const getConfig = (configName) => {
  return axios.get(process.env.REACT_APP_API_BASE_URL + `/config/${configName}`, { headers: authHeader() });
};

const updateConfig = (configName, configData) => {
  return axios.put(process.env.REACT_APP_API_BASE_URL + `/config/${configName}`,  configData, { headers: authHeader() });
};

const UserService = {
  getConfig,
  updateConfig,
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
};

export default UserService;
