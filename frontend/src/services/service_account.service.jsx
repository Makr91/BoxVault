import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const createServiceAccount = (description, expirationDays, organizationId) =>
  axios.post(
    `${baseURL}/api/service-accounts/`,
    { description, expirationDays, organizationId },
    { headers: authHeader() }
  );

const getAvailableOrganizations = () =>
  axios.get(`${baseURL}/api/service-accounts/organizations`, {
    headers: authHeader(),
  });

const getServiceAccounts = (signal) =>
  axios.get(`${baseURL}/api/service-accounts/`, {
    headers: authHeader(),
    signal, // Pass the AbortSignal to axios
  });

const deleteServiceAccount = (id) =>
  axios.delete(`${baseURL}/api/service-accounts/${id}`, {
    headers: authHeader(),
  });

const ServiceAccountService = {
  createServiceAccount,
  getAvailableOrganizations,
  getServiceAccounts,
  deleteServiceAccount,
};

export default ServiceAccountService;
