import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import AuthService from "../services/auth.service";
import BoxVaultLight from '../images/BoxVault.svg?react';
import BoxVaultDark from '../images/BoxVaultDark.svg?react';

const Register = ({ theme }) => {
  const [formValues, setFormValues] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [invitationToken, setInvitationToken] = useState(null);
  const [organizationName, setOrganizationName] = useState("");

  const location = useLocation();

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get("token");
    if (token) {
      setInvitationToken(token);
      // Optionally, you can validate the token here by calling an API
      // For example, fetch the organization name associated with the token
      AuthService.validateInvitationToken(token).then(response => {
        setOrganizationName(response.data.organizationName);
      }).catch(error => {
        console.error("Invalid or expired token:", error);
      });
    }
  }, [location]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormValues({ ...formValues, [name]: value });
  };

  const validateForm = () => {
    const errors = {};
    if (!formValues.username) {
      errors.username = "This field is required!";
    } else if (formValues.username.length < 3 || formValues.username.length > 20) {
      errors.username = "The username must be between 3 and 20 characters.";
    }

    if (!formValues.email) {
      errors.email = "This field is required!";
    } else if (!/\S+@\S+\.\S+/.test(formValues.email)) {
      errors.email = "This is not a valid email.";
    }

    if (!formValues.password) {
      errors.password = "This field is required!";
    } else if (formValues.password.length < 6 || formValues.password.length > 40) {
      errors.password = "The password must be between 6 and 40 characters.";
    }

    return errors;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const errors = validateForm();
    setValidationErrors(errors);

    if (Object.keys(errors).length === 0) {
      setIsSubmitting(true);
      AuthService.register(formValues.username, formValues.email, formValues.password, invitationToken)
        .then((response) => {
          setStatus({ success: true, message: response.data.message });
          setIsSubmitting(false);
        })
        .catch((error) => {
          const resMessage =
            (error.response && error.response.data && error.response.data.message) ||
            error.message ||
            error.toString();

          setStatus({ success: false, message: resMessage });
          setIsSubmitting(false);
        });
    }
  };

  return (
    <div className="col-md-12">
      <div className="container col-md-3">
        {theme === "light" ? <BoxVaultLight className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3"/> : <BoxVaultDark className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3"/>}
        <h2 className="fs-1 text-center mt-4">BoxVault</h2>

        {organizationName && (
          <div className="alert alert-info text-center">
            You are joining the organization: <strong>{organizationName}</strong>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!status?.success && (
            <div>
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  className="form-control"
                  name="username"
                  value={formValues.username}
                  onChange={handleInputChange}
                />
                {validationErrors.username && (
                  <div className="alert alert-danger">{validationErrors.username}</div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="text"
                  className="form-control"
                  name="email"
                  value={formValues.email}
                  onChange={handleInputChange}
                />
                {validationErrors.email && (
                  <div className="alert alert-danger">{validationErrors.email}</div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  className="form-control"
                  name="password"
                  value={formValues.password}
                  onChange={handleInputChange}
                />
                {validationErrors.password && (
                  <div className="alert alert-danger">{validationErrors.password}</div>
                )}
              </div>

              <div className="d-grid gap-2 col-6 mx-auto mt-3">
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={isSubmitting}
                >
                  Sign Up
                </button>
              </div>
            </div>
          )}

          {status?.message && (
            <div className="form-group">
              <div
                className={
                  status.success ? "alert alert-success" : "alert alert-danger"
                }
                role="alert"
              >
                {status.message}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default Register;