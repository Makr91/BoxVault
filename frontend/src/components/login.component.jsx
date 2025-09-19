import React, { useState, useEffect } from "react";
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
  const [authMethod, setAuthMethod] = useState("local");
  const [authMethods, setAuthMethods] = useState([]);
  const [methodsLoading, setMethodsLoading] = useState(true);

  useEffect(() => {
    loadAuthMethods();
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');

    if (token) {
      try {
        const userData = { accessToken: token };
        localStorage.setItem("user", JSON.stringify(userData));
        
        const returnTo = urlParams.get('returnTo');
        if (returnTo) {
          window.location.href = decodeURIComponent(returnTo);
        } else {
          navigate("/profile");
          window.location.reload();
        }
      } catch (error) {
        console.error("Error processing OIDC token:", error);
        setMessage("Failed to process authentication");
      }
    } else if (error) {
      let errorMessage = "Authentication failed";
      switch (error) {
        case 'oidc_failed':
          errorMessage = "OIDC authentication failed";
          break;
        case 'access_denied':
          errorMessage = "Access denied - you may not have permission to access this system";
          break;
        case 'no_provider':
          errorMessage = "No authentication provider specified";
          break;
        default:
          errorMessage = `Authentication error: ${error}`;
      }
      setMessage(errorMessage);
    }
  }, [location.search, navigate]);

  const loadAuthMethods = async () => {
    try {
      setMethodsLoading(true);
      const result = await AuthService.getAuthMethods();

      if (result.methods && result.methods.length > 0) {
        setAuthMethods(result.methods);
        const firstMethod = result.methods.find(m => m.enabled);
        if (firstMethod) {
          setAuthMethod(firstMethod.id);
        }
      } else {
        setAuthMethods([{ id: "local", name: "Local Account", enabled: true }]);
        setAuthMethod("local");
      }
    } catch (error) {
      console.error("Error loading auth methods:", error);
      setAuthMethods([{ id: "local", name: "Local Account", enabled: true }]);
      setAuthMethod("local");
    } finally {
      setMethodsLoading(false);
    }
  };

  const handleAuthMethodChange = (newMethod) => {
    setAuthMethod(newMethod);
    setMessage("");
  };

  const handleOidcLogin = (provider) => {
    if (window.location.pathname !== "/login") {
      localStorage.setItem("boxvault_intended_url", window.location.pathname);
    }

    setLoading(true);
    setMessage("");
    window.location.href = `/api/auth/oidc/${provider}`;
  };

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormValues(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleLogin = (event) => {
    event.preventDefault();

    if (authMethod.startsWith("oidc-")) {
      const provider = authMethod.replace("oidc-", "");
      handleOidcLogin(provider);
      return;
    }

    if (!formValues.username || !formValues.password) {
      return;
    }

    setMessage("");
    setLoading(true);

    AuthService.login(formValues.username, formValues.password, formValues.stayLoggedIn)
      .then(() => {
        const urlParams = new URLSearchParams(location.search);
        const returnTo = urlParams.get('returnTo');
        
        if (returnTo) {
          window.location.href = decodeURIComponent(returnTo);
        } else {
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
          {!methodsLoading && authMethods.length > 1 && (
            <div className="form-group">
              <label htmlFor="authMethod">Authentication Method</label>
              <select
                className="form-control"
                name="authMethod"
                value={authMethod}
                onChange={(e) => handleAuthMethodChange(e.target.value)}
                disabled={loading}
              >
                {authMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.name}
                  </option>
                ))}
              </select>
              <small className="form-text text-muted">
                {authMethod.startsWith("oidc-")
                  ? "Sign in through your identity provider"
                  : "Use your local account credentials"}
              </small>
            </div>
          )}

          {authMethod.startsWith("oidc-") && (
            <div className="form-group">
              <div className="alert alert-info text-center">
                <i className="fas fa-external-link-alt"></i>
                <br />
                You will be redirected to your identity provider to sign in.
              </div>
            </div>
          )}

          {!authMethod.startsWith("oidc-") && (
            <>
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
            </>
          )}

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
              <span>
                {authMethod.startsWith("oidc-")
                  ? authMethods.find((m) => m.id === authMethod)?.name || "Continue with OIDC"
                  : "Login"}
              </span>
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
