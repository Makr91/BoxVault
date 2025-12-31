import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getProviders = (organization, boxId, versionNumber) =>
  axios.get(
    `${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}/provider`,
    { headers: authHeader() }
  );

const createProvider = (organization, boxId, versionNumber, data) =>
  axios.post(
    `${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}/provider`,
    data,
    { headers: authHeader() }
  );

const getProvider = (organization, boxId, versionNumber, providerName) =>
  axios.get(
    `${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}`,
    { headers: authHeader() }
  );

const updateProvider = (
  organization,
  boxId,
  versionNumber,
  providerName,
  data
) =>
  axios.put(
    `${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}`,
    data,
    { headers: authHeader() }
  );

const deleteProvider = (organization, boxId, versionNumber, providerName) =>
  axios.delete(
    `${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}`,
    { headers: authHeader() }
  );

const ProviderService = {
  getProvider,
  updateProvider,
  deleteProvider,
  getProviders,
  createProvider,
};

export default ProviderService;
