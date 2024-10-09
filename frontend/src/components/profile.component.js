import React, { useState, useEffect, useRef } from "react";
import Form from "react-validation/build/form";
import Input from "react-validation/build/input";
import CheckButton from "react-validation/build/button";
import { isEmail } from "validator";
import AuthService from "../services/auth.service";
import UserService from "../services/user.service";

// Validation functions
const required = (value) => {
  if (!value) {
    return (
      <div className="alert alert-danger" role="alert">
        This field is required!
      </div>
    );
  }
};

const validEmail = (value) => {
  if (!isEmail(value)) {
    return (
      <div className="alert alert-danger" role="alert">
        This is not a valid email.
      </div>
    );
  }
};

const vpassword = (value) => {
  if (value.length < 6 || value.length > 40) {
    return (
      <div className="alert alert-danger" role="alert">
        The password must be between 6 and 40 characters.
      </div>
    );
  }
};

const Profile = () => {
  const [currentUser, setCurrentUser] = useState(undefined);
  const [gravatarProfile, setGravatarProfile] = useState({});
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [activeTab, setActiveTab] = useState("profile");

  const passwordForm = useRef();
  const passwordCheckBtn = useRef();
  const emailForm = useRef();
  const emailCheckBtn = useRef();

  useEffect(() => {
    const user = AuthService.getCurrentUser();

    if (user) {
      setCurrentUser(user);
      const emailHash = user.emailHash;
      if (emailHash) {
        AuthService.getGravatarProfile(emailHash).then((profile) => {
          if (profile) {
            setGravatarProfile(profile);
          }
        });
      }
    }
  }, []);

  const handlePasswordChange = (e) => {
    e.preventDefault();

    setMessage("");

    passwordForm.current.validateAll();

    if (passwordCheckBtn.current.context._errors.length === 0) {
      if (newPassword !== confirmPassword) {
        setMessage("Passwords do not match!");
        return;
      }

      UserService.changePassword(currentUser.id, newPassword)
        .then(() => {
          setMessage("Password changed successfully!");
        })
        .catch((error) => {
          setMessage("Error changing password: " + error.message);
        });
    }
  };

  const handleEmailChange = (e) => {
    e.preventDefault();

    setEmailMessage("");

    emailForm.current.validateAll();

    if (emailCheckBtn.current.context._errors.length === 0) {
      UserService.changeEmail(currentUser.id, newEmail)
        .then(() => {
          setEmailMessage("Email changed successfully!");
        })
        .catch((error) => {
          setEmailMessage("Error changing email: " + error.message);
        });
    }
  };

  const handlePromoteToModerator = () => {
    UserService.promoteToModerator(currentUser.id)
      .then(() => {
        setMessage("Promoted to moderator successfully!");
        // Refresh user data or roles
      })
      .catch((error) => {
        setMessage("Error promoting to moderator: " + error.message);
      });
  };

  return (
    <div className="container mt-5">
      {currentUser && (
        <div className="card">
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
                  <Form onSubmit={handlePasswordChange} ref={passwordForm}>
                    <h5>Change Password</h5>
                    <div className="form-group mb-3">
                      <Input
                        type="password"
                        className="form-control input-small"
                        placeholder="New Password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        validations={[required, vpassword]}
                      />
                    </div>
                    <div className="form-group mb-3">
                      <Input
                        type="password"
                        className="form-control input-small"
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        validations={[required, vpassword]}
                      />
                    </div>
                    <button className="btn btn-primary mb-3">
                      Change Password
                    </button>
                    {message && <p className="mt-3">{message}</p>}
                    <CheckButton style={{ display: "none" }} ref={passwordCheckBtn} />
                  </Form>
                  <Form onSubmit={handleEmailChange} ref={emailForm}>
                    <h5>Change Email</h5>
                    <div className="form-group mb-3">
                      <Input
                        type="email"
                        className="form-control input-small"
                        placeholder="New Email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        validations={[required, validEmail]}
                      />
                    </div>
                    <button className="btn btn-primary mb-3">
                      Change Email
                    </button>
                    {emailMessage && <p className="mt-3">{emailMessage}</p>}
                    <CheckButton style={{ display: "none" }} ref={emailCheckBtn} />
                  </Form>
                  {currentUser.roles.includes("ROLE_USER") && (
                    <div>
                      <button className="btn btn-primary" onClick={handlePromoteToModerator}>
                        Promote to Moderator
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;