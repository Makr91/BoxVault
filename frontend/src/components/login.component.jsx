import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";

import EventBus from "../common/EventBus";
import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import AuthService from "../services/auth.service";
import { log } from "../utils/Logger";

const sanitizeProvider = (provider) => {
  const safeProviderPattern = /^[A-Za-z0-9_-]+$/;
  if (typeof provider !== "string" || !safeProviderPattern.test(provider)) {
    throw new Error("Invalid authentication provider");
  }
  return provider;
};

const Login = ({ theme }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Login";
  }, []);
  const location = useLocation();

  const [formValues, setFormValues] = useState({
    username: "",
    password: "",
    stayLoggedIn: false,
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [authMethod, setAuthMethod] = useState("local");
  const [authMethods, setAuthMethods] = useState([]);
  const [methodsLoading, setMethodsLoading] = useState(true);

  const loadAuthMethods = async () => {
    try {
      setMethodsLoading(true);
      const result = await AuthService.getAuthMethods();

      if (result.methods && result.methods.length > 0) {
        setAuthMethods(result.methods);
        const firstMethod = result.methods.find((m) => m.enabled);
        if (firstMethod) {
          setAuthMethod(firstMethod.id);
        }
      } else {
        setAuthMethods([{ id: "local", name: "Local Account", enabled: true }]);
        setAuthMethod("local");
      }
    } catch (error) {
      log.auth.error("Error loading auth methods", { error: error.message });
      setAuthMethods([{ id: "local", name: "Local Account", enabled: true }]);
      setAuthMethod("local");
    } finally {
      setMethodsLoading(false);
    }
  };

  useEffect(() => {
    loadAuthMethods();
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const token = urlParams.get("token");
    const error = urlParams.get("error");

    if (token) {
      try {
        const userData = { accessToken: token };
        localStorage.setItem("user", JSON.stringify(userData));

        const returnTo = urlParams.get("returnTo");
        if (returnTo) {
          const decodedUrl = decodeURIComponent(returnTo);
          // Only allow same-origin redirects (relative paths or same domain)
          if (decodedUrl.startsWith("/") && !decodedUrl.startsWith("//")) {
            navigate(decodedUrl, { replace: true });
          } else {
            navigate("/profile", { replace: true });
          }
        } else {
          navigate("/profile", { replace: true });
        }
      } catch (tokenError) {
        log.auth.error("Error processing OIDC token", {
          error: tokenError.message,
        });
        setMessage(t("errors.failedToProcess", { ns: "auth" }));
      }
    } else if (error) {
      let errorMessage = t("errors.authenticationFailed", { ns: "auth" });
      switch (error) {
        case "oidc_failed":
          errorMessage = t("errors.oidcFailed", { ns: "auth" });
          break;
        case "access_denied":
          errorMessage = t("errors.accessDenied", { ns: "auth" });
          break;
        case "no_provider":
          errorMessage = t("errors.noProvider", { ns: "auth" });
          break;
        default:
          errorMessage = t("errors.authError", { ns: "auth", error });
      }
      setMessage(errorMessage);
    }
  }, [location.search, navigate, t]);

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
    try {
      const safeProvider = sanitizeProvider(provider);
      window.location.href = `/api/auth/oidc/${safeProvider}`;
    } catch (err) {
      log("Invalid OIDC provider selected", err);
      setLoading(false);
      setMessage("Invalid authentication provider selected.");
    }
  };

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
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

    AuthService.login(
      formValues.username,
      formValues.password,
      formValues.stayLoggedIn
    )
      .then((user) => {
        const urlParams = new URLSearchParams(location.search);
        const returnTo = urlParams.get("returnTo");

        // Dispatch login event to update UI components like the navbar
        EventBus.dispatch("login", user);

        if (returnTo) {
          const decodedUrl = decodeURIComponent(returnTo);
          // Only allow same-origin redirects (relative paths or same domain)
          if (decodedUrl.startsWith("/") && !decodedUrl.startsWith("//")) {
            navigate(decodedUrl, { replace: true });
          } else {
            navigate("/profile", { replace: true });
          }
        } else {
          navigate("/profile", { replace: true });
        }
      })
      .catch((error) => {
        const resMessage =
          error.response?.data?.message || error.message || error.toString();

        setLoading(false);
        setMessage(resMessage);
      });
  };

  return (
    <div className="col-md-12">
      <div className="container col-md-3">
        {theme === "light" ? (
          <BoxVaultLight className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3" />
        ) : (
          <BoxVaultDark className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3" />
        )}
        <h2 className="fs-1 text-center mt-4">BoxVault</h2>

        <form onSubmit={handleLogin} noValidate>
          {!methodsLoading && authMethods.length > 1 && (
            <div className="form-group">
              <label htmlFor="authMethod">
                {t("login.authMethod", { ns: "auth" })}
              </label>
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
                  ? t("login.oidcHint", { ns: "auth" })
                  : t("login.localHint", { ns: "auth" })}
              </small>
            </div>
          )}

          {authMethod.startsWith("oidc-") && (
            <div className="form-group">
              <div className="alert alert-info text-center">
                <i className="fas fa-external-link-alt" />
                {t("login.redirectMessage", { ns: "auth" })}
              </div>
            </div>
          )}

          {!authMethod.startsWith("oidc-") && (
            <>
              <div className="form-group">
                <label htmlFor="username">
                  {t("login.username", { ns: "auth" })}
                </label>
                <input
                  type="text"
                  className="form-control"
                  name="username"
                  value={formValues.username}
                  onChange={handleInputChange}
                  onFocus={(e) => e.preventDefault()}
                  onBlur={(e) => e.preventDefault()}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">
                  {t("login.password", { ns: "auth" })}
                </label>
                <input
                  type="password"
                  className="form-control"
                  name="password"
                  value={formValues.password}
                  onChange={handleInputChange}
                  onFocus={(e) => e.preventDefault()}
                  onBlur={(e) => e.preventDefault()}
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
                {t("login.stayLoggedIn", { ns: "auth" })}
              </label>
            </div>
          </div>

          <div className="d-grid gap-2 col-6 mx-auto mt-3">
            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading && <span className="spinner-border spinner-border-sm" />}
              <span>
                {authMethod.startsWith("oidc-")
                  ? authMethods.find((m) => m.id === authMethod)?.name ||
                    t("login.continueWithOidc", { ns: "auth" })
                  : t("login.loginButton", { ns: "auth" })}
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

Login.propTypes = {
  theme: PropTypes.string.isRequired,
};

export default Login;
