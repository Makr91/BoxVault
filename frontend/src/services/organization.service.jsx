import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getOrganizations = () =>
  axios.get(`${baseURL}/api/organizations`, { headers: authHeader() });

const getOrganizationsWithUsers = () =>
  axios.get(`${baseURL}/api/organizations-with-users`, {
    headers: authHeader(),
  });

const getOrganizationWithUsers = (organizationName) =>
  axios.get(`${baseURL}/api/organization/${organizationName}/users`, {
    headers: authHeader(),
  });

const updateOrganization = (organizationName, newData) =>
  axios.put(`${baseURL}/api/organization/${organizationName}`, newData, {
    headers: authHeader(),
  });

const suspendOrganization = (organizationName) =>
  axios.put(
    `${baseURL}/api/organization/${organizationName}/suspend`,
    {},
    { headers: authHeader() }
  );

const resumeOrganization = (organizationName) =>
  axios.put(
    `${baseURL}/api/organization/${organizationName}/resume`,
    {},
    { headers: authHeader() }
  );

const getOrganizationByName = (name) =>
  axios.get(`${baseURL}/api/organization/${name}`, { headers: authHeader() });

const deleteOrganization = (organization) =>
  axios.delete(`${baseURL}/api/organization/${organization}`, {
    headers: authHeader(),
  });

const OrganizationService = {
  getOrganizations,
  getOrganizationsWithUsers,
  getOrganizationWithUsers,
  getOrganizationByName,
  updateOrganization,
  resumeOrganization,
  suspendOrganization,
  deleteOrganization,
};

export default OrganizationService;
