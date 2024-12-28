import axios from "axios";
import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getConfig = (configName) => {
  return axios.get(`${baseURL}/api/config/${configName}`, { headers: authHeader() });
};

const updateConfig = (configName, configData) => {
  return axios.put(`${baseURL}/api/config/${configName}`, configData, { headers: authHeader() });
};

const restartServer = () => {
  return axios.post(`${baseURL}/api/config/restart`, {}, { headers: authHeader() });
};

const ConfigService = {
  getConfig,
  updateConfig,
  restartServer
};

export default ConfigService;
