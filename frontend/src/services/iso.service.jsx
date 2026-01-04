import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const upload = (organization, file, isPublic, onUploadProgress) =>
  axios.post(`${baseURL}/api/organization/${organization}/iso`, file, {
    headers: {
      ...authHeader(),
      "Content-Type": "application/octet-stream",
      "x-file-name": file.name,
      "x-is-public": isPublic,
    },
    onUploadProgress,
  });

const getAll = (organization) =>
  axios.get(`${baseURL}/api/organization/${organization}/iso`, {
    headers: authHeader(),
  });

const deleteISO = (organization, isoId) =>
  axios.delete(`${baseURL}/api/organization/${organization}/iso/${isoId}`, {
    headers: authHeader(),
  });

const update = (organization, isoId, data) =>
  axios.put(`${baseURL}/api/organization/${organization}/iso/${isoId}`, data, {
    headers: authHeader(),
  });

const getDownloadLink = (organization, isoId) =>
  axios.post(
    `${baseURL}/api/organization/${organization}/iso/${isoId}/download-link`,
    {},
    {
      headers: authHeader(),
    }
  );

const IsoService = {
  upload,
  getAll,
  deleteISO,
  update,
  getDownloadLink,
};

export default IsoService;
