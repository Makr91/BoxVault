// setup.service.js
import axios from "axios";

const API_URL = "/api/setup";

const verifySetupToken = (token) =>
  axios.post(`${API_URL}/verify-token`, { token });

const getConfigs = (token) =>
  axios.get(API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

const updateConfigs = (token, configs) =>
  axios.put(
    API_URL,
    { configs },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

const isSetupComplete = () => axios.get(`${API_URL}/status`);

const uploadSSL = (token, formData) =>
  axios.post(`${API_URL}/upload-ssl`, formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    },
  });

export default {
  verifySetupToken,
  getConfigs,
  updateConfigs,
  isSetupComplete,
  uploadSSL,
};
