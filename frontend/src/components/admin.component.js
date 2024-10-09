import React, { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
import UserService from "../services/user.service";
import OrganizationService from "../services/organization.service";
import EventBus from "../common/EventBus";
import Form from "react-validation/build/form";
import Input from "react-validation/build/input";

const Admin = () => {
  const [organizations, setOrganizations] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState("app");
  const [config, setConfig] = useState({});
  const [editingOrgId, setEditingOrgId] = useState(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [activeTab, setActiveTab] = useState("organizations");
  const [oldName, setOldName] = useState("");
  const [renameMessage, setRenameMessage] = useState("");

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


  const handleRenameOrganization = async (e) => {
    e.preventDefault();
    if (!validateOrgName(newOrgName)) {
      setRenameMessage('Invalid organization name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.');
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
    UserService.getConfig(configName).then(
      (response) => {
        setConfig(response.data);
      },
      (error) => {
        console.error("Error fetching config:", error);
      }
    );
  };

  const updateConfig = () => {
    UserService.updateConfig(selectedConfig, config).then(
      () => {
        alert("Configuration updated successfully.");
      },
      (error) => {
        console.error("Error updating config:", error);
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
      current[path[path.length - 1]] = value;
      return newConfig;
    });
  };

  const renderConfigFields = (obj, path = []) => {
    return Object.keys(obj).map((key) => {
      const value = obj[key];
      const currentPath = [...path, key];
  
      if (typeof value === "object" && !Array.isArray(value)) {
        return (
          <div key={currentPath.join(".")} className="config-tile">
            <h5>{key}</h5>
            {renderConfigFields(value, currentPath)}
          </div>
        );
      } else if (Array.isArray(value)) {
        return (
          <div key={currentPath.join(".")} className="config-tile">
            <label>{key}</label>
            {value.map((item, index) => (
              <input
                key={index}
                type="text"
                className="form-control mb-2"
                value={item}
                onChange={(e) =>
                  handleConfigChange([...currentPath, index], e.target.value)
                }
              />
            ))}
          </div>
        );
      } else {
        return (
          <div key={currentPath.join(".")} className="form-group">
            <label htmlFor={currentPath.join(".")}>{key}:</label>
            <input
              type="text"
              className="form-control"
              id={currentPath.join(".")}
              value={value}
              onChange={(e) => handleConfigChange(currentPath, e.target.value)}
            />
          </div>
        );
      }
    });
  };

  const required = (value) => {
    if (!value) {
      return (
        <div className="alert alert-danger" role="alert">
          This field is required!
        </div>
      );
    }
  };
  
  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  const validateOrgName = (orgName) => {
    if (!orgName || !validCharsRegex.test(orgName)) {
      return false;
    }
    return true;
  };

  const validOrgName = (value) => {
    if (!value.match(/^[0-9a-zA-Z-._]+$/)) {
      return (
        <div className="alert alert-danger" role="alert">
          Invalid organization name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.
        </div>
      );
    }
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
    <div className="container mt-5">
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
      <div className="tab-content mt-4">
        {activeTab === "organizations" && (
          <div className="row">
            {organizations.map((org) => (
              <div className="col-md-6 mb-4" key={org.id}>
                <div className="card">
                  <div className="card-header d-flex justify-content-between align-items-center">
                    {editingOrgId === org.id ? (
                      <Form onSubmit={handleRenameOrganization}>
                        {renameMessage && (
                          <div className="alert alert-info mt-3 mb-3">
                            {renameMessage}
                          </div>
                        )}
                        <Input
                          type="text"
                          className="form-control"
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                          validations={[required, validOrgName]}
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
                      </Form>
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
                        onClick={() => handleDeleteOrganization(org.name)}
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
                            onClick={() => handleDeleteUser(user.id)}
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
            <ul className="nav nav-tabs">
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
            </ul>
            <div className="config-container">
              {renderConfigFields(config)}
            </div>
            <button
              type="button"
              className="btn btn-primary mt-3"
              onClick={updateConfig}
            >
              Update Configuration
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;