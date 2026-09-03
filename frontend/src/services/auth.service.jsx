import axios from 'axios';

import { fetchWithDeduplication } from '../chrome';
import { log } from '../utils/Logger';
import { endSession } from '../utils/sessionEnded';

import authHeader from './auth-header';

const baseURL = window.location.origin;

const getCurrentUser = () => JSON.parse(localStorage.getItem('user'));

// Function to refresh token if needed
const refreshTokenIfNeeded = async () => {
  const user = getCurrentUser();
  if (!user || !user.stayLoggedIn) {
    return null;
  }

  // Only refresh if token is older than 4 minutes (80% of 5 minute expiry)
  const tokenAge = Date.now() - user.tokenRefreshTime;
  if (tokenAge < 240000) {
    return null;
  }

  try {
    // Use authHeader() to get the current token and add Content-Type
    const response = await axios.post(
      `${baseURL}/api/auth/refresh-token`,
      { stayLoggedIn: user.stayLoggedIn },
      {
        headers: {
          ...authHeader(),
          'Content-Type': 'application/json',
        },
        skipAuthRefresh: true, // Skip interceptor for this request
      }
    );

    if (response.data.accessToken) {
      const userData = {
        ...user,
        ...response.data,
        tokenRefreshTime: Date.now(),
        stayLoggedIn: response.data.stayLoggedIn, // Use the stayLoggedIn from response
      };
      localStorage.setItem('user', JSON.stringify(userData));
      return userData;
    }
  } catch (error) {
    log.auth.error('Token refresh failed', { error: error.message });
    return null;
  }
  return null;
};

// Function to force token refresh (e.g. after org rename)
const forceTokenRefresh = async () => {
  const user = getCurrentUser();
  if (!user) {
    return null;
  }

  try {
    const response = await axios.post(
      `${baseURL}/api/auth/refresh-token`,
      { stayLoggedIn: user.stayLoggedIn },
      {
        headers: {
          ...authHeader(),
          'Content-Type': 'application/json',
        },
        skipAuthRefresh: true,
      }
    );

    if (response.data.accessToken) {
      const userData = {
        ...user,
        ...response.data,
        tokenRefreshTime: Date.now(),
        stayLoggedIn: response.data.stayLoggedIn,
      };
      localStorage.setItem('user', JSON.stringify(userData));
      return userData;
    }
  } catch (error) {
    log.auth.error('Forced token refresh failed', { error: error.message });
    return null;
  }
  return null;
};

// Add request interceptor to refresh token before requests
axios.interceptors.request.use(
  async config => {
    try {
      // Skip token refresh for auth endpoints and refresh requests
      if (
        config.skipAuthRefresh ||
        config.url.includes('/auth/signin') ||
        config.url.includes('/auth/refresh-token')
      ) {
        return config;
      }

      // Only refresh if we have a signal and it's not aborted
      if (!config.signal || !config.signal.aborted) {
        await refreshTokenIfNeeded();
      }

      // Ensure Content-Type is set for all requests
      if (!config.headers['Content-Type'] && !config.url.includes('/file/upload')) {
        config.headers['Content-Type'] = 'application/json';
      }

      return config;
    } catch (error) {
      // If request was cancelled or aborted, reject without additional processing
      if (
        error.name === 'CanceledError' ||
        error.name === 'AbortError' ||
        (config.signal && config.signal.aborted)
      ) {
        return Promise.reject(error);
      }
      throw error;
    }
  },
  error => Promise.reject(error)
);

const adoptRefreshedToken = response => {
  const refreshed = response?.headers?.['x-refreshed-token'];
  if (refreshed) {
    const user = getCurrentUser();
    if (user) {
      localStorage.setItem(
        'user',
        JSON.stringify({ ...user, accessToken: refreshed, tokenRefreshTime: Date.now() })
      );
    }
  }
  return response;
};

// Add response interceptor to handle 401s
axios.interceptors.response.use(adoptRefreshedToken, async error => {
  // If request was cancelled, just reject without any additional processing
  if (error.name === 'CanceledError' || error.name === 'AbortError') {
    return Promise.reject(error);
  }

  const originalRequest = error.config;

  // Don't handle retries for auth endpoints
  if (originalRequest.url.includes('/auth/') || originalRequest.skipAuthRefresh) {
    return Promise.reject(error);
  }

  if (error.response?.status === 401 && !originalRequest._retry) {
    originalRequest._retry = true;

    const user = getCurrentUser();
    if (user?.stayLoggedIn) {
      try {
        // Force token refresh
        const refreshed = await refreshTokenIfNeeded();
        if (refreshed) {
          // Retry original request with new token
          originalRequest.headers = {
            ...originalRequest.headers,
            ...authHeader(),
          };
          return axios(originalRequest);
        }
      } catch (refreshError) {
        if (!refreshError.name?.includes('Cancel')) {
          log.auth.error('Token refresh failed', {
            error: refreshError.message,
          });
        }
      }
    }

    // The session is gone server-side (expiry, back-channel logout, or a
    // revoke sweep), so every 401 means the same thing: clear the stored
    // session and show the signed-out header with a way back.
    endSession();
  }
  return Promise.reject(error);
});

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

const login = (username, password, stayLoggedIn = false) =>
  axios
    .post(`${baseURL}/api/auth/signin`, {
      username,
      password,
      stayLoggedIn,
    })
    .then(response => {
      if (response.data.accessToken) {
        const userData = {
          ...response.data,
          stayLoggedIn,
          tokenRefreshTime: Date.now(),
        };
        localStorage.setItem('user', JSON.stringify(userData));
      }
      return response.data;
    });

const refreshUserData = async () => {
  try {
    const response = await axios.get(`${baseURL}/api/user`, {
      headers: authHeader(),
    });
    if (response.data) {
      const user = getCurrentUser();
      // Merged, not replaced: /api/user returns a profile, not a whole session,
      // so overwriting would drop provider and the oidc_* context the OIDC
      // surface is gated on.
      const userData = {
        ...user,
        ...response.data,
        stayLoggedIn: user?.stayLoggedIn,
        tokenRefreshTime: user?.tokenRefreshTime,
      };
      localStorage.setItem('user', JSON.stringify(userData));
      return userData;
    }
  } catch (error) {
    log.auth.error('Error refreshing user data', {
      error: error.message,
    });
  }
  return null;
};

const logout = async () => {
  try {
    // Check if user is logged in with OIDC provider
    const user = getCurrentUser();
    if (user?.provider?.startsWith('oidc-')) {
      // Call backend to initiate OIDC logout
      const response = await axios.post(
        `${baseURL}/api/auth/oidc/logout`,
        {},
        {
          headers: authHeader(),
          skipAuthRefresh: true, // Don't refresh token during logout
        }
      );

      // Clear local storage first
      localStorage.removeItem('user');

      // If provider supports RP-initiated logout, redirect to provider
      if (response.data.redirect_url) {
        window.location.href = response.data.redirect_url;
        return;
      }
    }
  } catch (error) {
    log.auth.error('OIDC logout error', { error: error.message });
    // Continue with local logout even if OIDC logout fails
  }

  // Fallback to local logout
  localStorage.removeItem('user');
  window.location.href = '/';
};

const logoutLocal = () => {
  localStorage.removeItem('user');
  window.location.href = '/';
};

const getGravatarProfile = async (emailHash, signal) => {
  try {
    // Use deduplicated fetch - ensures only ONE fetch per emailHash.
    // Profiles come from BoxVault's server-side proxy — the Gravatar API key
    // never reaches the browser (#17).
    return await fetchWithDeduplication(emailHash, async hash => {
      // Use fetch instead of axios to avoid message port issues
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
  login,
  logout,
  logoutLocal,
  getCurrentUser,
  getGravatarProfile,
  refreshUserData,
  resendVerificationMail,
  verifyMail,
  sendInvitation,
  validateInvitationToken,
  acceptInvitation,
  forceTokenRefresh,
  getAuthMethods,
};

export default AuthService;
