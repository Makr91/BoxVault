import axios from "axios";
import authHeader from "./auth-header";

const API_URL = process.env.REACT_APP_API_BASE_URL;

const getProviders = (organization, boxId, versionNumber) => {
  return axios.get(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider`, { headers: authHeader() });
};

const createProvider = (organization, boxId, versionNumber, data) => {
  return axios.post(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider`, data, { headers: authHeader() });
};

const getProvider = (organization, boxId, versionNumber, providerName) => {
  return axios.get(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}`, { headers: authHeader() });
};

const updateProvider = (organization, boxId, versionNumber, providerName, data) => {
  return axios.put(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}`, data, { headers: authHeader() });
};

const deleteProvider = (organization, boxId, versionNumber, providerName) => {
  return axios.delete(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}`, { headers: authHeader() });
};

const ProviderService = {
  getProvider,
  updateProvider,
  deleteProvider,
  getProviders,
  createProvider,
};

export default ProviderService;