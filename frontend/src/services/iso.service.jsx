import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getAll = (organizationName) =>
  axios.get(`${baseURL}/api/organization/${organizationName}/iso`, {
    headers: authHeader(),
  });

const getPublic = (organizationName) =>
  axios.get(`${baseURL}/api/organization/${organizationName}/public-isos`);

const discoverAll = () => axios.get(`${baseURL}/api/isos/discover`);

const upload = (organizationName, file, isPublic, onUploadProgress) => {
  const formData = new FormData();
  formData.append("iso", file);
  formData.append("isPublic", String(isPublic));

  return axios.post(
    `${baseURL}/api/organization/${organizationName}/iso`,
    formData,
    {
      headers: {
        ...authHeader(),
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress,
    }
  );
};

const deleteISO = (organizationName, isoId) =>
  axios.delete(`${baseURL}/api/organization/${organizationName}/iso/${isoId}`, {
    headers: authHeader(),
  });

const getDownloadLink = (organizationName, isoId) =>
  axios.get(
    `${baseURL}/api/organization/${organizationName}/iso/${isoId}/download`,
    { headers: authHeader() }
  );

const update = (organizationName, isoId, data) =>
  axios.put(
    `${baseURL}/api/organization/${organizationName}/iso/${isoId}`,
    data,
    { headers: authHeader() }
  );

const IsoService = {
  getAll,
  getPublic,
  discoverAll,
  upload,
  deleteISO,
  getDownloadLink,
  update,
};

export default IsoService;
