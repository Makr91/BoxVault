import axios from 'axios';

import i18n from '../i18n';

import authHeader from './auth-header';

const baseURL = window.location.origin;

const getPublicContent = () =>
  axios.get(`${baseURL}/api/users/all`, { params: { lang: i18n.language } });

const deleteUser = userId =>
  axios.delete(`${baseURL}/api/users/${userId}`, { headers: authHeader() });

const suspendUser = userId =>
  axios.put(`${baseURL}/api/users/${userId}/suspend`, {}, { headers: authHeader() });

const resumeUser = userId =>
  axios.put(`${baseURL}/api/users/${userId}/resume`, {}, { headers: authHeader() });

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

const changeName = (userId, name, signal) =>
  axios.put(
    `${baseURL}/api/users/${userId}/change-name`,
    { name },
    {
      headers: authHeader(),
      signal,
    }
  );

const updatePreferences = preferences =>
  axios.patch(`${baseURL}/api/user/preferences`, preferences, {
    headers: authHeader(),
  });

const getUserOrganizations = () =>
  axios.get(`${baseURL}/api/user/organizations`, { headers: authHeader() });

const leaveOrganization = orgName =>
  axios.post(`${baseURL}/api/user/leave/${orgName}`, {}, { headers: authHeader() });

const setPrimaryOrganization = orgName =>
  axios.put(`${baseURL}/api/user/primary-organization/${orgName}`, {}, { headers: authHeader() });

const UserService = {
  getPublicContent,
  deleteUser,
  suspendUser,
  resumeUser,
  changePassword,
  changeEmail,
  changeName,
  updatePreferences,
  getUserOrganizations,
  leaveOrganization,
  setPrimaryOrganization,
};

export default UserService;
