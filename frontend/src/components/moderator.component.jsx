import PropTypes from "prop-types";
import { useState, useEffect } from "react";

import EventBus from "../common/EventBus";
import AuthService from "../services/auth.service";
import InvitationService from "../services/invitation.service";
import OrganizationService from "../services/organization.service";
import RequestService from "../services/request.service";
import UserService from "../services/user.service";
import { log } from "../utils/Logger";

import ConfirmationModal from "./confirmation.component";

const Moderator = ({ currentOrganization }) => {
  useEffect(() => {
    document.title = "Moderator";
  }, []);

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
      setUpdateMessage("Organization name is required.");
      return;
    }
    if (!validateOrgName(newOrgName)) {
      setUpdateMessage(
        "Invalid organization name. Only alphanumeric characters, hyphens, underscores, and periods are allowed."
      );
      return;
    }
    if (!orgEmail.trim()) {
      setUpdateMessage("Organization email is required.");
      return;
    }

    if (newOrgName !== currentOrganization) {
      const organizationExists = await checkOrganizationExists(newOrgName);
      if (organizationExists) {
        setUpdateMessage(
          "An organization with this name already exists. Please choose a different name."
        );
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

      setUpdateMessage("Organization updated successfully!");
    } catch (error) {
      log.component.error("Error updating organization", {
        organization: currentOrganization,
        error: error.message,
      });
      setUpdateMessage("Error updating organization. Please try again.");
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
        Token: ${response.data.invitationToken}
        Expires: ${new Date(response.data.invitationTokenExpires).toLocaleString()}
        Organization ID: ${response.data.organizationId}
        Invitation Link: ${response.data.invitationLink}`;
      setInvitationMessage(invitationDetails);
      setEmail("");
    } catch (error) {
      log.component.error("Error sending invitation", {
        email,
        organization: currentOrganization,
        error: error.message,
      });
      setInvitationMessage(
        "Warning: Invitation created but email may not have been sent. You can copy the link below and send it manually."
      );
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
      setUpdateMessage("Join request approved successfully!");

      // Refresh join requests list
      const response =
        await RequestService.getOrgJoinRequests(currentOrganization);
      setJoinRequests(response.data || []);
    } catch (error) {
      log.component.error("Error approving join request", {
        requestId,
        error: error.message,
      });
      setUpdateMessage(`Error approving request: ${error.message}`);
    }
  };

  const handleDenyJoinRequest = async (requestId) => {
    try {
      await RequestService.denyJoinRequest(currentOrganization, requestId);
      setUpdateMessage("Join request denied.");

      // Refresh join requests list
      const response =
        await RequestService.getOrgJoinRequests(currentOrganization);
      setJoinRequests(response.data || []);
    } catch (error) {
      log.component.error("Error denying join request", {
        requestId,
        error: error.message,
      });
      setUpdateMessage(`Error denying request: ${error.message}`);
    }
  };

  return (
    <div className="list row">
      <header>
        <h3 className="text-center">Moderator Panel</h3>
      </header>

      {/* Navigation Tabs */}
      <ul className="nav nav-tabs">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "organization" ? "active" : ""}`}
            onClick={() => setActiveTab("organization")}
          >
            Organization
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "joinRequests" ? "active" : ""}`}
            onClick={() => setActiveTab("joinRequests")}
          >
            Join Requests
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
            Invitations
          </button>
        </li>
      </ul>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="tab-content mt-3">
          {activeTab === "organization" && (
            <div className="row">
              <div className="col-md-12 mb-4">
                <div className="card mt-2 mb-2">
                  <div className="card-header">
                    <h4>Organization Details</h4>
                  </div>
                  <div className="card-body">
                    <form onSubmit={handleUpdateOrganization}>
                      <div className="form-group">
                        <label htmlFor="orgName">Organization Name</label>
                        <input
                          type="text"
                          className="form-control"
                          id="orgName"
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="orgEmail">Organization Email</label>
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
                          Organization EmailHash
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          id="orgEmailHash"
                          value={orgEmailHash}
                          readOnly
                        />
                        <small className="form-text text-muted">
                          Auto-generated from organization email
                        </small>
                      </div>
                      <div className="form-group">
                        <label htmlFor="orgDescription">
                          Organization Description
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
                            <label htmlFor="orgAccessMode">Access Mode</label>
                            <select
                              className="form-control"
                              id="orgAccessMode"
                              value={orgAccessMode}
                              onChange={(e) => setOrgAccessMode(e.target.value)}
                            >
                              <option value="private">
                                Private (Unlisted)
                              </option>
                              <option value="invite_only">
                                Invite Only (Listed)
                              </option>
                              <option value="request_to_join">
                                Request to Join (Listed)
                              </option>
                            </select>
                            <small className="form-text text-muted">
                              Controls organization visibility and join methods
                            </small>
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-group">
                            <label htmlFor="orgDefaultRole">Default Role</label>
                            <select
                              className="form-control"
                              id="orgDefaultRole"
                              value={orgDefaultRole}
                              onChange={(e) =>
                                setOrgDefaultRole(e.target.value)
                              }
                            >
                              <option value="user">User</option>
                              <option value="moderator">Moderator</option>
                            </select>
                            <small className="form-text text-muted">
                              Default role for new members
                            </small>
                          </div>
                        </div>
                      </div>

                      <button type="submit" className="btn btn-primary mt-2">
                        Update Organization
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
                    <h4>Users in {currentOrganization}</h4>
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
                          <small>Boxes: {user.totalBoxes || 0}</small> <br />
                          <small>Roles:</small>
                          <ul>
                            {user.roles &&
                              user.roles.map((role) => (
                                <li key={role}>{role}</li>
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
                                Demote
                              </button>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm me-2"
                                onClick={() => handlePromoteUser(user.id)}
                              >
                                Promote
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
                <h4>Pending Join Requests</h4>
              </div>
              <div className="card-body">
                {joinRequests.length === 0 ? (
                  <div className="alert alert-info">
                    No pending join requests.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Email</th>
                          <th>Message</th>
                          <th>Requested</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {joinRequests.map((request) => (
                          <tr key={request.id}>
                            <td>
                              <strong>{request.user.username}</strong>
                            </td>
                            <td>{request.user.email}</td>
                            <td>{request.message || "No message"}</td>
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
                                  Approve as User
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
                                  Approve as Moderator
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() =>
                                    handleDenyJoinRequest(request.id)
                                  }
                                >
                                  Deny
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
                  <h4>Manage Invitations</h4>
                </div>
              </div>
              <div className="card-body">
                <div className="mb-4">
                  <h5>Send New Invitation</h5>
                  <form onSubmit={handleSendInvitation}>
                    <div className="row">
                      <div className="col-md-8">
                        <div className="form-group">
                          <label htmlFor="email">Email Address</label>
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
                          <label htmlFor="inviteRole">Assign Role</label>
                          <select
                            className="form-control"
                            id="inviteRole"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                          >
                            <option value="user">User</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary mt-2">
                      Send Invitation
                    </button>
                  </form>
                  {invitationMessage && (
                    <div className="alert alert-info mt-3">
                      <pre>{invitationMessage}</pre>
                    </div>
                  )}
                </div>

                <h5>Active Invitations</h5>
                {activeInvitations.length === 0 ? (
                  <div className="alert alert-info">No active invitations.</div>
                ) : (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Expires</th>
                          <th>Accepted</th>
                          <th>Expired</th>
                          <th>Invitation Link</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeInvitations.map((invitation) => (
                          <tr key={invitation.id}>
                            <td>{invitation.email}</td>
                            <td>
                              {new Date(invitation.expires).toLocaleString()}
                            </td>
                            <td>{invitation.accepted ? "Yes" : "No"}</td>
                            <td>{invitation.expired ? "Yes" : "No"}</td>
                            <td>
                              <a
                                href={`${window.location.origin}/register?token=${encodeURIComponent(invitation.token)}&organization=${encodeURIComponent(currentOrganization)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Invitation Link
                              </a>
                            </td>
                            <td>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteClick(invitation)}
                              >
                                Delete
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
