import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getActiveInvitations = (organizationId) =>
  axios.get(`${baseURL}/api/invitations/active/${organizationId}`, {
    headers: authHeader(),
  });

const deleteInvitation = (invitationId) =>
  axios.delete(`${baseURL}/api/invitations/${invitationId}`, {
    headers: authHeader(),
  });

const InvitationService = {
  getActiveInvitations,
  deleteInvitation,
};

export default InvitationService;
