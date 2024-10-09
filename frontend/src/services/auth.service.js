import axios from "axios";

const API_URL = process.env.REACT_APP_API_BASE_URL + '/auth/';
const GRAVATAR_API_URL = "https://api.gravatar.com/v3/profiles/";
const GRAVATAR_API_KEY = "1238:gk-hGrxeLZtnocRXp-rQIB_R2Rm-z6Oe6_0j2dzxzOzs0J8qtdk5mARF5AQZ6I6s";

const register = (username, email, password) => {
  return axios.post(API_URL + "signup", {
    username,
    email,
    password,
  });
};

const login = (username, password) => {
  return axios
    .post(API_URL + "signin", {
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
    const response = await axios.get(API_URL + "user");
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

const AuthService = {
  register,
  login,
  logout,
  getCurrentUser,
  getGravatarProfile,
  refreshUserData,
};

export default AuthService;