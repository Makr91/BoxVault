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

const getDiscoverableOrganizations = () =>
  axios.get(`${baseURL}/api/organizations/discover`, { headers: authHeader() });

const updateAccessMode = (organizationName, accessMode, defaultRole) =>
  axios.put(
    `${baseURL}/api/organization/${organizationName}/access-mode`,
    { accessMode, defaultRole },
    { headers: authHeader() }
  );

const getUserOrgRole = (organizationName, userId) =>
  axios.get(
    `${baseURL}/api/organization/${organizationName}/users/${userId}/role`,
    {
      headers: authHeader(),
    }
  );

const updateUserOrgRole = (organizationName, userId, role) =>
  axios.put(
    `${baseURL}/api/organization/${organizationName}/users/${userId}/role`,
    { role },
    { headers: authHeader() }
  );

const removeUserFromOrg = (organizationName, userId) =>
  axios.delete(
    `${baseURL}/api/organization/${organizationName}/users/${userId}`,
    { headers: authHeader() }
  );

const OrganizationService = {
  getOrganizations,
  getOrganizationsWithUsers,
  getOrganizationWithUsers,
  getOrganizationByName,
  updateOrganization,
  resumeOrganization,
  suspendOrganization,
  deleteOrganization,
  getDiscoverableOrganizations,
  updateAccessMode,
  getUserOrgRole,
  updateUserOrgRole,
  removeUserFromOrg,
};

export default OrganizationService;
