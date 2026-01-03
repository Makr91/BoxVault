import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getConfig = (configName) =>
  axios.get(`${baseURL}/api/config/${configName}`, { headers: authHeader() });

const updateConfig = (configName, configData) =>
  axios.put(`${baseURL}/api/config/${configName}`, configData, {
    headers: authHeader(),
  });

const restartServer = () =>
  axios.post(`${baseURL}/api/config/restart`, {}, { headers: authHeader() });

const testSmtp = () =>
  axios.post(`${baseURL}/api/mail/test-smtp`, {}, { headers: authHeader() });

const ConfigService = {
  getConfig,
  updateConfig,
  restartServer,
  testSmtp,
};

export default ConfigService;
