import axios from "axios";
import authHeader from "./auth-header";

const API_URL = process.env.REACT_APP_API_BASE_URL;

const getArchitectures = (organization, boxId, versionNumber, providerName) => {
  return axios.get(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture`, { headers: authHeader() });
};

const getArchitectureByName = (organization, boxId, versionNumber, providerName, architectureName) => {
  return axios.get(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}`, { headers: authHeader() });
};

const createArchitecture = (organization, boxId, versionNumber, providerName, data) => {
  return axios.post(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture`, data, { headers: authHeader() });
};

const deleteArchitecture = (organization, boxId, versionNumber, providerName, architectureName) => {
  return axios.delete(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}`, { headers: authHeader() });
};

const ArchitectureService = {
  getArchitectures,
  createArchitecture,
  deleteArchitecture,
  getArchitectureByName
};

export default ArchitectureService;