import axios from 'axios';

import authHeader from './auth-header';

const baseURL = window.location.origin;

const discoverAll = () => axios.get(`${baseURL}/api/discover`, { headers: authHeader() });

const discoverAllbyName = name =>
  axios.get(`${baseURL}/api/discover/box?name=${name}`, {
    headers: authHeader(),
  });

const getAll = organization =>
  axios.get(`${baseURL}/api/organization/${organization}/box`, {
    headers: authHeader(),
  });

const getAllBoxes = () => axios.get(`${baseURL}/api/boxes`, { headers: authHeader() });

const get = (organization, name) =>
  axios.get(`${baseURL}/api/organization/${organization}/box/${name}`, {
    headers: authHeader(),
  });

const findByName = (organization, name) =>
  axios.get(`${baseURL}/api/organization/${organization}/box?name=${name}`, {
    headers: authHeader(),
  });

const create = (organization, data) =>
  axios.post(`${baseURL}/api/organization/${organization}/box`, data, {
    headers: authHeader(),
  });

const update = (organization, originalName, data) =>
  axios.put(`${baseURL}/api/organization/${organization}/box/${originalName}`, data, {
    headers: authHeader(),
  });

const remove = (organization, id) =>
  axios.delete(`${baseURL}/api/organization/${organization}/box/${id}`, {
    headers: authHeader(),
  });

const removeAll = organization =>
  axios.delete(`${baseURL}/api/organization/${organization}/box`, {
    headers: authHeader(),
  });

const watch = (organization, name) =>
  axios.post(`${baseURL}/api/organization/${organization}/box/${name}/watch`, null, {
    headers: authHeader(),
  });

const unwatch = (organization, name) =>
  axios.delete(`${baseURL}/api/organization/${organization}/box/${name}/watch`, {
    headers: authHeader(),
  });

const getUserWatches = () => axios.get(`${baseURL}/api/user/watches`, { headers: authHeader() });

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
  getAllBoxes,
  watch,
  unwatch,
  getUserWatches,
};

export default BoxService;
