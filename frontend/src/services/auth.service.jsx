import axios from "axios";
import authHeader from "./auth-header";

const baseURL = window.location.origin;

let GRAVATAR_API_URL = "";
let GRAVATAR_API_KEY = "";

const fetchGravatarConfig = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios.get(`${baseURL}/api/config/gravatar`);
      if (response.data && response.data.gravatar) {
        GRAVATAR_API_URL = response.data.gravatar.base_url.value;
        GRAVATAR_API_KEY = response.data.gravatar.api_key.value;
      }
      resolve();
    } catch (error) {
      console.error("Error fetching Gravatar configuration:", error);
      resolve();
    }
  });
};

// Function to refresh token if needed
const refreshTokenIfNeeded = async () => {
  const user = getCurrentUser();
  if (!user || !user.stayLoggedIn) return null;

  // Only refresh if token is older than 4 minutes (80% of 5 minute expiry)
  const tokenAge = Date.now() - user.tokenRefreshTime;
  if (tokenAge < 240000) return null;

  try {
    const response = await axios.get(`${baseURL}/api/auth/refresh-token`, { 
      headers: authHeader(),
      skipAuthRefresh: true // Skip interceptor for this request
    });
    
    if (response.data.accessToken) {
      const userData = {
        ...user,
        ...response.data,
        tokenRefreshTime: Date.now()
      };
      localStorage.setItem("user", JSON.stringify(userData));
      return userData;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
};

// Add request interceptor to refresh token before requests
axios.interceptors.request.use(
  async config => {
    // Skip token refresh for auth endpoints and refresh requests
    if (config.skipAuthRefresh || 
        config.url.includes('/auth/signin') || 
        config.url.includes('/auth/refresh-token')) {
      return config;
    }

    await refreshTokenIfNeeded();
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle 401s
axios.interceptors.response.use(
  response => response,
  async error => {
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
              ...authHeader()
            };
            return axios(originalRequest);
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
        }
      }

      // Don't redirect if this is a file upload request
      const isFileUpload = originalRequest.url.includes('/file/upload');
      if (!isFileUpload) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

const register = (username, email, password, invitationToken) => {
  return axios.post(`${baseURL}/api/auth/signup`, {
    username,
    email,
    password,
    invitationToken,
  });
};

const validateInvitationToken = (token) => {
  return axios.get(`${baseURL}/api/auth/validate-invitation/${token}`);
};

const login = (username, password, stayLoggedIn = false) => {
  return axios
    .post(`${baseURL}/api/auth/signin`, {
      username,
      password,
      stayLoggedIn
    })
    .then((response) => {
      if (response.data.accessToken) {
        const userData = {
          ...response.data,
          stayLoggedIn,
          tokenRefreshTime: Date.now()
        };
        localStorage.setItem("user", JSON.stringify(userData));
      }
      return response.data;
    });
};

const refreshUserData = async () => {
  try {
    const response = await axios.get(`${baseURL}/api/user`, { headers: authHeader() });
    if (response.data) {
      const user = getCurrentUser();
      const userData = {
        ...response.data,
        stayLoggedIn: user?.stayLoggedIn,
        tokenRefreshTime: user?.tokenRefreshTime
      };
      localStorage.setItem("user", JSON.stringify(userData));
      return userData;
    }
  } catch (error) {
    console.error("Error refreshing user data:", error);
  }
  return null;
};

const logout = () => {
  localStorage.removeItem("user");
  window.location.href = "/";
};

const getCurrentUser = () => {
  return JSON.parse(localStorage.getItem("user"));
};

const getGravatarProfile = async (emailHash) => {
  try {
    await fetchGravatarConfig();

    const response = await axios.get(`${GRAVATAR_API_URL}${emailHash}`, {
      headers: {
        Authorization: `Bearer ${GRAVATAR_API_KEY}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching Gravatar profile:", error);
    return null;
  }
};

const resendVerificationMail = () => {
  return axios.post(`${baseURL}/api/auth/resend-verification`, {}, { headers: authHeader() });
};

const verifyMail = (token) => {
  return axios.get(`${baseURL}/api/auth/verify-mail/${token}`);
};

const sendInvitation = (email, organizationName) => {
  return axios.post(`${baseURL}/api/auth/invite`, { email, organizationName }, { headers: authHeader() });
};

const AuthService = {
  register,
  login,
  logout,
  getCurrentUser,
  getGravatarProfile,
  refreshUserData,
  resendVerificationMail,
  verifyMail,
  sendInvitation,
  validateInvitationToken,
  fetchGravatarConfig,
  refreshTokenIfNeeded
};

export default AuthService;
