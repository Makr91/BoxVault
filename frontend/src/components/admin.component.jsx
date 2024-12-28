import React, { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
import UserService from "../services/user.service";
import ConfigService from "../services/config.service";
import OrganizationService from "../services/organization.service";
import ConfirmationModal from './confirmation.component';
import EventBus from "../common/EventBus";
import { FaEye, FaEyeSlash } from "react-icons/fa6";

const Admin = () => {
  const [organizations, setOrganizations] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState("app");
  const [config, setConfig] = useState({});
  const [editingOrgId, setEditingOrgId] = useState(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [activeTab, setActiveTab] = useState("organizations");
  const [oldName, setOldName] = useState("");
  const [renameMessage, setRenameMessage] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [showPasswords, setShowPasswords] = useState({});
  const [isFormValid, setIsFormValid] = useState(true);

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

    fetchConfig(selectedConfig);
  }, [selectedConfig]);

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
      // Perform the deletion based on the item type
      if (itemToDelete.type === 'user') {
        handleDeleteUser(itemToDelete.id);
      } else if (itemToDelete.type === 'organization') {
        handleDeleteOrganization(itemToDelete.name);
      }
      handleCloseDeleteModal();
    }
  };

  const handleSuspendOrResumeUser = (userId, isSuspended) => {
    if (isSuspended) {
      UserService.resumeUser(userId).then(() => {
        setOrganizations((prev) =>
          prev.map((org) => ({
            ...org,
            users: org.users.map((user) =>
              user.id === userId ? { ...user, suspended: false } : user
            ),
          }))
        );
      });
    } else {
      UserService.suspendUser(userId).then(() => {
        setOrganizations((prev) =>
          prev.map((org) => ({
            ...org,
            users: org.users.map((user) =>
              user.id === userId ? { ...user, suspended: true } : user
            ),
          }))
        );
      });
    }
  };

  const handleDeleteOrganization = (organizationName) => {
    OrganizationService.deleteOrganization(organizationName).then(() => {
      setOrganizations((prev) => prev.filter((org) => org.name !== organizationName));
    });
  };

  const handleSuspendOrResumeOrganization = (organizationName, isSuspended) => {
    if (isSuspended) {
      OrganizationService.resumeOrganization(organizationName).then(() => {
        setOrganizations((prev) =>
          prev.map((org) =>
            org.name === organizationName ? { ...org, suspended: false } : org
          )
        );
      });
    } else {
      OrganizationService.suspendOrganization(organizationName).then(() => {
        setOrganizations((prev) =>
          prev.map((org) =>
            org.name === organizationName ? { ...org, suspended: true } : org
          )
        );
      });
    }
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
            user.id === userId
              ? { ...user, roles: [{ name: "user" }] }
              : user
          ),
        }))
      );
    });
  };

  const validateOrgName = (orgName) => {
    const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
    if (!orgName || !validCharsRegex.test(orgName)) {
      return "Invalid organization name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.";
    }
    return null;
  };

  const handleRenameOrganization = async (e) => {
    e.preventDefault();
    const validationError = validateOrgName(newOrgName);
    if (validationError) {
      setRenameMessage(validationError);
      return;
    }

    if (newOrgName === oldName) {
      setRenameMessage('New name is the same as the old name. Please enter a different name.');
      return;
    }

    const organizationExists = await checkOrganizationExists(newOrgName);
    if (organizationExists) {
      setRenameMessage('An organization with this name already exists. Please choose a different name.');
      return;
    }

    try {
      await OrganizationService.updateOrganization(oldName, newOrgName);
      setOrganizations((prevOrgs) =>
        prevOrgs.map((org) => (org.name === oldName ? { ...org, name: newOrgName } : org))
      );
      setEditingOrgId(null);
      setNewOrgName('');
      setOldName('');
      setRenameMessage('Organization renamed successfully!');
    } catch (error) {
      console.error('Error renaming organization:', error);
      setRenameMessage('Error renaming organization. Please try again.');
    }
  };

  const fetchConfig = (configName) => {
    ConfigService.getConfig(configName).then(
      (response) => {
        setConfig(response.data);
      },
      (error) => {
        console.error("Error fetching config:", error);
      }
    );
  };

  const updateConfig = () => {
    const newValidationErrors = {};
    let hasErrors = false;

    Object.entries(config).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null && 'type' in value && 'value' in value) {
        const error = validateConfigValue(value.type, value.value);
        if (error) {
          newValidationErrors[key] = error;
          hasErrors = true;
        }
      }
    });

    setValidationErrors(newValidationErrors);

    if (hasErrors) {
      setSubmitError("Please fix the validation errors before submitting.");
      setIsFormValid(false);
      return;
    }

    setIsFormValid(true);

    ConfigService.updateConfig(selectedConfig, config).then(
      () => {
        setMessage("Configuration updated successfully.");
        setMessageType("success");
        setSubmitError("");
      },
      (error) => {
        console.error("Error updating config:", error);
        setMessage("Error updating configuration.");
        setMessageType("danger");
      }
    );
  };

  const handleConfigChange = (path, value) => {
    setConfig((prevConfig) => {
      const newConfig = { ...prevConfig };
      let current = newConfig;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]].value = value;
      return newConfig;
    });

    const type = path.reduce((acc, key) => acc && acc[key], config).type;
    const validationError = validateConfigValue(type, value);

    setValidationErrors((prevErrors) => {
      const newErrors = { ...prevErrors, [path.join(".")]: validationError };
      // Update form validity
      const hasErrors = Object.values(newErrors).some((error) => error !== null);
      setIsFormValid(!hasErrors);
      return newErrors;
    });
  };

  const validateConfigValue = (type, value) => {
    switch (type) {
      case 'url':
        try {
          new URL(value);
          return null;
        } catch {
          return "Invalid URL format.";
        }
      case 'host':
        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const fqdnRegex = /^(?!:\/\/)(?=.{1,255}$)((.{1,63}\.){1,127}(?![0-9]*$)[a-z0-9-]+\.?)$/i;
        if (ipRegex.test(value) || fqdnRegex.test(value)) {
          return null;
        }
        return "Invalid host. Must be a valid IP address or FQDN.";
      case 'integer':
        return Number.isInteger(Number(value)) ? null : "Value must be an integer.";
      case 'boolean':
        return typeof value === 'boolean' ? null : "Value must be a boolean.";
      case 'password':
        return value.length >= 6 ? null : "Password must be at least 6 characters.";
      case 'email':
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
        return emailRegex.test(value) ? null : "Invalid email address.";
      default:
        return null;
    }
  };

  const renderConfigFields = (obj, path = []) => {
    return Object.keys(obj).map((key) => {
      const currentPath = [...path, key];
      const entry = obj[key];
      const errorKey = currentPath.join(".");
  
      if (typeof entry === 'object' && entry !== null && 'type' in entry && 'value' in entry) {
        const { type, value, description } = entry;
        const error = validationErrors[errorKey];
  
        const renderInput = () => {
          switch (type) {
            case 'boolean':
              return (
                <div className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id={errorKey}
                    checked={value}
                    onChange={(e) => handleConfigChange(currentPath, e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor={errorKey}>
                    {description}
                  </label>
                </div>
              );
            case 'password':
              return (
                <div className="input-group">
                  <input
                    type={showPasswords[errorKey] ? "text" : "password"}
                    className="form-control"
                    id={errorKey}
                    value={value}
                    onChange={(e) => handleConfigChange(currentPath, e.target.value)}
                  />
                  <button 
                    className="btn btn-outline-secondary" 
                    type="button"
                    onClick={() => setShowPasswords(prev => ({...prev, [errorKey]: !prev[errorKey]}))}
                  >
                     {showPasswords[errorKey] ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              );
            default:
              return (
                <input
                  type="text"
                  className="form-control"
                  id={errorKey}
                  value={value}
                  onChange={(e) => handleConfigChange(currentPath, e.target.value)}
                />
              );
          }
        };
  
        return (
          <div key={errorKey} className="form-group">
            <label htmlFor={errorKey}>{key}:</label>
            {renderInput()}
            <small className="form-text text-muted">{description}</small>
            {error && <div className="text-danger">{error}</div>}
          </div>
        );
      } else if (typeof entry === 'object' && entry !== null) {
        return (
          <div key={errorKey} className="col-md-6 mt-3">
            <h5 style={{ borderBottom: '1px solid rgb(204, 204, 204)', paddingBottom: '10px' }}>{key}</h5>
            <div className="row">
              {renderConfigFields(entry, currentPath)}
            </div>
          </div>
        );
      } else {
        return null;
      }
    });
  };

  const checkOrganizationExists = async (name) => {
    try {
      const response = await OrganizationService.getOrganizationByName(name);
      return response.data ? true : false;
    } catch (error) {
      console.error('Error checking organization existence:', error);
      return false;
    }
  };

  useEffect(() => {
    fetchConfig(selectedConfig);
  }, [selectedConfig]);

  useEffect(() => {
    setRenameMessage("");
  }, [editingOrgId]);

  return (
    <div className="list row">
      <header>
        <h3 className="text-center">Admin Panel</h3>
      </header>
      <ul className="nav nav-tabs">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "organizations" ? "active" : ""}`}
            onClick={() => setActiveTab("organizations")}
          >
            Organizations and Users
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "config" ? "active" : ""}`}
            onClick={() => setActiveTab("config")}
          >
            Configuration Management
          </button>
        </li>
      </ul>
      <div className="tab-content mt-2">
        {message && (
          <div className={`alert alert-${messageType}`} role="alert">
            {message}
          </div>
        )}
        {activeTab === "organizations" && (
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
                          onClick={() => setEditingOrgId(null)}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <Link to={`/${org.name}`} className="card-title">{org.name}</Link>
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
                        onClick={() => handleSuspendOrResumeOrganization(org.name, org.suspended)}
                      >
                        {org.suspended ? "Resume" : "Suspend"}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteClick({ type: 'organization', name: org.name })}
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
                            {user.roles && user.roles.map((role, index) => (
                              <li key={index}>{role.name}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          {user.roles && !user.roles.some((role) => role.name === "admin") && (
                            user.roles.some((role) => role.name === "moderator") ? (
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
                            )
                          )}
                          <button
                            className={`btn btn-${user.suspended ? "success" : "warning"} btn-sm me-2`}
                            onClick={() => handleSuspendOrResumeUser(user.id, user.suspended)}
                          >
                            {user.suspended ? "Resume" : "Suspend"}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteClick({ type: 'user', id: user.id })}
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
        )}
        {activeTab === "config" && (
          <div className="mt-5">
            <ul className="nav nav-tabs d-flex">
              <li className="nav-item">
                <button
                  className={`nav-link ${selectedConfig === 'app' ? 'active' : ''}`}
                  onClick={() => setSelectedConfig('app')}
                >
                  App Config
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${selectedConfig === 'auth' ? 'active' : ''}`}
                  onClick={() => setSelectedConfig('auth')}
                >
                  Auth Config
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${selectedConfig === 'db' ? 'active' : ''}`}
                  onClick={() => setSelectedConfig('db')}
                >
                  DB Config
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${selectedConfig === 'mail' ? 'active' : ''}`}
                  onClick={() => setSelectedConfig('mail')}
                >
                  Email Config
                </button>
              </li>
              <li className="nav-item ms-auto">
                <button
                  type="button"
                  className={`nav-link ${!isFormValid ? 'disabled' : ''}`}
                  onClick={updateConfig}
                  disabled={!isFormValid}
                  style={{ cursor: isFormValid ? 'pointer' : 'not-allowed' }}
                >
                  Update Configuration
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className="nav-link"
                  onClick={() => {
                    ConfigService.restartServer()
                      .then(() => {
                        setMessage("Server restart initiated");
                        setMessageType("success");
                      })
                      .catch(error => {
                        setMessage("Failed to restart server");
                        setMessageType("danger");
                      });
                  }}
                >
                  Restart Server
                </button>
              </li>
            </ul>
            {submitError && (
              <div className="alert alert-warning mt-3" role="alert">
                {submitError}
              </div>
            )}
            <div className="config-container mt-3">
              <div className="row">
                {renderConfigFields(config)}
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default Admin;
