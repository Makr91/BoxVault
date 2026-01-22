import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import EventBus from "../common/EventBus";
import AuthService from "../services/auth.service";
import OrganizationService from "../services/organization.service";
import UserService from "../services/user.service";
import { validateOrgName } from "../utils/ConfigProcessorUtils";

import ConfirmationModal from "./confirmation.component";
import UserCard from "./UserCard.component";

/**
 * OrganizationUserManager - Manages organizations and their users
 */
const OrganizationUserManager = () => {
  const { t } = useTranslation();
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
  const currentUser = AuthService.getCurrentUser();

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

  const handleRemoveUserFromOrg = (organizationName, userId) => {
    setItemToDelete({
      type: "user_remove",
      id: userId,
      orgName: organizationName,
    });
    setShowDeleteModal(true);
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
      } else if (itemToDelete.type === "user_remove") {
        OrganizationService.removeUserFromOrg(
          itemToDelete.orgName,
          itemToDelete.id
        ).then(() => {
          setOrganizations((prev) =>
            prev.map((org) =>
              org.name === itemToDelete.orgName
                ? {
                    ...org,
                    members: org.members.filter(
                      (user) => user.id !== itemToDelete.id
                    ),
                  }
                : org
            )
          );
        });
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

    const isValid = validateOrgName(newOrgName);
    if (!isValid) {
      setRenameMessage(t("validation.invalidOrgName"));
      return;
    }

    if (newOrgName === oldName) {
      setRenameMessage(t("orgUserManager.rename.sameNameError"));
      return;
    }

    const organizationExists = await checkOrganizationExists(newOrgName);
    if (organizationExists) {
      setRenameMessage(t("orgUserManager.rename.orgExistsError"));
      return;
    }

    try {
      const response = await OrganizationService.updateOrganization(oldName, {
        organization: newOrgName,
      });

      if (response.status === 200) {
        if (currentUser && currentUser.organization === oldName) {
          currentUser.organization = newOrgName;
          localStorage.setItem("user", JSON.stringify(currentUser));

          // Force token refresh to update claims with new org name
          await AuthService.forceTokenRefresh();

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
        setRenameMessage(t("orgUserManager.rename.success"));
      }
    } catch {
      setRenameMessage(t("orgUserManager.rename.error"));
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
          placeholder={t("orgUserManager.searchPlaceholder")}
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
                      {t("buttons.save")}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm mt-2 ms-2"
                      type="button"
                      onClick={() => setEditingOrgId(null)}
                    >
                      {t("buttons.cancel")}
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
                    {t("buttons.edit")}
                  </button>
                  <button
                    className="btn btn-primary btn-sm me-2"
                    onClick={() => {
                      setEditingOrgId(org.id);
                      setNewOrgName(org.name);
                      setOldName(org.name);
                    }}
                  >
                    {t("buttons.rename")}
                  </button>
                  <button
                    className={`btn btn-${org.suspended ? "success" : "warning"} btn-sm me-2`}
                    onClick={() =>
                      handleSuspendOrResumeOrganization(org.name, org.suspended)
                    }
                  >
                    {org.suspended ? t("buttons.resume") : t("buttons.suspend")}
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
                    {t("buttons.delete")}
                  </button>
                </div>
              </div>
              <div className="card-body">
                <p>
                  {t("orgUserManager.totalBoxes", { count: org.totalBoxes })}
                </p>
                <div className="row">
                  {org.members.map((user) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      currentUser={currentUser}
                      onPromote={() => handlePromoteUser(user.id)}
                      onDemote={() => handleDemoteUser(user.id)}
                      onSuspend={() =>
                        handleSuspendOrResumeUser(user.id, false)
                      }
                      onResume={() => handleSuspendOrResumeUser(user.id, true)}
                      onRemoveFromOrg={() =>
                        handleRemoveUserFromOrg(org.name, user.id)
                      }
                      onDelete={() =>
                        handleDeleteClick({ type: "user", id: user.id })
                      }
                    />
                  ))}
                </div>
              </div>
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
                  {t("orgUserManager.editModal.title", {
                    orgName: editingOrg.name,
                  })}
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
                  <label htmlFor="editOrgCode">
                    {t("orgUserManager.editModal.orgCode")}
                  </label>
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
                    {t("orgUserManager.editModal.orgCodeHint")}
                  </small>
                </div>
                <div className="form-group mb-3">
                  <label htmlFor="editOrgEmail">
                    {t("orgUserManager.editModal.orgEmail")}
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    id="editOrgEmail"
                    value={editOrgEmail}
                    onChange={(e) => setEditOrgEmail(e.target.value)}
                  />
                  <small className="form-text text-muted">
                    {t("orgUserManager.editModal.orgEmailHint")}
                  </small>
                </div>
                <div className="form-group mb-3">
                  <label htmlFor="editOrgDescription">
                    {t("orgUserManager.editModal.description")}
                  </label>
                  <textarea
                    className="form-control"
                    id="editOrgDescription"
                    value={editOrgDescription}
                    onChange={(e) => setEditOrgDescription(e.target.value)}
                    rows="3"
                  />
                </div>
                <div className="form-group mb-3">
                  <label htmlFor="editOrgAccessMode">
                    {t("orgUserManager.editModal.accessMode")}
                  </label>
                  <select
                    className="form-control"
                    id="editOrgAccessMode"
                    value={editOrgAccessMode}
                    onChange={(e) => setEditOrgAccessMode(e.target.value)}
                  >
                    <option value="private">
                      {t("orgUserManager.editModal.accessModes.private")}
                    </option>
                    <option value="invite_only">
                      {t("orgUserManager.editModal.accessModes.inviteOnly")}
                    </option>
                    <option value="request_to_join">
                      {t("orgUserManager.editModal.accessModes.requestToJoin")}
                    </option>
                  </select>
                  <small className="form-text text-muted">
                    {t("orgUserManager.editModal.accessModeHint")}
                  </small>
                </div>
                <div className="form-group mb-3">
                  <label htmlFor="editOrgDefaultRole">
                    {t("orgUserManager.editModal.defaultRole")}
                  </label>
                  <select
                    className="form-control"
                    id="editOrgDefaultRole"
                    value={editOrgDefaultRole}
                    onChange={(e) => setEditOrgDefaultRole(e.target.value)}
                  >
                    <option value="user">{t("roles.user")}</option>
                    <option value="moderator">{t("roles.moderator")}</option>
                  </select>
                  <small className="form-text text-muted">
                    {t("orgUserManager.editModal.defaultRoleHint")}
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  {t("buttons.cancel")}
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

                      setEditMessage(
                        t("orgUserManager.editModal.updateSuccess")
                      );
                      setTimeout(() => {
                        setShowEditModal(false);
                        setEditMessage("");
                      }, 1500);
                    } catch (error) {
                      setEditMessage(
                        error.response?.data?.message ||
                          t("orgUserManager.editModal.updateError")
                      );
                    }
                  }}
                >
                  {t("buttons.save")}
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
