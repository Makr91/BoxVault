import React, { useState } from "react";
import { useNavigate } from 'react-router-dom';
import AuthService from "../services/auth.service";
import BoxVaultLight from '../images/BoxVault.svg?react';
import BoxVaultDark from '../images/BoxVaultDark.svg?react';

const Login = ({ theme }) => {
  let navigate = useNavigate();

  const [formValues, setFormValues] = useState({
    username: "",
    password: "",
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormValues({ ...formValues, [name]: value });
  };

  const validateForm = () => {
    const errors = {};
    if (!formValues.username) {
      errors.username = "This field is required!";
    }

    if (!formValues.password) {
      errors.password = "This field is required!";
    }

    return errors;
  };

  const handleLogin = (event) => {
    event.preventDefault();
    const errors = validateForm();
    setValidationErrors(errors);

    if (Object.keys(errors).length === 0) {
      setMessage("");
      setLoading(true);

      AuthService.login(formValues.username, formValues.password).then(
        () => {
          navigate("/profile");
          window.location.reload();
        },
        (error) => {
          const resMessage =
            (error.response &&
              error.response.data &&
              error.response.data.message) ||
            error.message ||
            error.toString();

          setLoading(false);
          setMessage(resMessage);
        }
      );
    } else {
      setLoading(false);
    }
  };

  return (
    <div className="col-md-12">
      <div className="container col-md-3">
        {theme === "light" ? <BoxVaultLight className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3" /> : <BoxVaultDark className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3" />}
        <h2 className="fs-1 text-center mt-4">BoxVault</h2>

        <form onSubmit={handleLogin}>
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
            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading && (
                <span className="spinner-border spinner-border-sm"></span>
              )}
              <span>Login</span>
            </button>
          </div>

          {message && (
            <div className="form-group">
              <div className="alert alert-danger" role="alert">
                {message}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default Login;