import axios from "axios";
import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getOrganizations = () => {
  return axios.get(`${baseURL}/api/organizations`, { headers: authHeader() });
};

const getOrganizationsWithUsers = () => {
  return axios.get(`${baseURL}/api/organizations-with-users`, { headers: authHeader() });
};

const getOrganizationWithUsers = (organizationName) => {
  return axios.get(`${baseURL}/api/organization/${organizationName}/users`, { headers: authHeader() });
};

const updateOrganization = (organizationName, newData) => {
  return axios.put(`${baseURL}/api/organization/${organizationName}`, newData, { headers: authHeader() });
};

const suspendOrganization = (organizationName) => {
  return axios.put(`${baseURL}/api/organization/${organizationName}/suspend`, {}, { headers: authHeader() });
};

const resumeOrganization = (organizationName) => {
  return axios.put(`${baseURL}/api/organization/${organizationName}/resume`, {}, { headers: authHeader() });
};

const getOrganizationByName = (name) => {
  return axios.get(`${baseURL}/api/organization/${name}`, { headers: authHeader() });
};

const deleteOrganization = (organization) => {
  return axios.delete(`${baseURL}/api/organization/${organization}`, { headers: authHeader() });
};

const OrganizationService = {
  getOrganizations,
  getOrganizationsWithUsers,
  getOrganizationWithUsers,
  getOrganizationByName,
  updateOrganization,
  resumeOrganization,
  suspendOrganization,
  deleteOrganization
};

export default OrganizationService;