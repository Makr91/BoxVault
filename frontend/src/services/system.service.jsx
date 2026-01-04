import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getStorageInfo = () =>
  axios.get(`${baseURL}/api/system/storage`, { headers: authHeader() });

const getUpdateStatus = () =>
  axios.get(`${baseURL}/api/system/update-check`, { headers: authHeader() });

const SystemService = {
  getStorageInfo,
  getUpdateStatus,
};

export default SystemService;
