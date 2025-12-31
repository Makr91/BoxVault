import axios from "axios";

import EventBus from "../common/EventBus";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getCurrentUser = () => JSON.parse(localStorage.getItem("user"));

const getGravatarConfig = async () => {
  try {
    const response = await axios.get(`${baseURL}/api/config/gravatar`);
    if (response.data && response.data.gravatar) {
      return {
        apiUrl: response.data.gravatar.base_url.value,
        apiKey: response.data.gravatar.api_key.value,
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching Gravatar configuration:", error);
    return null;
  }
};

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
          "Content-Type": "application/json",
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
      localStorage.setItem("user", JSON.stringify(userData));
      return userData;
    }
  } catch (error) {
    console.error("Token refresh failed:", error);
    return null;
  }
  return null;
};

// Add request interceptor to refresh token before requests
axios.interceptors.request.use(
  async (config) => {
    try {
      // Skip token refresh for auth endpoints and refresh requests
      if (
        config.skipAuthRefresh ||
        config.url.includes("/auth/signin") ||
        config.url.includes("/auth/refresh-token")
      ) {
        return config;
      }

      // Only refresh if we have a signal and it's not aborted
      if (!config.signal || !config.signal.aborted) {
        await refreshTokenIfNeeded();
      }

      // Ensure Content-Type is set for all requests
      if (
        !config.headers["Content-Type"] &&
        !config.url.includes("/file/upload")
      ) {
        config.headers["Content-Type"] = "application/json";
      }

      return config;
    } catch (error) {
      // If request was cancelled or aborted, reject without additional processing
      if (
        error.name === "CanceledError" ||
        error.name === "AbortError" ||
        (config.signal && config.signal.aborted)
      ) {
        return Promise.reject(error);
      }
      throw error;
    }
  },
  (error) => Promise.reject(error)
);

// Add response interceptor to handle 401s
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    // If request was cancelled, just reject without any additional processing
    if (error.name === "CanceledError" || error.name === "AbortError") {
      return Promise.reject(error);
    }

    const originalRequest = error.config;

    // Don't handle retries for auth endpoints
    if (
      originalRequest.url.includes("/auth/") ||
      originalRequest.skipAuthRefresh
    ) {
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
          if (!refreshError.name?.includes("Cancel")) {
            console.error("Token refresh failed:", refreshError);
          }
        }
      }

      // Clear localStorage immediately
      localStorage.removeItem("user");

      // Determine if this was an "action" vs "browsing"
      const isActionRequest =
        originalRequest.method !== "GET" || // POST/PUT/DELETE are actions
        originalRequest.url.includes("/download") || // Downloads are actions
        originalRequest.url.includes("/upload"); // Uploads are actions

      if (isActionRequest) {
        // For actions, redirect to login with return path
        const returnTo = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        window.location.href = `/login?returnTo=${returnTo}`;
      } else {
        // For browsing (GET requests), just update UI state
        EventBus.dispatch("logout", null);
      }
    }
    return Promise.reject(error);
  }
);

const register = (username, email, password, invitationToken) =>
  axios.post(`${baseURL}/api/auth/signup`, {
    username,
    email,
    password,
    invitationToken,
  });

const validateInvitationToken = (token) =>
  axios.get(`${baseURL}/api/auth/validate-invitation/${token}`);

const login = (username, password, stayLoggedIn = false) =>
  axios
    .post(`${baseURL}/api/auth/signin`, {
      username,
      password,
      stayLoggedIn,
    })
    .then((response) => {
      if (response.data.accessToken) {
        const userData = {
          ...response.data,
          stayLoggedIn,
          tokenRefreshTime: Date.now(),
        };
        localStorage.setItem("user", JSON.stringify(userData));
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
      const userData = {
        ...response.data,
        stayLoggedIn: user?.stayLoggedIn,
        tokenRefreshTime: user?.tokenRefreshTime,
      };
      localStorage.setItem("user", JSON.stringify(userData));
      return userData;
    }
  } catch (error) {
    console.error("Error refreshing user data:", error);
  }
  return null;
};

const logout = async () => {
  try {
    // Check if user is logged in with OIDC provider
    const user = getCurrentUser();
    if (user?.provider?.startsWith("oidc-")) {
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
      localStorage.removeItem("user");

      // If provider supports RP-initiated logout, redirect to provider
      if (response.data.redirect_url) {
        window.location.href = response.data.redirect_url;
        return;
      }
    }
  } catch (error) {
    console.error("OIDC logout error:", error);
    // Continue with local logout even if OIDC logout fails
  }

  // Fallback to local logout
  localStorage.removeItem("user");
  window.location.href = "/";
};

const logoutLocal = () => {
  localStorage.removeItem("user");
  window.location.href = "/";
};

const getGravatarProfile = async (emailHash, signal) => {
  try {
    const config = await getGravatarConfig();
    if (!config) {
      return null;
    }

    // Use fetch instead of axios to avoid message port issues
    const response = await fetch(`${config.apiUrl}${emailHash}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      return null;
    }
    console.error("Error fetching Gravatar profile:", error);
    return null;
  }
};

const resendVerificationMail = (signal) =>
  axios.post(
    `${baseURL}/api/auth/resend-verification`,
    {},
    {
      headers: authHeader(),
      signal,
    }
  );

const verifyMail = (token) =>
  axios.get(`${baseURL}/api/auth/verify-mail/${token}`);

const sendInvitation = (email, organizationName) =>
  axios.post(
    `${baseURL}/api/auth/invite`,
    { email, organizationName },
    { headers: authHeader() }
  );

const getAuthMethods = () =>
  axios.get(`${baseURL}/api/auth/methods`).then((response) => response.data);

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
  getGravatarConfig,
  refreshTokenIfNeeded,
  getAuthMethods,
};

export default AuthService;
