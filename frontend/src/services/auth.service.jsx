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

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      // Don't redirect if this is a file upload request
      const isFileUpload = error.config.url.includes('/file/upload');
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

const login = (username, password) => {
  return axios
    .post(`${baseURL}/api/auth/signin`, {
      username,
      password,
    })
    .then((response) => {
      if (response.data.accessToken) {
        localStorage.setItem("user", JSON.stringify(response.data));
      }
      return response.data;
    });
};

const refreshUserData = async () => {
  try {
    const response = await axios.get(`${baseURL}/api/user`, { headers: authHeader() });
    if (response.data) {
      localStorage.setItem("user", JSON.stringify(response.data));
      return response.data;
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
  fetchGravatarConfig
};

export default AuthService;
