import axios from "axios";
import authHeader from "./auth-header";

const API_URL = process.env.REACT_APP_API_BASE_URL;

const discoverAll = () => {
  return axios.get(`${API_URL}/discover`, { headers: authHeader() });
};

const discoverAllbyName = (name) => {
  return axios.get(`${API_URL}/discover/box?name=${name}`, { headers: authHeader() });
};

const getAll = (organization) => {
  return axios.get(`${API_URL}/organization/${organization}/box`, { headers: authHeader() });
};

const getAllBoxes = () => {
  return axios.get(`${API_URL}/boxes`, { headers: authHeader() });
};

const get = (organization, name) => {
  return axios.get(`${API_URL}/organization/${organization}/box/${name}`, { headers: authHeader() });
};

const findByName = (organization, name) => {
  return axios.get(`${API_URL}/organization/${organization}/box?name=${name}`, { headers: authHeader() });
};

const create = (organization, data) => {
  return axios.post(`${API_URL}/organization/${organization}/box`, data, { headers: authHeader() });
};

const update = (organization, originalName, data) => {
  return axios.put(`${API_URL}/organization/${organization}/box/${originalName}`, data, { headers: authHeader() });
};

const remove = (organization, id) => {
  return axios.delete(`${API_URL}/organization/${organization}/box/${id}`, { headers: authHeader() });
};

const removeAll = (organization) => {
  return axios.delete(`${API_URL}/organization/${organization}/box`, { headers: authHeader() });
};

const createVersion = (organization, name, data) => {
  return axios.post(`${API_URL}/organization/${organization}/box/${name}/version`, data, { headers: authHeader() });
};

const getVersions = (organization, name) => {
  return axios.get(`${API_URL}/organization/${organization}/box/${name}/version`, { headers: authHeader() });
};

const getVersion = (organization, boxId, versionNumber) => {
  return axios.get(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}`, { headers: authHeader() });
};

const updateVersion = (organization, boxId, versionNumber, data) => {
  return axios.put(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}`, data, { headers: authHeader() });
};

const deleteVersion = (organization, boxId, versionNumber) => {
  return axios.delete(`${API_URL}/organization/${organization}/box/${boxId}/version/${versionNumber}`, { headers: authHeader() });
};

const BoxService = {
  discoverAll,
  getAll,
  get,
  create,
  update,
  remove,
  removeAll,
  findByName,
  discoverAllbyName,
  createVersion,
  getVersion,
  updateVersion,
  deleteVersion,
  getVersions,
  getAllBoxes
};

export default BoxService;