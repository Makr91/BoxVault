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
  const [itemToDelete, setItemToDelete] = useState(null);

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
          users: org.users.filter((user) => user.id !== userId),
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
          users: org.users.map((user) =>
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
          users: org.users.map((user) =>
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
          users: org.users.map((user) =>
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

  return (
    <div className="row">
      {organizations.map((org) => (
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
                  <button className="btn btn-success btn-sm mt-2" type="submit">
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
                  {org.name}
                </Link>
              )}
              <div>
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
              {org.users.map((user) => (
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
                      (user.roles.some((role) => role.name === "moderator") ? (
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
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default OrganizationUserManager;
