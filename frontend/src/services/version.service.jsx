import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getVersions = (organization, boxId) =>
  axios.get(
    `${baseURL}/api/organization/${organization}/box/${boxId}/version`,
    { headers: authHeader() }
  );

const createVersion = (organization, name, data) =>
  axios.post(
    `${baseURL}/api/organization/${organization}/box/${name}/version`,
    data,
    { headers: authHeader() }
  );

const getVersion = (organization, boxId, versionNumber) =>
  axios.get(
    `${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}`,
    { headers: authHeader() }
  );

const updateVersion = (organization, boxId, versionNumber, data) =>
  axios.put(
    `${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}`,
    data,
    { headers: authHeader() }
  );

const deleteVersion = (organization, boxId, versionNumber) =>
  axios.delete(
    `${baseURL}/api/organization/${organization}/box/${boxId}/version/${versionNumber}`,
    { headers: authHeader() }
  );

const VersionService = {
  getVersions,
  createVersion,
  getVersion,
  updateVersion,
  deleteVersion,
};

export default VersionService;
