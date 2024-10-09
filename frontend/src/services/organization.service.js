import axios from "axios";
import authHeader from "./auth-header";

const getOrganizations = () => {
    return axios.get(process.env.REACT_APP_API_BASE_URL + "/organizations", { headers: authHeader() });
  };
  
  const getOrganizationsWithUsers = () => {
    return axios.get(process.env.REACT_APP_API_BASE_URL + "/organizations-with-users", { headers: authHeader() });
  };

  const getOrganizationWithUsers = (organizationName) => {
    return axios.get(process.env.REACT_APP_API_BASE_URL + `/organization/${organizationName}/users`, { headers: authHeader() });
  };

  const updateOrganization = (organizationName, newName) => {
    return axios.put(process.env.REACT_APP_API_BASE_URL + `/organization/${organizationName}`, { organization: newName }, { headers: authHeader() });
  };
  
  const suspendOrganization = (organizationName) => {
    return axios.put(process.env.REACT_APP_API_BASE_URL + `/organization/${organizationName}/suspend`, {}, { headers: authHeader() });
  };
  
  const resumeOrganization = (organizationName) => {
    return axios.put(process.env.REACT_APP_API_BASE_URL + `/organization/${organizationName}/resume`, {}, { headers: authHeader() });
  };
  
  const getOrganizationByName =(name) => {
    return axios.get(process.env.REACT_APP_API_BASE_URL + `/organization/${name}`, { headers: authHeader() });
  };

const OrganizationService = {
    getOrganizations,
    getOrganizationsWithUsers,
    getOrganizationWithUsers,
    getOrganizationByName,
    updateOrganization,
    resumeOrganization,
    suspendOrganization
};

export default OrganizationService;