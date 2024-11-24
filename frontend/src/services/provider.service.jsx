import axios from "axios";
import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getProviders = (organization, boxId, versionNumber) => {
  return axios.get(`${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}/provider`, { headers: authHeader() });
};

const createProvider = (organization, boxId, versionNumber, data) => {
  return axios.post(`${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}/provider`, data, { headers: authHeader() });
};

const getProvider = (organization, boxId, versionNumber, providerName) => {
  return axios.get(`${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}`, { headers: authHeader() });
};

const updateProvider = (organization, boxId, versionNumber, providerName, data) => {
  return axios.put(`${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}`, data, { headers: authHeader() });
};

const deleteProvider = (organization, boxId, versionNumber, providerName) => {
  return axios.delete(`${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}`, { headers: authHeader() });
};

const ProviderService = {
  getProvider,
  updateProvider,
  deleteProvider,
  getProviders,
  createProvider,
};

export default ProviderService;