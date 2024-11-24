import axios from "axios";
import authHeader from "./auth-header";

const baseURL = window.location.origin;

const discoverAll = () => {
  return axios.get(`${baseURL}/api/discover`, { headers: authHeader() });
};

const discoverAllbyName = (name) => {
  return axios.get(`${baseURL}/api/discover/box?name=${name}`, { headers: authHeader() });
};

const getAll = (organization) => {
  return axios.get(`${baseURL}/api/organization/${organization}/box`, { headers: authHeader() });
};

const getAllBoxes = () => {
  return axios.get(`${baseURL}/api/boxes`, { headers: authHeader() });
};

const get = (organization, name) => {
  return axios.get(`${baseURL}/api/organization/${organization}/box/${name}`, { headers: authHeader() });
};

const findByName = (organization, name) => {
  return axios.get(`${baseURL}/api/organization/${organization}/box?name=${name}`, { headers: authHeader() });
};

const create = (organization, data) => {
  return axios.post(`${baseURL}/api/organization/${organization}/box`, data, { headers: authHeader() });
};

const update = (organization, originalName, data) => {
  return axios.put(`${baseURL}/api/organization/${organization}/box/${originalName}`, data, { headers: authHeader() });
};

const remove = (organization, id) => {
  return axios.delete(`${baseURL}/api/organization/${organization}/box/${id}`, { headers: authHeader() });
};

const removeAll = (organization) => {
  return axios.delete(`${baseURL}/api/organization/${organization}/box`, { headers: authHeader() });
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
  getAllBoxes
};

export default BoxService;