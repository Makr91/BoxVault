import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AuthService from "../services/auth.service";
import UserService from "../services/user.service";
import ServiceAccountService from "../services/service_account.service";
import ConfirmationModal from './confirmation.component';
import { FaEye, FaEyeSlash } from "react-icons/fa6";

const Profile = () => {
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
  const [newServiceAccountDescription, setNewServiceAccountDescription] = useState("");
  const [newServiceAccountExpiration, setNewServiceAccountExpiration] = useState(30);
  const [showPasswords, setShowPasswords] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const handleDeleteAccount = async () => {
    try {
      await UserService.deleteUser(currentUser.id);
      AuthService.logout();
      navigate("/login");
    } catch (error) {
      console.error("Error deleting account:", error);
      setMessage("Failed to delete account. Please try again.");
    }
  };

  const openDeleteModal = () => setShowDeleteModal(true);
  const closeDeleteModal = () => setShowDeleteModal(false);

  const refreshUserData = useCallback(() => {
    AuthService.refreshUserData().then(updatedUser => {
      if (updatedUser) {
        setCurrentUser(updatedUser);
      }
    });
  }, []);

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const checkEmailVerification = useCallback(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get('token');

    if (token) {
      AuthService.verifyMail(token)
        .then((response) => {
          setVerificationMessage(response.data.message);
          refreshUserData();
        })
        .catch((error) => {
          setVerificationMessage(error.response?.data?.message || "Failed to verify email. Please try again or contact support.");
        })
        .finally(() => {
          navigate("/profile", { replace: true });
        });
    }
  }, [location.search, navigate, refreshUserData]);

  useEffect(() => {
    checkEmailVerification();
  }, [checkEmailVerification]);

  useEffect(() => {
    if (currentUser) {
      const emailHash = currentUser.emailHash;
      if (emailHash) {
        AuthService.getGravatarProfile(emailHash).then((profile) => {
          if (profile) {
            setGravatarProfile(profile);
          }
        });
      }
      UserService.isOnlyUserInOrg(currentUser.organization).then(setIsOnlyUserInOrg);
    } else {
      navigate("/login");
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (activeTab === "serviceAccounts") {
      loadServiceAccounts();
    }
  }, [activeTab]);


  const loadServiceAccounts = () => {
    ServiceAccountService.getServiceAccounts()
      .then(response => setServiceAccounts(response.data))
      .catch(error => console.error("Error loading service accounts:", error));
  };

  const handleCreateServiceAccount = (e) => {
    e.preventDefault();
    ServiceAccountService.createServiceAccount(newServiceAccountDescription, newServiceAccountExpiration)
      .then(() => {
        loadServiceAccounts();
        setNewServiceAccountDescription("");
        setNewServiceAccountExpiration(30);
      })
      .catch(error => console.error("Error creating service account:", error));
  };

  const handleDeleteServiceAccount = (id) => {
    ServiceAccountService.deleteServiceAccount(id)
      .then(() => loadServiceAccounts())
      .catch(error => console.error("Error deleting service account:", error));
  };


  const handleResendVerificationMail = () => {
    setVerificationMessage("");
    AuthService.resendVerificationMail()
      .then((response) => {
        setVerificationMessage(response.data.message);
        refreshUserData();
      })
      .catch((error) => setVerificationMessage("Error sending verification email: " + error.message));
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    setMessage("");
    const errors = validatePasswordForm();
    setPasswordErrors(errors);
    if (Object.keys(errors).length === 0) {
      UserService.changePassword(currentUser.id, newPassword)
        .then(() => setMessage("Password changed successfully!"))
        .catch((error) => setMessage("Error changing password: " + error.message));
    }
  };

  const handleEmailChange = (e) => {
    e.preventDefault();
    setEmailMessage("");
    const errors = validateEmailForm();
    setEmailErrors(errors);
    if (Object.keys(errors).length === 0) {
      UserService.changeEmail(currentUser.id, newEmail)
        .then(() => {
          setEmailMessage("Email changed successfully!");
          refreshUserData();
        })
        .catch((error) => setEmailMessage("Error changing email: " + error.message));
    }
  };

  const handlePromoteToModerator = () => {
    UserService.promoteToModerator(currentUser.id)
      .then(() => {
        setMessage("Promoted to moderator successfully!");
        refreshUserData();
      })
      .catch((error) => setMessage("Error promoting to moderator: " + error.message));
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
            <h3 className="mt-3">{gravatarProfile.display_name || currentUser.username}</h3>
            <p className="text-muted">{gravatarProfile.job_title || "No Job Title"}</p>
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
                <button className="btn btn-link" onClick={handleResendVerificationMail}>
                  Resend verification email
                </button>
              </div>
            )}
            <ul className="nav nav-tabs">
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "profile" ? "active" : ""}`}
                  onClick={() => setActiveTab("profile")}
                >
                  Profile
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "security" ? "active" : ""}`}
                  onClick={() => setActiveTab("security")}
                >
                  Security
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "serviceAccounts" ? "active" : ""}`}
                  onClick={() => setActiveTab("serviceAccounts")}
                >
                  Service Accounts
                </button>
              </li>
            </ul>
            <div className="tab-content mt-3">
              {activeTab === "profile" && (
                <div className="tab-pane fade show active">
                  <p><strong>Full Name:</strong> {gravatarProfile.first_name} {gravatarProfile.last_name}</p>
                  <p><strong>Location:</strong> {gravatarProfile.location || "No Location"}</p>
                  <p><strong>Email:</strong> {currentUser.email}</p>
                  <p><strong>Organization:</strong> {currentUser.organization}</p>
                  <p><strong>Roles:</strong> {currentUser.roles.join(", ")}</p>
                  <p><strong>Profile URL:</strong> <a href={gravatarProfile.profile_url} target="_blank" rel="noopener noreferrer">{gravatarProfile.profile_url}</a></p>
                  <p><strong>Verified Accounts:</strong> {gravatarProfile.number_verified_accounts}</p>
                  <p><strong>Registration Date:</strong> {new Date(gravatarProfile.registration_date).toLocaleDateString()}</p>
                  <p><strong>Email Hash:</strong> {currentUser.emailHash}</p>
                  <p><strong>User ID:</strong> {currentUser.id}</p>
                  <p><strong>Access Token:</strong> {currentUser.accessToken.substring(0, 20)}...</p>
                </div>
              )}
              {activeTab === "security" && (
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
                        <div className="alert alert-danger">{passwordErrors.newPassword}</div>
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
                        <div className="alert alert-danger">{passwordErrors.confirmPassword}</div>
                      )}
                    </div>
                    <button className="btn btn-primary mb-3">
                      Change Password
                    </button>
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
                    <button className="btn btn-primary mb-3">
                      Change Email
                    </button>
                    {emailMessage && <p className="mt-3">{emailMessage}</p>}
                  </form>
                  {currentUser.roles.includes("ROLE_USER") && isOnlyUserInOrg && (
                    <div>
                      <button className="btn btn-primary" onClick={handlePromoteToModerator}>
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
              )}
              {activeTab === "serviceAccounts" && (
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
                        onChange={(e) => setNewServiceAccountExpiration(Number(e.target.value))}
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
                    {serviceAccounts.map(account => (
                      <li key={account.id} className="list-group-item">
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <strong>{account.username}</strong> - {account.description}
                            <br />
                            <small>Expires: {new Date(account.expiresAt).toLocaleDateString()}</small>
                          </div>
                          <div>
                            <button 
                              className="btn btn-outline-secondary btn-sm me-2" 
                              onClick={() => setShowPasswords(prev => ({...prev, [account.id]: !prev[account.id]}))}
                            >
                               {showPasswords[account.id] ? <FaEyeSlash /> : <FaEye />}
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteServiceAccount(account.id)}>Delete</button>
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
              )}
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


export default Profile;
