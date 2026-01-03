import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import { useLocation, useNavigate } from "react-router-dom";

import AuthService from "../services/auth.service";
import RequestService from "../services/request.service";
import ServiceAccountService from "../services/service_account.service";
import UserService from "../services/user.service";
import { log } from "../utils/Logger";

import ConfirmationModal from "./confirmation.component";

const Profile = ({ activeOrganization }) => {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = t("profile.pageTitle");
  }, [t]);

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
      setMessage(t("profile.messages.leftOrganization", { orgName }));

      // Refresh organizations list
      const response = await UserService.getUserOrganizations();
      setUserOrganizations(response.data || []);
    } catch (error) {
      log.api.error("Error leaving organization", {
        orgName,
        error: error.message,
      });
      setMessage(
        t("profile.errors.leaveOrganization", { error: error.message })
      );
    }
  };

  const handleCancelJoinRequest = async (requestId) => {
    try {
      await RequestService.cancelJoinRequest(requestId);
      setMessage(t("profile.messages.requestCancelled"));

      // Refresh join requests list
      const response = await RequestService.getUserJoinRequests();
      setJoinRequests(response.data || []);
    } catch (error) {
      log.api.error("Error cancelling join request", {
        requestId,
        error: error.message,
      });
      setMessage(
        t("profile.messages.cancelRequestError", { error: error.message })
      );
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
      errors.newPassword = t("errors.fieldRequired", { ns: "auth" });
    } else if (newPassword.length < 6 || newPassword.length > 40) {
      errors.newPassword = t("errors.passwordLength", { ns: "auth" });
    }
    if (!confirmPassword) {
      errors.confirmPassword = t("errors.fieldRequired", { ns: "auth" });
    } else if (confirmPassword !== newPassword) {
      errors.confirmPassword = t("profile.errors.passwordsDoNotMatch");
    }
    return errors;
  };

  const validateEmailForm = () => {
    const errors = {};
    if (!newEmail) {
      errors.newEmail = t("errors.fieldRequired", { ns: "auth" });
    } else if (!isValidEmail(newEmail)) {
      errors.newEmail = t("errors.invalidEmail", { ns: "auth" });
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
      setMessage(t("profile.errors.deleteAccountFailed"));
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
              t("profile.errors.verificationFailed")
          );
        })
        .finally(() => {
          navigate("/profile", { replace: true });
        });
    }
  }, [location.search, navigate, refreshUserData, t]);

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
        setMessage(t("profile.errors.activeOrgNotFound"));
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
      setMessage(t("profile.messages.serviceAccountCreated"));
    } catch (error) {
      if (
        !error.message?.includes("aborted") &&
        !error.name?.includes("Cancel")
      ) {
        log.api.error("Error creating service account", {
          error: error.message,
        });
        setMessage(
          t("profile.errors.createServiceAccountFailed", {
            error: error.response?.data?.message || error.message,
          })
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
          t("profile.errors.resendVerificationFailed", { error: error.message })
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
        setMessage(t("profile.messages.passwordChanged"));
      } catch (error) {
        if (!error.name?.includes("Cancel")) {
          setMessage(
            t("profile.errors.changePasswordFailed", { error: error.message })
          );
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
        setEmailMessage(t("profile.messages.emailChanged"));
        await refreshUserData();
      } catch (error) {
        if (!error.name?.includes("Cancel")) {
          setEmailMessage(
            t("profile.errors.changeEmailFailed", { error: error.message })
          );
        }
      }
    }
    controller.abort();
  };

  const handlePromoteToModerator = () => {
    UserService.promoteToModerator(currentUser.id)
      .then(() => {
        setMessage(t("profile.messages.promotedToModerator"));
        refreshUserData();
      })
      .catch((error) =>
        setMessage(
          t("profile.errors.promoteToModeratorFailed", { error: error.message })
        )
      );
  };

  const renderProfileTab = () => (
    <div className="tab-pane fade show active">
      <p>
        <strong>{t("profile.fields.fullName")}:</strong>{" "}
        {gravatarProfile.first_name} {gravatarProfile.last_name}
      </p>
      <p>
        <strong>{t("profile.fields.location")}:</strong>{" "}
        {gravatarProfile.location || t("profile.noLocation")}
      </p>
      <p>
        <strong>{t("profile.fields.email")}:</strong> {currentUser.email}
      </p>
      <p>
        <strong>{t("profile.fields.organization")}:</strong>{" "}
        {currentUser.organization}
      </p>
      <p>
        <strong>{t("profile.fields.roles")}:</strong>{" "}
        {currentUser.roles
          ? currentUser.roles.join(", ")
          : t("profile.noRoles")}
      </p>
      <p>
        <strong>{t("profile.fields.profileUrl")}:</strong>{" "}
        <a
          href={gravatarProfile.profile_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {gravatarProfile.profile_url}
        </a>
      </p>
      <p>
        <strong>{t("profile.fields.verifiedAccounts")}:</strong>{" "}
        {gravatarProfile.number_verified_accounts}
      </p>
      <p>
        <strong>{t("profile.fields.registrationDate")}:</strong>{" "}
        {new Date(gravatarProfile.registration_date).toLocaleDateString()}
      </p>
      <p>
        <strong>{t("profile.fields.emailHash")}:</strong>{" "}
        {currentUser.emailHash}
      </p>
      <p>
        <strong>{t("profile.fields.userId")}:</strong> {currentUser.id}
      </p>
      <p>
        <strong>{t("profile.fields.accessToken")}:</strong>{" "}
        {currentUser.accessToken.substring(0, 20)}...
      </p>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="tab-pane fade show active">
      <form onSubmit={handlePasswordChange}>
        <h5>{t("profile.security.changePassword.title")}</h5>
        <div className="form-group col-md-3 mb-3">
          <input
            type="password"
            className="form-control"
            placeholder={t(
              "profile.security.changePassword.newPasswordPlaceholder"
            )}
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
            placeholder={t(
              "profile.security.changePassword.confirmPasswordPlaceholder"
            )}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {passwordErrors.confirmPassword && (
            <div className="alert alert-danger">
              {passwordErrors.confirmPassword}
            </div>
          )}
        </div>
        <button className="btn btn-primary mb-3">
          {t("profile.security.changePassword.button")}
        </button>
        {message && <p className="mt-3">{message}</p>}
      </form>
      <form onSubmit={handleEmailChange} noValidate>
        <h5>{t("profile.security.changeEmail.title")}</h5>
        <div className="form-group col-md-3 mb-3">
          <input
            type="email"
            className="form-control"
            placeholder={t("profile.security.changeEmail.newEmailPlaceholder")}
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          {emailErrors.newEmail && (
            <div className="alert alert-danger">{emailErrors.newEmail}</div>
          )}
        </div>
        <button className="btn btn-primary mb-3">
          {t("profile.security.changeEmail.button")}
        </button>
        {emailMessage && <p className="mt-3">{emailMessage}</p>}
      </form>
      {currentUser.roles.includes("ROLE_USER") && isOnlyUserInOrg && (
        <div>
          <button
            className="btn btn-primary"
            onClick={handlePromoteToModerator}
          >
            {t("profile.security.promoteToModerator")}
          </button>
        </div>
      )}
      <div className="mt-3">
        <h4>{t("profile.security.deleteAccount.title")}</h4>
        <p>{t("profile.security.deleteAccount.warning")}</p>
        <button className="btn btn-danger" onClick={openDeleteModal}>
          {t("profile.security.deleteAccount.button")}
        </button>
      </div>
    </div>
  );

  const renderOrganizationsTab = () => (
    <div className="tab-pane fade show active">
      <h3>{t("profile.organizations.title")}</h3>

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
              <h5>{t("profile.organizations.belongToTitle")}</h5>
            </div>
            <div className="card-body">
              {userOrganizations.length === 0 ? (
                <div className="alert alert-info">
                  {t("profile.organizations.noOrgs")}
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
                                  {t("profile.organizations.primary")}
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
                                {t("profile.organizations.joined")}:{" "}
                                {new Date(org.joinedAt).toLocaleDateString()}
                              </small>
                            </div>
                          </div>
                        </div>
                        <div className="d-flex align-items-center">
                          <span
                            className={`badge ${getRoleBadgeClass(org.role)} me-3`}
                          >
                            {t(`roles.${org.role}`)}
                          </span>
                          {userOrganizations.length > 1 && (
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleLeaveOrganization(org.name)}
                            >
                              {t("buttons.leave")}
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
                <h5>{t("profile.organizations.pendingRequestsTitle")}</h5>
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
                            {t("profile.organizations.requested")}:{" "}
                            {new Date(request.created_at).toLocaleDateString()}
                          </small>
                        </div>
                        <div>
                          <span className="badge bg-warning me-3">
                            {t("status.pending")}
                          </span>
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => handleCancelJoinRequest(request.id)}
                          >
                            {t("buttons.cancel")}
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
      <h3>{t("profile.serviceAccounts.title")}</h3>
      <form onSubmit={handleCreateServiceAccount}>
        <div className="form-group col-md-3 mb-3">
          <input
            type="text"
            className="form-control"
            placeholder={t("profile.serviceAccounts.descriptionPlaceholder")}
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
            <option value={30}>
              {t("profile.serviceAccounts.expiration.30")}
            </option>
            <option value={60}>
              {t("profile.serviceAccounts.expiration.60")}
            </option>
            <option value={90}>
              {t("profile.serviceAccounts.expiration.90")}
            </option>
            <option value={365}>
              {t("profile.serviceAccounts.expiration.365")}
            </option>
          </select>
        </div>
        <button className="btn btn-primary mb-3" type="submit">
          {t("profile.serviceAccounts.createButton")}
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
                  {t("profile.serviceAccounts.organization")}:{" "}
                  {account.organization?.name || t("unknown")}
                </small>
                <br />
                <small>
                  {t("profile.serviceAccounts.expires")}:{" "}
                  {new Date(account.expiresAt).toLocaleDateString()}
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
                  {t("buttons.delete")}
                </button>
              </div>
            </div>
            {showPasswords[account.id] && (
              <div className="mt-2">
                <strong>{t("profile.serviceAccounts.token")}:</strong>{" "}
                {account.token}
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
              {gravatarProfile.job_title || t("profile.noJobTitle")}
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
                {t("profile.messages.emailNotVerified")}
                <button
                  className="btn btn-link"
                  onClick={handleResendVerificationMail}
                >
                  {t("profile.buttons.resendVerification")}
                </button>
              </div>
            )}
            <ul className="nav nav-tabs">
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "profile" ? "active" : ""}`}
                  onClick={() => handleTabChange("profile")}
                >
                  {t("profile.tabs.profile")}
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "organizations" ? "active" : ""}`}
                  onClick={() => handleTabChange("organizations")}
                >
                  {t("profile.tabs.organizations")}
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "security" ? "active" : ""}`}
                  onClick={() => handleTabChange("security")}
                >
                  {t("profile.tabs.security")}
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === "serviceAccounts" ? "active" : ""}`}
                  onClick={() => handleTabChange("serviceAccounts")}
                >
                  {t("profile.tabs.serviceAccounts")}
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
        title={t("profile.deleteModal.title")}
        message={t("profile.deleteModal.message")}
      />
    </div>
  );
};

Profile.propTypes = {
  activeOrganization: PropTypes.string,
};

export default Profile;
