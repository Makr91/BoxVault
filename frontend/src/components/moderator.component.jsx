import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import EventBus from "../common/EventBus";
import AuthService from "../services/auth.service";
import InvitationService from "../services/invitation.service";
import OrganizationService from "../services/organization.service";
import RequestService from "../services/request.service";
import UserService from "../services/user.service";
import { log } from "../utils/Logger";

import ConfirmationModal from "./confirmation.component";

const Moderator = ({ currentOrganization }) => {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = t("moderator.pageTitle");
  }, [t]);

  const [users, setUsers] = useState([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [updateMessage, setUpdateMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [invitationMessage, setInvitationMessage] = useState("");
  const [activeInvitations, setActiveInvitations] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [orgEmail, setOrgEmail] = useState("");
  const [orgEmailHash, setOrgEmailHash] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [orgAccessMode, setOrgAccessMode] = useState("private");
  const [orgDefaultRole, setOrgDefaultRole] = useState("user");
  const [inviteRole, setInviteRole] = useState("user");
  const [activeTab, setActiveTab] = useState("organization");

  const validateOrgName = (orgName) => {
    const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
    return orgName && validCharsRegex.test(orgName);
  };

  const checkOrganizationExists = async (name) => {
    try {
      const response = await OrganizationService.getOrganizationByName(name);
      return !!response.data;
    } catch (error) {
      log.api.error("Error checking organization existence", {
        name,
        error: error.message,
      });
      return false;
    }
  };

  useEffect(() => {
    if (currentOrganization) {
      const loadData = async () => {
        try {
          const [
            orgUsersResponse,
            invitationsResponse,
            orgDetailsResponse,
            joinRequestsResponse,
          ] = await Promise.all([
            OrganizationService.getOrganizationWithUsers(currentOrganization),
            InvitationService.getActiveInvitations(currentOrganization),
            OrganizationService.getOrganizationByName(currentOrganization),
            RequestService.getOrgJoinRequests(currentOrganization),
          ]);

          setUsers(orgUsersResponse.data);
          setActiveInvitations(invitationsResponse.data);
          setJoinRequests(joinRequestsResponse.data || []);

          setNewOrgName(orgDetailsResponse.data.name);
          setOrgEmail(orgDetailsResponse.data.email || "");
          setOrgEmailHash(orgDetailsResponse.data.emailHash || "");
          setOrgDescription(orgDetailsResponse.data.description || "");
          setOrgAccessMode(orgDetailsResponse.data.access_mode || "private");
          setOrgDefaultRole(orgDetailsResponse.data.default_role || "user");

          setLoading(false);
        } catch (error) {
          log.api.error("Error fetching moderator data", {
            organization: currentOrganization,
            error: error.message,
          });
          if (error.response && error.response.status === 401) {
            EventBus.dispatch("logout");
          }
          setLoading(false);
        }
      };

      loadData();
    }
  }, [currentOrganization]);

  const handleUpdateOrganization = async (e) => {
    e.preventDefault();
    // Validation
    if (!newOrgName.trim()) {
      setUpdateMessage(t("moderator.orgNameRequired"));
      return;
    }
    if (!validateOrgName(newOrgName)) {
      setUpdateMessage(t("moderator.invalidOrgName"));
      return;
    }
    if (!orgEmail.trim()) {
      setUpdateMessage(t("moderator.orgEmailRequired"));
      return;
    }

    if (newOrgName !== currentOrganization) {
      const organizationExists = await checkOrganizationExists(newOrgName);
      if (organizationExists) {
        setUpdateMessage(t("moderator.orgExists"));
        return;
      }
    }

    try {
      // Update organization details
      await OrganizationService.updateOrganization(currentOrganization, {
        organization: newOrgName,
        email: orgEmail,
        description: orgDescription,
      });

      // Update access mode separately if changed
      await OrganizationService.updateAccessMode(
        currentOrganization,
        orgAccessMode,
        orgDefaultRole
      );

      // Update the user's organization in localStorage if name changed
      if (newOrgName !== currentOrganization) {
        const currentUser = AuthService.getCurrentUser();
        if (currentUser) {
          currentUser.organization = newOrgName;
          localStorage.setItem("user", JSON.stringify(currentUser));
        }

        // Trigger an EventBus event to update App.jsx state
        EventBus.dispatch("organizationUpdated", {
          oldName: currentOrganization,
          newName: newOrgName,
        });
      }

      setUpdateMessage(t("moderator.orgUpdateSuccess"));
    } catch (error) {
      log.component.error("Error updating organization", {
        organization: currentOrganization,
        error: error.message,
      });
      setUpdateMessage(t("moderator.orgUpdateError"));
    }
  };

  const handlePromoteUser = (userId) => {
    UserService.promoteToModerator(userId).then(() => {
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, roles: ["moderator"] } : user
        )
      );
    });
  };

  const handleDemoteUser = (userId) => {
    UserService.demoteToUser(userId).then(() => {
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, roles: ["user"] } : user
        )
      );
    });
  };

  const handleSendInvitation = async (e) => {
    e.preventDefault();
    try {
      const response = await AuthService.sendInvitation(
        email,
        currentOrganization
      );
      const invitationDetails = `Invitation sent! 
        ${t("moderator.invitation.token")}: ${response.data.invitationToken}
        ${t("moderator.invitation.expires")}: ${new Date(response.data.invitationTokenExpires).toLocaleString()}
        ${t("moderator.invitation.orgId")}: ${response.data.organizationId}
        ${t("moderator.invitation.link")}: ${response.data.invitationLink}`;
      setInvitationMessage(invitationDetails);
      setEmail("");
    } catch (error) {
      log.component.error("Error sending invitation", {
        email,
        organization: currentOrganization,
        error: error.message,
      });
      setInvitationMessage(t("moderator.invitation.sendWarning"));
    } finally {
      // Always refresh invitations list (even if email failed)
      try {
        const invitationsResponse =
          await InvitationService.getActiveInvitations(currentOrganization);
        setActiveInvitations(invitationsResponse.data);
      } catch (error) {
        log.component.error("Error refreshing invitations", {
          error: error.message,
        });
      }
    }
  };

  const handleDeleteClick = (invitation) => {
    setItemToDelete({ type: "invitation", id: invitation.id });
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete && itemToDelete.type === "invitation") {
      InvitationService.deleteInvitation(itemToDelete.id)
        .then(() => {
          setActiveInvitations((prevInvitations) =>
            prevInvitations.filter(
              (invitation) => invitation.id !== itemToDelete.id
            )
          );
          handleCloseDeleteModal();
        })
        .catch((error) => {
          log.component.error("Error deleting invitation", {
            invitationId: itemToDelete.id,
            error: error.message,
          });
          handleCloseDeleteModal();
        });
    }
  };

  const handleApproveJoinRequest = async (requestId, assignedRole = "user") => {
    try {
      await RequestService.approveJoinRequest(
        currentOrganization,
        requestId,
        assignedRole
      );
      setUpdateMessage(t("moderator.joinRequest.approved"));

      // Refresh join requests list
      const response =
        await RequestService.getOrgJoinRequests(currentOrganization);
      setJoinRequests(response.data || []);
    } catch (error) {
      log.component.error("Error approving join request", {
        requestId,
        error: error.message,
      });
      setUpdateMessage(
        t("moderator.joinRequest.approveError", { error: error.message })
      );
    }
  };

  const handleDenyJoinRequest = async (requestId) => {
    try {
      await RequestService.denyJoinRequest(currentOrganization, requestId);
      setUpdateMessage(t("moderator.joinRequest.denied"));

      // Refresh join requests list
      const response =
        await RequestService.getOrgJoinRequests(currentOrganization);
      setJoinRequests(response.data || []);
    } catch (error) {
      log.component.error("Error denying join request", {
        requestId,
        error: error.message,
      });
      setUpdateMessage(
        t("moderator.joinRequest.denyError", { error: error.message })
      );
    }
  };

  return (
    <div className="list row">
      <header>
        <h3 className="text-center">{t("moderator.title")}</h3>
      </header>

      {/* Navigation Tabs */}
      <ul className="nav nav-tabs">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "organization" ? "active" : ""}`}
            onClick={() => setActiveTab("organization")}
          >
            {t("moderator.tabs.organization")}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "joinRequests" ? "active" : ""}`}
            onClick={() => setActiveTab("joinRequests")}
          >
            {t("moderator.tabs.joinRequests")}
            {joinRequests.length > 0 && (
              <span className="badge bg-warning ms-2">
                {joinRequests.length}
              </span>
            )}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "invitations" ? "active" : ""}`}
            onClick={() => setActiveTab("invitations")}
          >
            {t("moderator.tabs.invitations")}
          </button>
        </li>
      </ul>

      {loading ? (
        <p>{t("loading")}</p>
      ) : (
        <div className="tab-content mt-3">
          {activeTab === "organization" && (
            <div className="row">
              <div className="col-md-12 mb-4">
                <div className="card mt-2 mb-2">
                  <div className="card-header">
                    <h4>{t("moderator.organization.title")}</h4>
                  </div>
                  <div className="card-body">
                    <form onSubmit={handleUpdateOrganization}>
                      <div className="form-group">
                        <label htmlFor="orgName">
                          {t("moderator.organization.name")}
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          id="orgName"
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="orgEmail">
                          {t("moderator.organization.email")}
                        </label>
                        <input
                          type="email"
                          className="form-control"
                          id="orgEmail"
                          value={orgEmail}
                          onChange={(e) => setOrgEmail(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="orgEmailHash">
                          {t("moderator.organization.emailHash")}
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          id="orgEmailHash"
                          value={orgEmailHash}
                          readOnly
                        />
                        <small className="form-text text-muted">
                          {t("moderator.organization.emailHashHint")}
                        </small>
                      </div>
                      <div className="form-group">
                        <label htmlFor="orgDescription">
                          {t("moderator.organization.description")}
                        </label>
                        <textarea
                          className="form-control"
                          id="orgDescription"
                          value={orgDescription}
                          onChange={(e) => setOrgDescription(e.target.value)}
                        />
                      </div>

                      <div className="row">
                        <div className="col-md-6">
                          <div className="form-group">
                            <label htmlFor="orgAccessMode">
                              {t("moderator.organization.accessMode")}
                            </label>
                            <select
                              className="form-control"
                              id="orgAccessMode"
                              value={orgAccessMode}
                              onChange={(e) => setOrgAccessMode(e.target.value)}
                            >
                              <option value="private">
                                {t(
                                  "moderator.organization.accessModes.private"
                                )}
                              </option>
                              <option value="invite_only">
                                {t(
                                  "moderator.organization.accessModes.inviteOnly"
                                )}
                              </option>
                              <option value="request_to_join">
                                {t(
                                  "moderator.organization.accessModes.requestToJoin"
                                )}
                              </option>
                            </select>
                            <small className="form-text text-muted">
                              {t("moderator.organization.accessModeHint")}
                            </small>
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-group">
                            <label htmlFor="orgDefaultRole">
                              {t("moderator.organization.defaultRole")}
                            </label>
                            <select
                              className="form-control"
                              id="orgDefaultRole"
                              value={orgDefaultRole}
                              onChange={(e) =>
                                setOrgDefaultRole(e.target.value)
                              }
                            >
                              <option value="user">{t("roles.user")}</option>
                              <option value="moderator">
                                {t("roles.moderator")}
                              </option>
                            </select>
                            <small className="form-text text-muted">
                              {t("moderator.organization.defaultRoleHint")}
                            </small>
                          </div>
                        </div>
                      </div>

                      <button type="submit" className="btn btn-primary mt-2">
                        {t("moderator.organization.updateButton")}
                      </button>
                    </form>
                    {updateMessage && (
                      <div className="alert alert-info mt-3">
                        {updateMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-md-12 mb-4">
                <div className="card mt-2 mb-2">
                  <div className="card-header">
                    <h4>
                      {t("moderator.users.title", {
                        organization: currentOrganization,
                      })}
                    </h4>
                  </div>
                  <ul className="list-group list-group-flush">
                    {users.map((user) => (
                      <li
                        className="list-group-item d-flex justify-content-between align-items-center"
                        key={user.id}
                      >
                        <div>
                          <strong>{user.username}</strong> <br />
                          <small>{user.email}</small> <br />
                          <small>
                            {t("moderator.users.boxes")}: {user.totalBoxes || 0}
                          </small>{" "}
                          <br />
                          <small>{t("moderator.users.roles")}:</small>
                          <ul>
                            {user.roles &&
                              user.roles.map((role) => (
                                <li key={role}>{t(`roles.${role}`)}</li>
                              ))}
                          </ul>
                        </div>
                        <div>
                          {user.roles &&
                            !user.roles.some((role) => role === "admin") &&
                            (user.roles.some((role) => role === "moderator") ? (
                              <button
                                className="btn btn-secondary btn-sm me-2"
                                onClick={() => handleDemoteUser(user.id)}
                              >
                                {t("moderator.users.demote")}
                              </button>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm me-2"
                                onClick={() => handlePromoteUser(user.id)}
                              >
                                {t("moderator.users.promote")}
                              </button>
                            ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === "joinRequests" && (
            <div className="card">
              <div className="card-header">
                <h4>{t("moderator.joinRequest.title")}</h4>
              </div>
              <div className="card-body">
                {joinRequests.length === 0 ? (
                  <div className="alert alert-info">
                    {t("moderator.joinRequest.noRequests")}
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>{t("moderator.joinRequest.email")}</th>
                          <th>{t("moderator.joinRequest.message")}</th>
                          <th>{t("moderator.joinRequest.requested")}</th>
                          <th>{t("moderator.joinRequest.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {joinRequests.map((request) => (
                          <tr key={request.id}>
                            <td>
                              <strong>{request.user.username}</strong>
                            </td>
                            <td>{request.user.email}</td>
                            <td>
                              {request.message ||
                                t("moderator.joinRequest.noMessage")}
                            </td>
                            <td>
                              {new Date(
                                request.created_at
                              ).toLocaleDateString()}
                            </td>
                            <td>
                              <div className="btn-group" role="group">
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() =>
                                    handleApproveJoinRequest(request.id, "user")
                                  }
                                >
                                  {t("moderator.joinRequest.approveAsUser")}
                                </button>
                                <button
                                  className="btn btn-warning btn-sm"
                                  onClick={() =>
                                    handleApproveJoinRequest(
                                      request.id,
                                      "moderator"
                                    )
                                  }
                                >
                                  {t(
                                    "moderator.joinRequest.approveAsModerator"
                                  )}
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() =>
                                    handleDenyJoinRequest(request.id)
                                  }
                                >
                                  {t("moderator.joinRequest.deny")}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "invitations" && (
            <div className="card">
              <div className="card-header">
                <div className="d-flex justify-content-between align-items-center">
                  <h4>{t("moderator.invitation.manageTitle")}</h4>
                </div>
              </div>
              <div className="card-body">
                <div className="mb-4">
                  <h5>{t("moderator.invitation.sendTitle")}</h5>
                  <form onSubmit={handleSendInvitation}>
                    <div className="row">
                      <div className="col-md-8">
                        <div className="form-group">
                          <label htmlFor="email">
                            {t("moderator.invitation.email")}
                          </label>
                          <input
                            type="email"
                            className="form-control"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="form-group">
                          <label htmlFor="inviteRole">
                            {t("moderator.invitation.assignRole")}
                          </label>
                          <select
                            className="form-control"
                            id="inviteRole"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                          >
                            <option value="user">{t("roles.user")}</option>
                            <option value="moderator">
                              {t("roles.moderator")}
                            </option>
                            <option value="admin">{t("roles.admin")}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary mt-2">
                      {t("moderator.invitation.sendButton")}
                    </button>
                  </form>
                  {invitationMessage && (
                    <div className="alert alert-info mt-3">
                      <pre>{invitationMessage}</pre>
                    </div>
                  )}
                </div>

                <h5>{t("moderator.invitation.activeTitle")}</h5>
                {activeInvitations.length === 0 ? (
                  <div className="alert alert-info">
                    {t("moderator.invitation.noActive")}
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t("moderator.invitation.email")}</th>
                          <th>{t("moderator.invitation.expires")}</th>
                          <th>{t("moderator.invitation.accepted")}</th>
                          <th>{t("moderator.invitation.expired")}</th>
                          <th>{t("moderator.invitation.link")}</th>
                          <th>{t("moderator.invitation.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeInvitations.map((invitation) => (
                          <tr key={invitation.id}>
                            <td>{invitation.email}</td>
                            <td>
                              {new Date(invitation.expires).toLocaleString()}
                            </td>
                            <td>{invitation.accepted ? t("yes") : t("no")}</td>
                            <td>{invitation.expired ? t("yes") : t("no")}</td>
                            <td>
                              <a
                                href={`${window.location.origin}/register?token=${encodeURIComponent(invitation.token)}&organization=${encodeURIComponent(currentOrganization)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {t("moderator.invitation.linkText")}
                              </a>
                            </td>
                            <td>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteClick(invitation)}
                              >
                                {t("buttons.delete")}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmationModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={handleConfirmDelete}
      />
    </div>
  );
};

Moderator.propTypes = {
  currentOrganization: PropTypes.string.isRequired,
};

export default Moderator;
