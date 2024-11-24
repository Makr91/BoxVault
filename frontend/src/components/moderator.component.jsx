import React, { useState, useEffect } from "react";
import UserService from "../services/user.service";
import OrganizationService from "../services/organization.service";
import AuthService from "../services/auth.service";
import InvitationService from "../services/invitation.service";
import ConfirmationModal from './confirmation.component';
import EventBus from "../common/EventBus";

const Moderator = ({ currentOrganization }) => {
  const [users, setUsers] = useState([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [updateMessage, setUpdateMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [invitationMessage, setInvitationMessage] = useState("");
  const [activeInvitations, setActiveInvitations] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [orgEmail, setOrgEmail] = useState("");
  const [orgEmailHash, setOrgEmailHash] = useState("");
  const [orgDescription, setOrgDescription] = useState("");

  useEffect(() => {
    if (currentOrganization) {
      OrganizationService.getOrganizationWithUsers(currentOrganization).then(
        (response) => {
          setUsers(response.data);
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

      // Fetch active invitations
      InvitationService.getActiveInvitations(currentOrganization)
        .then(response => {
          setActiveInvitations(response.data);
        })
        .catch(error => {
          console.error("Error fetching active invitations:", error);
          if (error.response && error.response.status === 401) {
            EventBus.dispatch("logout");
          }
        });

      // Fetch organization details
      OrganizationService.getOrganizationByName(currentOrganization)
        .then(response => {
          setNewOrgName(response.data.name);
          setOrgEmail(response.data.email || "");
          setOrgEmailHash(response.data.emailHash || "");
          setOrgDescription(response.data.description || "");
        })
        .catch(error => {
          console.error("Error fetching organization details:", error);
          if (error.response && error.response.status === 401) {
            EventBus.dispatch("logout");
          }
        });
    }
  }, [currentOrganization]);

  const handleUpdateOrganization = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!newOrgName.trim()) {
      setUpdateMessage('Organization name is required.');
      return;
    }
    if (!validateOrgName(newOrgName)) {
      setUpdateMessage('Invalid organization name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.');
      return;
    }
    if (!orgEmail.trim()) {
      setUpdateMessage('Organization email is required.');
      return;
    }
    // Add more validation as needed
  
    if (newOrgName !== currentOrganization) {
      const organizationExists = await checkOrganizationExists(newOrgName);
      if (organizationExists) {
        setUpdateMessage('An organization with this name already exists. Please choose a different name.');
        return;
      }
    }
  
    try {
      await OrganizationService.updateOrganization(currentOrganization, {
        organization: newOrgName,
        email: orgEmail,
        description: orgDescription
      });
      setUpdateMessage('Organization updated successfully!');
    } catch (error) {
      console.error('Error updating organization:', error);
      setUpdateMessage('Error updating organization. Please try again.');
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

  const handleSendInvitation = (e) => {
    e.preventDefault();
    AuthService.sendInvitation(email, currentOrganization)
      .then(response => {
        const invitationDetails = `Invitation sent! 
          Token: ${response.data.invitationToken}
          Expires: ${new Date(response.data.invitationTokenExpires).toLocaleString()}
          Organization ID: ${response.data.organizationId}
          Invitation Link: ${response.data.invitationLink}`;
        setInvitationMessage(invitationDetails);
        setEmail(""); // Clear the input field
      })
      .catch(error => {
        console.error("Error sending invitation:", error);
        setInvitationMessage("Error sending invitation. Please try again.");
      });
  };

  const handleDeleteClick = (invitation) => {
    setItemToDelete({ type: 'invitation', id: invitation.id });
    setShowDeleteModal(true);
  };
  
  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };
  
  const handleConfirmDelete = () => {
    if (itemToDelete && itemToDelete.type === 'invitation') {
      InvitationService.deleteInvitation(itemToDelete.id)
        .then(() => {
          setActiveInvitations(prevInvitations => 
            prevInvitations.filter(invitation => invitation.id !== itemToDelete.id)
          );
          handleCloseDeleteModal();
        })
        .catch(error => {
          console.error("Error deleting invitation:", error);
          handleCloseDeleteModal();
        });
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
    <div className="list row">
      <header>
        <h3 className="text-center">Moderator Panel</h3>
      </header>
      {loading ? (
        <p>Loading...</p>
      ) : (
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
                    <label htmlFor="orgEmailHash">Organization EmailHash</label>
                    <input
                      type="url"
                      className="form-control"
                      id="orgEmailHash"
                      value={orgEmailHash}
                      onChange={(e) => setOrgEmailHash(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="orgDescription">Organization Description</label>
                    <textarea
                      className="form-control"
                      id="orgDescription"
                      value={orgDescription}
                      onChange={(e) => setOrgDescription(e.target.value)}
                    />
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
          <div className="col-md-12 mb-4">
            <div className="card mt-2 mb-2">
              <div className="card-header">
                <h4>Send Invitation</h4>
              </div>
              <div className="card-body">
                <form onSubmit={handleSendInvitation}>
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
            </div>
          </div>
          <div className="col-md-12 mb-4">
            <div className="card mt-2 mb-2">
              <div className="card-header">
                <h4>Active Invitations</h4>
              </div>
              <div className="card-body">
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
                        <td>{new Date(invitation.expires).toLocaleString()}</td>
                        <td>{invitation.accepted ? 'Yes' : 'No'}</td>
                        <td>{invitation.expired ? 'Yes' : 'No'}</td>
                        <td>
                          <a 
                            href={`${window.location.origin}/register?token=${invitation.token}&organization=${currentOrganization}`} 
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
            </div>
          </div>
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

export default Moderator;