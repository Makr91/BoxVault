import axios from "axios";
import authHeader from "./auth-header";

const baseURL = window.location.origin;

const createServiceAccount = (description, expirationDays) => {
  return axios.post(`${baseURL}/api/service-accounts/`, { description, expirationDays }, { headers: authHeader() });
};

const getServiceAccounts = (signal) => {
  return axios.get(`${baseURL}/api/service-accounts/`, { 
    headers: authHeader(),
    signal // Pass the AbortSignal to axios
  });
};

const deleteServiceAccount = (id) => {
  return axios.delete(`${baseURL}/api/service-accounts/${id}`, { headers: authHeader() });
};

const ServiceAccountService = {
  createServiceAccount,
  getServiceAccounts,
  deleteServiceAccount
};

export default ServiceAccountService;
