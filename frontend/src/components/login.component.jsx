import PropTypes from "prop-types";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, Link } from "react-router-dom";

import EventBus from "../common/EventBus";
import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import AuthService from "../services/auth.service";
import { log } from "../utils/Logger";

const SILENT_SSO_FLAG = "boxvault_silent_sso_attempted";

const sanitizeProvider = (provider) => {
  const safeProviderPattern = /^[A-Za-z0-9_-]+$/;
  if (typeof provider !== "string" || !safeProviderPattern.test(provider)) {
    throw new Error("Invalid authentication provider");
  }
  return provider;
};

const getOidcErrorMessage = (error, t) => {
  switch (error) {
    case "oidc_failed":
      return t("errors.oidcFailed");
    case "access_denied":
      return t("errors.accessDenied");
    case "no_provider":
      return t("errors.noProvider");
    case "token_failed":
      return t("errors.failedToProcess");
    default:
      return error ? t("errors.authError", { error }) : "";
  }
};

const Login = ({ theme }) => {
  const { t } = useTranslation(["auth", "common"]);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = t("login.pageTitle");
  }, [t]);
  const location = useLocation();

  const [formValues, setFormValues] = useState({
    username: "",
    password: "",
    stayLoggedIn: false,
  });

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [authMethods, setAuthMethods] = useState([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [defaultProvider, setDefaultProvider] = useState(null);
  const [silentLogin, setSilentLogin] = useState(false);
  const [showLocalForm, setShowLocalForm] = useState(false);
  const [silentChecking, setSilentChecking] = useState(false);

  const urlParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );
  const providerParam = urlParams.get("provider");

  const oidcErrorMessage = useMemo(
    () => getOidcErrorMessage(urlParams.get("error"), t),
    [urlParams, t]
  );
  const message = statusMessage || oidcErrorMessage;

  const enabledAuthMethods = useMemo(
    () => authMethods.filter((method) => method.enabled),
    [authMethods]
  );

  const localEnabled = useMemo(
    () => enabledAuthMethods.some((method) => method.id === "local"),
    [enabledAuthMethods]
  );

  const oidcMethods = useMemo(() => {
    const methods = enabledAuthMethods.filter((method) =>
      method.id.startsWith("oidc-")
    );
    if (!defaultProvider) {
      return methods;
    }
    const defaultId = `oidc-${defaultProvider}`;
    return [...methods].sort((a, b) => {
      if (a.id === defaultId) {
        return -1;
      }
      if (b.id === defaultId) {
        return 1;
      }
      return 0;
    });
  }, [enabledAuthMethods, defaultProvider]);

  const visibleOidcMethods = useMemo(() => {
    if (providerParam === "local") {
      return [];
    }
    if (providerParam) {
      const gated = oidcMethods.filter(
        (method) =>
          method.id === providerParam || method.id === `oidc-${providerParam}`
      );
      if (gated.length > 0) {
        return gated;
      }
    }
    return oidcMethods;
  }, [oidcMethods, providerParam]);

  const isGated =
    !!providerParam &&
    providerParam !== "local" &&
    visibleOidcMethods.length > 0 &&
    visibleOidcMethods.length < oidcMethods.length;

  const localVisible =
    localEnabled &&
    (providerParam === "local" ||
      visibleOidcMethods.length === 0 ||
      showLocalForm);

  useEffect(() => {
    let cancelled = false;

    const loadAuthMethods = async () => {
      try {
        const result = await AuthService.getAuthMethods();
        if (cancelled) {
          return;
        }

        if (result.methods && result.methods.length > 0) {
          setAuthMethods(result.methods);
        } else {
          setAuthMethods([
            { id: "local", name: t("login.localAccount"), enabled: true },
          ]);
        }
        setDefaultProvider(result.default_provider || null);
        setSilentLogin(!!result.silent_login);
      } catch (error) {
        if (!cancelled) {
          log.auth.error("Error loading auth methods", {
            error: error.message,
          });
          setAuthMethods([
            { id: "local", name: "Local Account", enabled: true },
          ]);
        }
      } finally {
        if (!cancelled) {
          setMethodsLoading(false);
        }
      }
    };

    loadAuthMethods();

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    const token = urlParams.get("token");

    if (token) {
      try {
        const userData = { accessToken: token };
        localStorage.setItem("user", JSON.stringify(userData));

        const returnTo = urlParams.get("returnTo");
        if (returnTo) {
          const decodedUrl = decodeURIComponent(returnTo);
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
        navigate("/login?error=token_failed", { replace: true });
      }
    }
  }, [urlParams, navigate]);

  useEffect(() => {
    if (methodsLoading || !silentLogin || !defaultProvider) {
      return;
    }
    if (
      providerParam ||
      urlParams.get("error") ||
      urlParams.get("silent") ||
      urlParams.get("token") ||
      urlParams.get("logout")
    ) {
      return;
    }
    if (AuthService.getCurrentUser()) {
      return;
    }
    if (sessionStorage.getItem(SILENT_SSO_FLAG)) {
      return;
    }
    const defaultMethodEnabled = enabledAuthMethods.some(
      (method) => method.id === `oidc-${defaultProvider}`
    );
    if (!defaultMethodEnabled) {
      return;
    }

    try {
      const safeProvider = sanitizeProvider(defaultProvider);
      sessionStorage.setItem(SILENT_SSO_FLAG, "1");
      setSilentChecking(true);
      window.location.href = `/api/auth/oidc/${safeProvider}?prompt=none`;
    } catch (err) {
      log.auth.error("Silent SSO attempt failed to start", {
        error: err.message,
      });
    }
  }, [
    methodsLoading,
    silentLogin,
    defaultProvider,
    providerParam,
    urlParams,
    enabledAuthMethods,
  ]);

  const handleOidcLogin = (provider) => {
    if (window.location.pathname !== "/login") {
      localStorage.setItem("boxvault_intended_url", window.location.pathname);
    }

    setLoading(true);
    setStatusMessage("");
    try {
      const safeProvider = sanitizeProvider(provider);
      window.location.href = `/api/auth/oidc/${safeProvider}`;
    } catch (err) {
      log.auth.error("Invalid OIDC provider selected", { error: err.message });
      setLoading(false);
      setStatusMessage(t("errors.invalidProvider"));
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

    if (!formValues.username || !formValues.password) {
      return;
    }

    setStatusMessage("");
    setLoading(true);

    AuthService.login(
      formValues.username,
      formValues.password,
      formValues.stayLoggedIn
    )
      .then((user) => {
        const returnTo = urlParams.get("returnTo");

        EventBus.dispatch("login", user);

        if (returnTo) {
          const decodedUrl = decodeURIComponent(returnTo);
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
        setStatusMessage(resMessage);
      });
  };

  if (silentChecking) {
    return (
      <div className="col-md-12">
        <div className="container col-md-3 text-center mt-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">{t("login.checkingSession")}</span>
          </div>
          <p className="mt-3">{t("login.checkingSession")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="col-md-12">
      <div className="container col-md-3">
        {theme === "light" ? (
          <BoxVaultLight className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3" />
        ) : (
          <BoxVaultDark className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3" />
        )}
        <h2 className="fs-1 text-center mt-4">{t("login.title")}</h2>

        {methodsLoading && (
          <div className="text-center mt-4">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">{t("common:loading")}</span>
            </div>
          </div>
        )}

        {!methodsLoading && visibleOidcMethods.length > 0 && (
          <div className="d-grid gap-2 mt-4">
            {visibleOidcMethods.map((method) => {
              const providerName = method.id.replace("oidc-", "");
              const isDefault =
                defaultProvider && method.id === `oidc-${defaultProvider}`;
              return (
                <button
                  key={method.id}
                  type="button"
                  className={`btn ${
                    isDefault || visibleOidcMethods.length === 1
                      ? "btn-primary"
                      : "btn-outline-primary"
                  }`}
                  disabled={loading}
                  onClick={() => handleOidcLogin(providerName)}
                >
                  {loading && (
                    <span className="spinner-border spinner-border-sm me-2" />
                  )}
                  {method.name}
                </button>
              );
            })}
          </div>
        )}

        {!methodsLoading &&
          visibleOidcMethods.length > 0 &&
          localEnabled &&
          !localVisible && (
            <div className="text-center mt-3">
              <button
                type="button"
                className="btn btn-link btn-sm"
                onClick={() => setShowLocalForm(true)}
              >
                {t("login.useLocalAccount")}
              </button>
            </div>
          )}

        {!methodsLoading && isGated && (
          <div className="text-center mt-2">
            <Link to="/login" className="btn btn-link btn-sm">
              {t("login.otherOptions")}
            </Link>
          </div>
        )}

        {!methodsLoading && localVisible && (
          <form onSubmit={handleLogin} noValidate>
            {visibleOidcMethods.length > 0 && (
              <div className="d-flex align-items-center my-3">
                <hr className="flex-grow-1" />
                <span className="px-2 text-muted small">
                  {t("login.orSeparator")}
                </span>
                <hr className="flex-grow-1" />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="username">{t("login.username")}</label>
              <input
                type="text"
                className="form-control"
                name="username"
                value={formValues.username}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">{t("login.password")}</label>
              <input
                type="password"
                className="form-control"
                name="password"
                value={formValues.password}
                onChange={handleInputChange}
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
                  {t("login.stayLoggedIn")}
                </label>
              </div>
            </div>

            <div className="d-grid gap-2 col-6 mx-auto mt-3">
              <button className="btn btn-primary btn-block" disabled={loading}>
                {loading && (
                  <span className="spinner-border spinner-border-sm" />
                )}
                <span>{t("login.loginButton")}</span>
              </button>
            </div>
          </form>
        )}

        {message && (
          <div className="form-group mt-3">
            <div className="alert alert-danger" role="alert">
              {message}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Login.propTypes = {
  theme: PropTypes.string.isRequired,
};

export default Login;
