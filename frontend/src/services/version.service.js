import axios from "axios";
import authHeader from "./auth-header";

const API_URL = process.env.REACT_APP_API_BASE_URL;

const getVersions = (organization, boxId) => {
  return axios.get(`${API_URL}/organization/${organization}/box/${boxId}/version`, { headers: authHeader() });
};

const VersionService = {
  getVersions,
};

export default VersionService;