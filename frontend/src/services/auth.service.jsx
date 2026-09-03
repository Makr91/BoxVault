import axios from 'axios';

import { fetchWithDeduplication, log } from '../chrome';

import authHeader from './auth-header';

const baseURL = window.location.origin;

const register = (username, email, password, invitationToken, name) =>
  axios.post(`${baseURL}/api/auth/signup`, {
    username,
    email,
    password,
    invitationToken,
    name,
  });

const validateInvitationToken = token =>
  axios.get(`${baseURL}/api/auth/validate-invitation/${token}`);

const acceptInvitation = token =>
  axios.post(`${baseURL}/api/auth/invitations/${token}/accept`, {}, { headers: authHeader() });

const getGravatarProfile = async (emailHash, signal) => {
  try {
    return await fetchWithDeduplication(emailHash, async hash => {
      const response = await fetch(`${baseURL}/api/gravatar/profile/${encodeURIComponent(hash)}`, {
        method: 'GET',
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      return null;
    }
    log.api.error('Error fetching Gravatar profile', {
      emailHash,
      error: error.message,
    });
    return null;
  }
};

const resendVerificationMail = signal =>
  axios.post(
    `${baseURL}/api/auth/resend-verification`,
    {},
    {
      headers: authHeader(),
      signal,
    }
  );

const verifyMail = token => axios.get(`${baseURL}/api/auth/verify-mail/${token}`);

const sendInvitation = (email, organizationName, inviteRole) =>
  axios.post(
    `${baseURL}/api/auth/invite`,
    { email, organizationName, inviteRole },
    { headers: authHeader() }
  );

const getAuthMethods = () =>
  axios.get(`${baseURL}/api/auth/methods`).then(response => response.data);

const AuthService = {
  register,
  getGravatarProfile,
  resendVerificationMail,
  verifyMail,
  sendInvitation,
  validateInvitationToken,
  acceptInvitation,
  getAuthMethods,
};

export default AuthService;
