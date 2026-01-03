import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

import EventBus from "../common/EventBus";
import AuthService from "../services/auth.service";
import OrganizationService from "../services/organization.service";
import UserService from "../services/user.service";
import { validateOrgName } from "../utils/ConfigProcessorUtils";

import ConfirmationModal from "./confirmation.component";

/**
 * OrganizationUserManager - Manages organizations and their users
 */
const OrganizationUserManager = () => {
  const [organizations, setOrganizations] = useState([]);
  const [editingOrgId, setEditingOrgId] = useState(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [oldName, setOldName] = useState("");
  const [renameMessage, setRenameMessage] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [editOrgCode, setEditOrgCode] = useState("");
  const [editOrgEmail, setEditOrgEmail] = useState("");
  const [editOrgDescription, setEditOrgDescription] = useState("");
  const [editOrgAccessMode, setEditOrgAccessMode] = useState("private");
  const [editOrgDefaultRole, setEditOrgDefaultRole] = useState("user");
  const [editMessage, setEditMessage] = useState("");
  const [itemToDelete, setItemToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    OrganizationService.getOrganizationsWithUsers().then(
      (response) => {
        setOrganizations(response.data);
      },
      (error) => {
        if (error.response && error.response.status === 401) {
          EventBus.dispatch("logout");
        }
      }
    );
  }, []);

  const checkOrganizationExists = async (name) => {
    try {
      const response = await OrganizationService.getOrganizationByName(name);
      return !!response.data;
    } catch {
      return false;
    }
  };

  const handleDeleteOrganization = (organizationName) => {
    OrganizationService.deleteOrganization(organizationName).then(() => {
      setOrganizations((prev) =>
        prev.filter((org) => org.name !== organizationName)
      );
    });
  };

  const handleDeleteUser = (userId) => {
    UserService.deleteUser(userId).then(() => {
      setOrganizations((prev) =>
        prev.map((org) => ({
          ...org,
          members: org.members.filter((user) => user.id !== userId),
        }))
      );
    });
  };

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      if (itemToDelete.type === "user") {
        handleDeleteUser(itemToDelete.id);
      } else if (itemToDelete.type === "organization") {
        handleDeleteOrganization(itemToDelete.name);
      }
      handleCloseDeleteModal();
    }
  };

  const handleSuspendOrResumeUser = (userId, isSuspended) => {
    const action = isSuspended
      ? UserService.resumeUser(userId)
      : UserService.suspendUser(userId);

    action.then(() => {
      setOrganizations((prev) =>
        prev.map((org) => ({
          ...org,
          members: org.members.map((user) =>
            user.id === userId ? { ...user, suspended: !isSuspended } : user
          ),
        }))
      );
    });
  };

  const handleSuspendOrResumeOrganization = (organizationName, isSuspended) => {
    const action = isSuspended
      ? OrganizationService.resumeOrganization(organizationName)
      : OrganizationService.suspendOrganization(organizationName);

    action.then(() => {
      setOrganizations((prev) =>
        prev.map((org) =>
          org.name === organizationName
            ? { ...org, suspended: !isSuspended }
            : org
        )
      );
    });
  };

  const handlePromoteUser = (userId) => {
    UserService.promoteToModerator(userId).then(() => {
      setOrganizations((prev) =>
        prev.map((org) => ({
          ...org,
          members: org.members.map((user) =>
            user.id === userId
              ? { ...user, roles: [{ name: "moderator" }] }
              : user
          ),
        }))
      );
    });
  };

  const handleDemoteUser = (userId) => {
    UserService.demoteToUser(userId).then(() => {
      setOrganizations((prev) =>
        prev.map((org) => ({
          ...org,
          members: org.members.map((user) =>
            user.id === userId ? { ...user, roles: [{ name: "user" }] } : user
          ),
        }))
      );
    });
  };

  const handleRenameOrganization = async (e) => {
    e.preventDefault();

    // Reset message at start
    setRenameMessage("");

    const validationError = validateOrgName(newOrgName);
    if (validationError) {
      setRenameMessage(validationError);
      return;
    }

    if (newOrgName === oldName) {
      setRenameMessage(
        "New name is the same as the old name. Please enter a different name."
      );
      return;
    }

    const organizationExists = await checkOrganizationExists(newOrgName);
    if (organizationExists) {
      setRenameMessage(
        "An organization with this name already exists. Please choose a different name."
      );
      return;
    }

    try {
      await OrganizationService.updateOrganization(oldName, {
        organization: newOrgName,
      });

      // Update the user's organization in localStorage if they renamed their own org
      const currentUser = AuthService.getCurrentUser();
      if (currentUser && currentUser.organization === oldName) {
        currentUser.organization = newOrgName;
        localStorage.setItem("user", JSON.stringify(currentUser));

        // Trigger an EventBus event to update App.jsx state
        EventBus.dispatch("organizationUpdated", {
          oldName,
          newName: newOrgName,
        });
      }

      setOrganizations((prevOrgs) =>
        prevOrgs.map((org) =>
          org.name === oldName ? { ...org, name: newOrgName } : org
        )
      );
      setEditingOrgId(null);
      setNewOrgName("");
      setOldName("");
      setRenameMessage("Organization renamed successfully!");
    } catch {
      setRenameMessage("Error renaming organization. Please try again.");
    }
  };

  const filteredOrganizations = organizations.filter((org) => {
    if (!searchTerm) {
      return true;
    }
    const term = searchTerm.toLowerCase();
    return (
      org.name.toLowerCase().includes(term) ||
      (org.org_code && org.org_code.toLowerCase().includes(term))
    );
  });

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          className="form-control"
          placeholder="Search organizations by name or code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="row">
        {filteredOrganizations.map((org) => (
          <div className="col-md-6" key={org.id}>
            <div className="card mt-4">
              <div className="card-header d-flex justify-content-between align-items-center">
                {editingOrgId === org.id ? (
                  <form onSubmit={handleRenameOrganization} noValidate>
                    {renameMessage && (
                      <div className="alert alert-info mt-3 mb-3">
                        {renameMessage}
                      </div>
                    )}
                    <input
                      type="text"
                      className="form-control"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                    />
                    <button
                      className="btn btn-success btn-sm mt-2"
                      type="submit"
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-secondary btn-sm mt-2 ms-2"
                      type="button"
                      onClick={() => setEditingOrgId(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <Link to={`/${org.name}`} className="card-title">
                    {org.org_code ? `${org.org_code} - ${org.name}` : org.name}
                  </Link>
                )}
                <div>
                  <button
                    className="btn btn-info btn-sm me-2"
                    onClick={async () => {
                      const response =
                        await OrganizationService.getOrganizationByName(
                          org.name
                        );
                      setEditingOrg(response.data);
                      setEditOrgCode(response.data.org_code || "");
                      setEditOrgEmail(response.data.email || "");
                      setEditOrgDescription(response.data.description || "");
                      setEditOrgAccessMode(
                        response.data.access_mode || "private"
                      );
                      setEditOrgDefaultRole(
                        response.data.default_role || "user"
                      );
                      setShowEditModal(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-primary btn-sm me-2"
                    onClick={() => {
                      setEditingOrgId(org.id);
                      setNewOrgName(org.name);
                      setOldName(org.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className={`btn btn-${org.suspended ? "success" : "warning"} btn-sm me-2`}
                    onClick={() =>
                      handleSuspendOrResumeOrganization(org.name, org.suspended)
                    }
                  >
                    {org.suspended ? "Resume" : "Suspend"}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() =>
                      handleDeleteClick({
                        type: "organization",
                        name: org.name,
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="card-body">
                <p>Total Boxes: {org.totalBoxes}</p>
              </div>
              <ul className="list-group list-group-flush">
                {org.members.map((user) => (
                  <li
                    className="list-group-item d-flex justify-content-between align-items-center"
                    key={user.id}
                  >
                    <div>
                      <strong>{user.username}</strong> <br />
                      <small>{user.email}</small> <br />
                      <small>Boxes: {user.totalBoxes}</small> <br />
                      <small>Roles:</small>
                      <ul>
                        {user.roles &&
                          user.roles.map((role) => (
                            <li key={role.name}>{role.name}</li>
                          ))}
                      </ul>
                    </div>
                    <div>
                      {user.roles &&
                        !user.roles.some((role) => role.name === "admin") &&
                        (user.roles.some(
                          (role) => role.name === "moderator"
                        ) ? (
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
                      <button
                        className={`btn btn-${user.suspended ? "success" : "warning"} btn-sm me-2`}
                        onClick={() =>
                          handleSuspendOrResumeUser(user.id, user.suspended)
                        }
                      >
                        {user.suspended ? "Resume" : "Suspend"}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          handleDeleteClick({ type: "user", id: user.id })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={handleConfirmDelete}
      />

      {/* Edit Organization Modal */}
      {showEditModal && editingOrg && (
        <div className="modal show d-block modal-backdrop-custom" tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Edit Organization: {editingOrg.name}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowEditModal(false)}
                />
              </div>
              <div className="modal-body">
                {editMessage && (
                  <div
                    className={`alert alert-${editMessage.includes("success") ? "success" : "danger"}`}
                  >
                    {editMessage}
                  </div>
                )}
                <div className="form-group mb-3">
                  <label htmlFor="editOrgCode">Organization Code</label>
                  <input
                    type="text"
                    className="form-control"
                    id="editOrgCode"
                    value={editOrgCode}
                    onChange={(e) => {
                      const value = e.target.value
                        .toUpperCase()
                        .replace(/[^0-9A-F]/g, "");
                      setEditOrgCode(value);
                    }}
                    maxLength="6"
                    pattern="[0-9A-F]{6}"
                  />
                  <small className="form-text text-muted">
                    6-character hexadecimal identifier (0-9, A-F)
                  </small>
                </div>
                <div className="form-group mb-3">
                  <label htmlFor="editOrgEmail">Organization Email</label>
                  <input
                    type="email"
                    className="form-control"
                    id="editOrgEmail"
                    value={editOrgEmail}
                    onChange={(e) => setEditOrgEmail(e.target.value)}
                  />
                  <small className="form-text text-muted">
                    Used for organization contact and Gravatar
                  </small>
                </div>
                <div className="form-group mb-3">
                  <label htmlFor="editOrgDescription">Description</label>
                  <textarea
                    className="form-control"
                    id="editOrgDescription"
                    value={editOrgDescription}
                    onChange={(e) => setEditOrgDescription(e.target.value)}
                    rows="3"
                  />
                </div>
                <div className="form-group mb-3">
                  <label htmlFor="editOrgAccessMode">Access Mode</label>
                  <select
                    className="form-control"
                    id="editOrgAccessMode"
                    value={editOrgAccessMode}
                    onChange={(e) => setEditOrgAccessMode(e.target.value)}
                  >
                    <option value="private">Private (Unlisted)</option>
                    <option value="invite_only">Invite Only (Listed)</option>
                    <option value="request_to_join">
                      Request to Join (Listed)
                    </option>
                  </select>
                  <small className="form-text text-muted">
                    Controls organization visibility and join methods
                  </small>
                </div>
                <div className="form-group mb-3">
                  <label htmlFor="editOrgDefaultRole">Default Role</label>
                  <select
                    className="form-control"
                    id="editOrgDefaultRole"
                    value={editOrgDefaultRole}
                    onChange={(e) => setEditOrgDefaultRole(e.target.value)}
                  >
                    <option value="user">User</option>
                    <option value="moderator">Moderator</option>
                  </select>
                  <small className="form-text text-muted">
                    Default role for new members
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    try {
                      await OrganizationService.updateOrganization(
                        editingOrg.name,
                        {
                          organization: editingOrg.name,
                          org_code: editOrgCode,
                          email: editOrgEmail,
                          description: editOrgDescription,
                        }
                      );

                      await OrganizationService.updateAccessMode(
                        editingOrg.name,
                        editOrgAccessMode,
                        editOrgDefaultRole
                      );

                      setEditMessage("Organization updated successfully!");
                      setTimeout(() => {
                        setShowEditModal(false);
                        setEditMessage("");
                      }, 1500);
                    } catch (error) {
                      setEditMessage(
                        error.response?.data?.message ||
                          "Error updating organization"
                      );
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OrganizationUserManager;
