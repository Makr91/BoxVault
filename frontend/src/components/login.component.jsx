import React, { useState } from "react";
import { useNavigate, useLocation } from 'react-router-dom';
import AuthService from "../services/auth.service";
import BoxVaultLight from '../images/BoxVault.svg?react';
import BoxVaultDark from '../images/BoxVaultDark.svg?react';

const Login = ({ theme }) => {
  let navigate = useNavigate();
  const location = useLocation();

  const [formValues, setFormValues] = useState({
    username: "",
    password: "",
    stayLoggedIn: false
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormValues(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleLogin = (event) => {
    event.preventDefault();
    if (!formValues.username || !formValues.password) {
      return;
    }

    setMessage("");
    setLoading(true);

    AuthService.login(formValues.username, formValues.password, formValues.stayLoggedIn)
      .then(() => {
        // Check if there's a return path
        const urlParams = new URLSearchParams(location.search);
        const returnTo = urlParams.get('returnTo');
        
        if (returnTo) {
          // Decode and navigate to the return path
          window.location.href = decodeURIComponent(returnTo);
        } else {
          // Default behavior - go to profile
          navigate("/profile");
          window.location.reload();
        }
      })
      .catch(error => {
        const resMessage =
          (error.response?.data?.message) ||
          error.message ||
          error.toString();

        setLoading(false);
        setMessage(resMessage);
      });
  };

  return (
    <div className="col-md-12">
      <div className="container col-md-3">
        {theme === "light" ? <BoxVaultLight className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3" /> : <BoxVaultDark className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3" />}
        <h2 className="fs-1 text-center mt-4">BoxVault</h2>

        <form onSubmit={handleLogin} noValidate>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              className="form-control"
              name="username"
              value={formValues.username}
              onChange={handleInputChange}
              onFocus={e => e.preventDefault()}
              onBlur={e => e.preventDefault()}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              className="form-control"
              name="password"
              value={formValues.password}
              onChange={handleInputChange}
              onFocus={e => e.preventDefault()}
              onBlur={e => e.preventDefault()}
            />
          </div>

          <div className="form-group mt-3">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                name="stayLoggedIn"
                id="stayLoggedIn"
                checked={formValues.stayLoggedIn}
                onChange={handleInputChange}
              />
              <label className="form-check-label" htmlFor="stayLoggedIn">
                Stay logged in (required for long uploads)
              </label>
            </div>
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
