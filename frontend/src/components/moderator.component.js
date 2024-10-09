import React, { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
import UserService from "../services/user.service";
import OrganizationService from "../services/organization.service";
import EventBus from "../common/EventBus";
import Form from "react-validation/build/form";
import Input from "react-validation/build/input";

const Moderator = ({ currentOrganization }) => {
  const [users, setUsers] = useState([]);
  const [editingOrgId, setEditingOrgId] = useState(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [oldName, setOldName] = useState("");
  const [renameMessage, setRenameMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentOrganization) {
      console.log('Fetching data for organization:', currentOrganization);
      OrganizationService.getOrganizationWithUsers(currentOrganization).then(
        (response) => {
          console.log('API response:', response.data);
          setUsers(response.data); // Set the users directly
          setLoading(false);
        },
        (error) => {
          console.error("Error fetching organization data:", error);
          if (error.response && error.response.status === 401) {
            EventBus.dispatch("logout");
          }
          setLoading(false);
        }
      );
    }
  }, [currentOrganization]);

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
      setEditingOrgId(null);
      setNewOrgName('');
      setOldName('');
      setRenameMessage('Organization renamed successfully!');
    } catch (error) {
      console.error('Error renaming organization:', error);
      setRenameMessage('Error renaming organization. Please try again.');
    }
  };

  const validateOrgName = (orgName) => {
    const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
    return orgName && validCharsRegex.test(orgName);
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

  return (
    <div className="container mt-5">
      <header>
        <h3 className="text-center">Moderator Panel</h3>
      </header>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="row">
          <div className="col-md-12 mb-4">
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                {editingOrgId ? (
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
                  <h4>Users in {currentOrganization}</h4>
                )}
                <button
                  className="btn btn-primary btn-sm me-2"
                  onClick={() => {
                    setEditingOrgId(true);
                    setNewOrgName(currentOrganization);
                    setOldName(currentOrganization);
                  }}
                >
                  Rename
                </button>
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
                        {user.roles && user.roles.map((role, index) => (
                          <li key={index}>{role}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                    {user.roles && !user.roles.some((role) => role === "admin") && (
                      user.roles.some((role) => role === "moderator") ? (
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
                  </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Moderator;