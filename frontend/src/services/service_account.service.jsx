import axios from "axios";
import authHeader from "./auth-header";

const baseURL = window.location.origin;

const createServiceAccount = (description, expirationDays) => {
  return axios.post(`${baseURL}/api/service-accounts/`, { description, expirationDays }, { headers: authHeader() });
};

const getServiceAccounts = () => {
  return axios.get(`${baseURL}/api/service-accounts/`, { headers: authHeader() });
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