import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import { useLocation, useNavigate } from "react-router-dom";

import AuthService from "../services/auth.service";
import RequestService from "../services/request.service";
import ServiceAccountService from "../services/service_account.service";
import UserService from "../services/user.service";
import { log } from "../utils/Logger";

import ConfirmationModal from "./confirmation.component";

const Profile = ({ activeOrganization }) => {
  useEffect(() => {
    document.title = "Profile";
  }, []);

  const [currentUser, setCurrentUser] = useState(AuthService.getCurrentUser());
  const [gravatarProfile, setGravatarProfile] = useState({});
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [activeTab, setActiveTab] = useState("profile");
  const [passwordErrors, setPasswordErrors] = useState({});
  const [emailErrors, setEmailErrors] = useState({});
  const [isOnlyUserInOrg, setIsOnlyUserInOrg] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [serviceAccounts, setServiceAccounts] = useState([]);
  const [newServiceAccountDescription, setNewServiceAccountDescription] =
    useState("");
  const [newServiceAccountExpiration, setNewServiceAccountExpiration] =
    useState(30);
  const [showPasswords, setShowPasswords] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userOrganizations, setUserOrganizations] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const handleLeaveOrganization = async (orgName) => {
    try {
      await UserService.leaveOrganization(orgName);
      setMessage(`Successfully left organization ${orgName}`);

      // Refresh organizations list
      const response = await UserService.getUserOrganizations();
      setUserOrganizations(response.data || []);
    } catch (error) {
      log.api.error("Error leaving organization", {
        orgName,
        error: error.message,
      });
      setMessage(`Error leaving organization: ${error.message}`);
    }
  };

  const handleCancelJoinRequest = async (requestId) => {
    try {
      await RequestService.cancelJoinRequest(requestId);
      setMessage("Join request cancelled successfully");

      // Refresh join requests list
      const response = await RequestService.getUserJoinRequests();
      setJoinRequests(response.data || []);
    } catch (error) {
      log.api.error("Error cancelling join request", {
        requestId,
        error: error.message,
      });
      setMessage(`Error cancelling request: ${error.message}`);
    }
  };

  const getRoleBadgeClass = (role) => {
    if (role === "admin") {
      return "bg-danger";
    }
    if (role === "moderator") {
      return "bg-warning";
    }
    return "bg-secondary";
  };

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePasswordForm = () => {
    const errors = {};
    if (!newPassword) {
      errors.newPassword = "This field is required!";
    } else if (newPassword.length < 6 || newPassword.length > 40) {
      errors.newPassword = "The password must be between 6 and 40 characters.";
    }
    if (!confirmPassword) {
      errors.confirmPassword = "This field is required!";
    } else if (confirmPassword !== newPassword) {
      errors.confirmPassword = "Passwords do not match!";
    }
    return errors;
  };

  const validateEmailForm = () => {
    const errors = {};
    if (!newEmail) {
      errors.newEmail = "This field is required!";
    } else if (!isValidEmail(newEmail)) {
      errors.newEmail = "This is not a valid email.";
    }
    return errors;
  };

  const resetFormStates = useCallback(() => {
    setMessage("");
    setEmailMessage("");
    setPasswordErrors({});
    setEmailErrors({});
    setNewPassword("");
    setConfirmPassword("");
    setNewEmail("");
  }, []);

  const resetServiceAccountStates = useCallback(() => {
    setMessage("");
    setShowPasswords({});
    setNewServiceAccountDescription("");
    setNewServiceAccountExpiration(30);
  }, []);

  const handleTabChange = useCallback(
    (tab) => {
      if (tab === "serviceAccounts") {
        resetServiceAccountStates();
      } else {
        resetFormStates();
      }
      setActiveTab(tab);
    },
    [resetFormStates, resetServiceAccountStates]
  );

  const handleDeleteAccount = async () => {
    try {
      await UserService.deleteUser(currentUser.id);
      AuthService.logout();
      navigate("/login");
    } catch (error) {
      log.auth.error("Error deleting account", {
        userId: currentUser.id,
        error: error.message,
      });
      setMessage("Failed to delete account. Please try again.");
    }
  };

  const openDeleteModal = () => setShowDeleteModal(true);
  const closeDeleteModal = () => setShowDeleteModal(false);

  const refreshUserData = useCallback(() => {
    AuthService.refreshUserData().then((updatedUser) => {
      if (updatedUser) {
        setCurrentUser(updatedUser);
      }
    });
  }, []);

  const checkEmailVerification = useCallback(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get("token");

    if (token) {
      AuthService.verifyMail(token)
        .then((response) => {
          setVerificationMessage(response.data.message);
          refreshUserData();
        })
        .catch((error) => {
          setVerificationMessage(
            error.response?.data?.message ||
              "Failed to verify email. Please try again or contact support."
          );
        })
        .finally(() => {
          navigate("/profile", { replace: true });
        });
    }
  }, [location.search, navigate, refreshUserData]);

  useEffect(() => {
    checkEmailVerification();
  }, [checkEmailVerification]);

  const loadGravatarProfile = useCallback(async (emailHash, signal) => {
    try {
      const profile = await AuthService.getGravatarProfile(emailHash, signal);
      if (profile) {
        setGravatarProfile(profile);
      }
    } catch (error) {
      if (!error.name?.includes("Cancel") && !error.name?.includes("Abort")) {
        log.api.error("Error loading Gravatar profile", {
          emailHash,
          error: error.message,
        });
      }
    }
  }, []);

  const checkOrganizationStatus = useCallback(async (organizationName) => {
    try {
      const isOnly = await UserService.isOnlyUserInOrg(organizationName);
      setIsOnlyUserInOrg(isOnly);
    } catch (error) {
      if (!error.name?.includes("Cancel") && !error.name?.includes("Abort")) {
        log.api.error("Error checking organization status", {
          organizationName,
          error: error.message,
        });
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const loadUserData = async () => {
      if (currentUser) {
        const { emailHash } = currentUser;
        if (emailHash && mounted) {
          await loadGravatarProfile(emailHash, controller.signal);
        }

        if (mounted) {
          await checkOrganizationStatus(currentUser.organization);
        }
      } else {
        navigate("/login");
      }
    };

    loadUserData();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [currentUser, navigate, loadGravatarProfile, checkOrganizationStatus]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const loadData = async () => {
      if (activeTab === "serviceAccounts") {
        try {
          const response = await ServiceAccountService.getServiceAccounts(
            controller.signal
          );
          if (mounted) {
            setServiceAccounts(response.data);
          }
        } catch (error) {
          if (
            mounted &&
            !error.message?.includes("aborted") &&
            !error.name?.includes("Cancel")
          ) {
            log.api.error("Error loading service accounts", {
              error: error.message,
            });
          }
        }
      } else if (activeTab === "organizations") {
        setOrganizationsLoading(true);
        try {
          const [orgsResponse, requestsResponse] = await Promise.all([
            UserService.getUserOrganizations(),
            RequestService.getUserJoinRequests(),
          ]);
          if (mounted) {
            setUserOrganizations(orgsResponse.data || []);
            setJoinRequests(requestsResponse.data || []);
          }
        } catch (error) {
          if (
            mounted &&
            !error.message?.includes("aborted") &&
            !error.name?.includes("Cancel")
          ) {
            log.api.error("Error loading organizations", {
              error: error.message,
            });
          }
        } finally {
          if (mounted) {
            setOrganizationsLoading(false);
          }
        }
      }
    };

    if (activeTab === "serviceAccounts" || activeTab === "organizations") {
      loadData();
    }

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [activeTab]);

  const loadServiceAccounts = async (signal) => {
    try {
      const response = await ServiceAccountService.getServiceAccounts(signal);
      setServiceAccounts(response.data);
    } catch (error) {
      if (
        !error.message?.includes("aborted") &&
        !error.name?.includes("Cancel")
      ) {
        log.api.error("Error loading service accounts", {
          error: error.message,
        });
      }
    }
  };

  const handleCreateServiceAccount = async (e) => {
    e.preventDefault();
    const controller = new AbortController();
    try {
      // Get active organization's ID
      const orgsResponse = await UserService.getUserOrganizations();
      const activeOrg = orgsResponse.data?.find(
        (org) => org.name === activeOrganization
      );

      if (!activeOrg) {
        setMessage("Error: Could not find active organization");
        return;
      }

      await ServiceAccountService.createServiceAccount(
        newServiceAccountDescription,
        newServiceAccountExpiration,
        activeOrg.id
      );
      await loadServiceAccounts(controller.signal);
      setNewServiceAccountDescription("");
      setNewServiceAccountExpiration(30);
      setMessage("Service account created successfully!");
    } catch (error) {
      if (
        !error.message?.includes("aborted") &&
        !error.name?.includes("Cancel")
      ) {
        log.api.error("Error creating service account", {
          error: error.message,
        });
        setMessage(
          `Error creating service account: ${error.response?.data?.message || error.message}`
        );
      }
    }
    controller.abort();
  };

  const handleDeleteServiceAccount = async (id) => {
    const controller = new AbortController();
    try {
      await ServiceAccountService.deleteServiceAccount(id);
      await loadServiceAccounts(controller.signal);
    } catch (error) {
      if (
        !error.message?.includes("aborted") &&
        !error.name?.includes("Cancel")
      ) {
        log.api.error("Error deleting service account", {
          serviceAccountId: id,
          error: error.message,
        });
      }
    }
    controller.abort();
  };

  const handleResendVerificationMail = async () => {
    const controller = new AbortController();
    setVerificationMessage("");
    try {
      const response = await AuthService.resendVerificationMail(
        controller.signal
      );
      setVerificationMessage(response.data.message);
      await refreshUserData();
    } catch (error) {
      if (!error.name?.includes("Cancel")) {
        setVerificationMessage(
          `Error sending verification email: ${error.message}`
        );
      }
    }
    controller.abort();
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    const controller = new AbortController();
    setMessage("");
    const errors = validatePasswordForm();
    setPasswordErrors(errors);
    if (Object.keys(errors).length === 0) {
      try {
        await UserService.changePassword(
          currentUser.id,
          newPassword,
          controller.signal
        );
        setMessage("Password changed successfully!");
      } catch (error) {
        if (!error.name?.includes("Cancel")) {
          setMessage(`Error changing password: ${error.message}`);
        }
      }
    }
    controller.abort();
  };

  const handleEmailChange = async (e) => {
    e.preventDefault();
    const controller = new AbortController();
    setEmailMessage("");
    const errors = validateEmailForm();
    setEmailErrors(errors);
    if (Object.keys(errors).length === 0) {
      try {
        await UserService.changeEmail(
          currentUser.id,
          newEmail,
          controller.signal
        );
        setEmailMessage("Email changed successfully!");
        await refreshUserData();
      } catch (error) {
        if (!error.name?.includes("Cancel")) {
          setEmailMessage(`Error changing email: ${error.message}`);
        }
      }
    }
    controller.abort();
  };

  const handlePromoteToModerator = () => {
    UserService.promoteToModerator(currentUser.id)
      .then(() => {
        setMessage("Promoted to moderator successfully!");
        refreshUserData();
      })
      .catch((error) =>
        setMessage(`Error promoting to moderator: ${error.message}`)
      );
  };

  const renderProfileTab = () => (
    <div className="tab-pane fade show active">
      <p>
        <strong>Full Name:</strong> {gravatarProfile.first_name}{" "}
        {gravatarProfile.last_name}
      </p>
      <p>
        <strong>Location:</strong> {gravatarProfile.location || "No Location"}
      </p>
      <p>
        <strong>Email:</strong> {currentUser.email}
      </p>
      <p>
        <strong>Organization:</strong> {currentUser.organization}
      </p>
      <p>
        <strong>Roles:</strong>{" "}
        {currentUser.roles ? currentUser.roles.join(", ") : "No roles assigned"}
      </p>
      <p>
        <strong>Profile URL:</strong>{" "}
        <a
          href={gravatarProfile.profile_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {gravatarProfile.profile_url}
        </a>
      </p>
      <p>
        <strong>Verified Accounts:</strong>{" "}
        {gravatarProfile.number_verified_accounts}
      </p>
      <p>
        <strong>Registration Date:</strong>{" "}
        {new Date(gravatarProfile.registration_date).toLocaleDateString()}
      </p>
      <p>
        <strong>Email Hash:</strong> {currentUser.emailHash}
      </p>
      <p>
        <strong>User ID:</strong> {currentUser.id}
      </p>
      <p>
        <strong>Access Token:</strong>{" "}
        {currentUser.accessToken.substring(0, 20)}...
      </p>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="tab-pane fade show active">
      <form onSubmit={handlePasswordChange}>
        <h5>Change Password</h5>
        <div className="form-group col-md-3 mb-3">
          <input
            type="password"
            className="form-control"
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {passwordErrors.newPassword && (
            <div className="alert alert-danger">
              {passwordErrors.newPassword}
            </div>
          )}
        </div>
        <div className="form-group col-md-3 mb-3">
          <input
            type="password"
            className="form-control"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {passwordErrors.confirmPassword && (
            <div className="alert alert-danger">
              {passwordErrors.confirmPassword}
            </div>
          )}
        </div>
        <button className="btn btn-primary mb-3">Change Password</button>
        {message && <p className="mt-3">{message}</p>}
      </form>
      <form onSubmit={handleEmailChange} noValidate>
        <h5>Change Email</h5>
        <div className="form-group col-md-3 mb-3">
          <input
            type="email"
            className="form-control"
            placeholder="New Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          {emailErrors.newEmail && (
            <div className="alert alert-danger">{emailErrors.newEmail}</div>
          )}
        </div>
        <button className="btn btn-primary mb-3">Change Email</button>
        {emailMessage && <p className="mt-3">{emailMessage}</p>}
      </form>
      {currentUser.roles.includes("ROLE_USER") && isOnlyUserInOrg && (
        <div>
          <button
            className="btn btn-primary"
            onClick={handlePromoteToModerator}
          >
            Promote to Moderator
          </button>
        </div>
      )}
      <div className="mt-3">
        <h4>Delete Account</h4>
        <p>Warning: This action cannot be undone.</p>
        <button className="btn btn-danger" onClick={openDeleteModal}>
          Delete My Account
        </button>
      </div>
    </div>
  );

  const renderOrganizationsTab = () => (
    <div className="tab-pane fade show active">
      <h3>My Organizations</h3>

      {organizationsLoading ? (
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : (
        <>
          <div className="card mb-4">
            <div className="card-header">
              <h5>Organizations You Belong To</h5>
            </div>
            <div className="card-body">
              {userOrganizations.length === 0 ? (
                <div className="alert alert-info">
                  You don&apos;t belong to any organizations yet.
                </div>
              ) : (
                <ul className="list-group">
                  {userOrganizations.map((org) => (
                    <li key={org.id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <div className="d-flex align-items-center">
                            <div>
                              <strong>{org.name}</strong>
                              {org.isPrimary && (
                                <span className="badge bg-primary ms-2">
                                  Primary
                                </span>
                              )}
                              <br />
                              {org.description && (
                                <small className="text-muted">
                                  {org.description}
                                </small>
                              )}
                              <br />
                              <small className="text-muted">
                                Joined:{" "}
                                {new Date(org.joinedAt).toLocaleDateString()}
                              </small>
                            </div>
                          </div>
                        </div>
                        <div className="d-flex align-items-center">
                          <span
                            className={`badge ${getRoleBadgeClass(org.role)} me-3`}
                          >
                            {org.role}
                          </span>
                          {userOrganizations.length > 1 && (
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleLeaveOrganization(org.name)}
                            >
                              Leave
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {joinRequests.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h5>Pending Join Requests</h5>
              </div>
              <div className="card-body">
                <ul className="list-group">
                  {joinRequests.map((request) => (
                    <li key={request.id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <strong>{request.organization.name}</strong>
                          <br />
                          {request.organization.description && (
                            <small className="text-muted">
                              {request.organization.description}
                            </small>
                          )}
                          <br />
                          <small className="text-muted">
                            Requested:{" "}
                            {new Date(request.created_at).toLocaleDateString()}
                          </small>
                        </div>
                        <div>
                          <span className="badge bg-warning me-3">Pending</span>
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => handleCancelJoinRequest(request.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderServiceAccountsTab = () => (
    <div className="tab-pane fade show active">
      <h3>Service Accounts</h3>
      <form onSubmit={handleCreateServiceAccount}>
        <div className="form-group col-md-3 mb-3">
          <input
            type="text"
            className="form-control"
            placeholder="Description"
            value={newServiceAccountDescription}
            onChange={(e) => setNewServiceAccountDescription(e.target.value)}
            required
          />
        </div>
        <div className="form-group col-md-3 mb-3">
          <select
            className="form-control"
            value={newServiceAccountExpiration}
            onChange={(e) =>
              setNewServiceAccountExpiration(Number(e.target.value))
            }
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={365}>365 days</option>
          </select>
        </div>
        <button className="btn btn-primary mb-3" type="submit">
          Create Service Account
        </button>
      </form>
      <ul className="list-group">
        {serviceAccounts.map((account) => (
          <li key={account.id} className="list-group-item">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <strong>{account.username}</strong> - {account.description}
                <br />
                <small>
                  Expires: {new Date(account.expiresAt).toLocaleDateString()}
                </small>
              </div>
              <div>
                <button
                  className="btn btn-outline-secondary btn-sm me-2"
                  onClick={() =>
                    setShowPasswords((prev) => ({
                      ...prev,
                      [account.id]: !prev[account.id],
                    }))
                  }
                >
                  {showPasswords[account.id] ? <FaEyeSlash /> : <FaEye />}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDeleteServiceAccount(account.id)}
                >
                  Delete
                </button>
              </div>
            </div>
            {showPasswords[account.id] && (
              <div className="mt-2">
                <strong>Token:</strong> {account.token}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="list row">
      {currentUser && (
        <div className="card mt-2 mb-2">
          <div className="card-header text-center">
            <img
              src={gravatarProfile.avatar_url || ""}
              alt="User Avatar"
              className="rounded-circle"
              width="100"
              height="100"
            />
            <h3 className="mt-3">
              {gravatarProfile.display_name || currentUser.username}
            </h3>
            <p className="text-muted">
              {gravatarProfile.job_title || "No Job Title"}
            </p>
          </div>
          <div className="card-body">
            {verificationMessage && (
              <div className="alert alert-info" role="alert">
                {verificationMessage}
              </div>
            )}
            {!currentUser.verified && (
              <div className="alert alert-warning" role="alert">
                Your email is not verified.
                <button
                  className="btn btn-link"
                  onClick={handleResendVerificationMail}
                >
                  Resend verification email
                </button>
              </div>
            )}
            <ul className="nav nav-tabs">
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "profile" ? "active" : ""}`}
                  onClick={() => handleTabChange("profile")}
                >
                  Profile
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "organizations" ? "active" : ""}`}
                  onClick={() => handleTabChange("organizations")}
                >
                  Organizations
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "security" ? "active" : ""}`}
                  onClick={() => handleTabChange("security")}
                >
                  Security
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "serviceAccounts" ? "active" : ""}`}
                  onClick={() => handleTabChange("serviceAccounts")}
                >
                  Service Accounts
                </button>
              </li>
            </ul>
            <div className="tab-content mt-3">
              {activeTab === "profile" && renderProfileTab()}
              {activeTab === "organizations" && renderOrganizationsTab()}
              {activeTab === "security" && renderSecurityTab()}
              {activeTab === "serviceAccounts" && renderServiceAccountsTab()}
            </div>
          </div>
        </div>
      )}
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={closeDeleteModal}
        handleConfirm={handleDeleteAccount}
        title="Delete Account"
        message="Are you sure you want to delete your account? This action cannot be undone."
      />
    </div>
  );
};

Profile.propTypes = {
  activeOrganization: PropTypes.string,
};

export default Profile;
