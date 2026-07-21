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

const redirectToProvider = (provider, query = "") => {
  const safeProvider = sanitizeProvider(provider);
  window.location.href = `/api/auth/oidc/${safeProvider}${query}`;
};

const rememberIntendedUrl = () => {
  if (window.location.pathname !== "/login") {
    localStorage.setItem("boxvault_intended_url", window.location.pathname);
  }
};

const resolveReturnPath = (urlParams) => {
  const returnTo = urlParams.get("returnTo");
  if (returnTo) {
    const decodedUrl = decodeURIComponent(returnTo);
    if (decodedUrl.startsWith("/") && !decodedUrl.startsWith("//")) {
      return decodedUrl;
    }
  }
  return "/profile";
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

const sortMethodsByDefault = (methods, defaultProvider) => {
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
};

const filterVisibleOidcMethods = (oidcMethods, providerParam) => {
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
};

const hasSilentBlockingParams = (urlParams) =>
  !!(
    urlParams.get("provider") ||
    urlParams.get("error") ||
    urlParams.get("silent") ||
    urlParams.get("token") ||
    urlParams.get("logout")
  );

const deriveLoginView = ({
  methodsLoading,
  providerParam,
  oidcMethods,
  visibleOidcMethods,
  localEnabled,
  showLocalForm,
}) => {
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

  const hasButtons = !methodsLoading && visibleOidcMethods.length > 0;

  return {
    showButtons: hasButtons,
    showEscapeHatch: hasButtons && localEnabled && !localVisible,
    showGatedLink: !methodsLoading && isGated,
    showLocalForm: !methodsLoading && localVisible,
    showDivider: visibleOidcMethods.length > 0,
  };
};

const SilentCheckScreen = () => {
  const { t } = useTranslation(["auth"]);
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
};

const OidcProviderButtons = ({
  methods,
  defaultProvider,
  loading,
  onSelect,
}) => (
  <div className="d-grid gap-2 mt-4">
    {methods.map((method) => {
      const providerName = method.id.replace("oidc-", "");
      const isPrimary =
        methods.length === 1 ||
        (defaultProvider && method.id === `oidc-${defaultProvider}`);
      return (
        <button
          key={method.id}
          type="button"
          className={`btn ${isPrimary ? "btn-primary" : "btn-outline-primary"}`}
          disabled={loading}
          onClick={() => onSelect(providerName)}
        >
          {loading && (
            <span className="spinner-border spinner-border-sm me-2" />
          )}
          {method.name}
        </button>
      );
    })}
  </div>
);

OidcProviderButtons.propTypes = {
  methods: PropTypes.arrayOf(PropTypes.object).isRequired,
  defaultProvider: PropTypes.string,
  loading: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
};

const LocalLoginForm = ({
  formValues,
  onChange,
  onSubmit,
  loading,
  showDivider,
}) => {
  const { t } = useTranslation(["auth"]);
  return (
    <form onSubmit={onSubmit} noValidate>
      {showDivider && (
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
          onChange={onChange}
        />
      </div>

      <div className="form-group">
        <label htmlFor="password">{t("login.password")}</label>
        <input
          type="password"
          className="form-control"
          name="password"
          value={formValues.password}
          onChange={onChange}
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
            onChange={onChange}
          />
          <label className="form-check-label" htmlFor="stayLoggedIn">
            {t("login.stayLoggedIn")}
          </label>
        </div>
      </div>

      <div className="d-grid gap-2 col-6 mx-auto mt-3">
        <button className="btn btn-primary btn-block" disabled={loading}>
          {loading && <span className="spinner-border spinner-border-sm" />}
          <span>{t("login.loginButton")}</span>
        </button>
      </div>
    </form>
  );
};

LocalLoginForm.propTypes = {
  formValues: PropTypes.shape({
    username: PropTypes.string.isRequired,
    password: PropTypes.string.isRequired,
    stayLoggedIn: PropTypes.bool.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  showDivider: PropTypes.bool.isRequired,
};

const Login = ({ theme }) => {
  const { t } = useTranslation(["auth", "common"]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.title = t("login.pageTitle");
  }, [t]);

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

  const oidcMethods = useMemo(
    () =>
      sortMethodsByDefault(
        enabledAuthMethods.filter((method) => method.id.startsWith("oidc-")),
        defaultProvider
      ),
    [enabledAuthMethods, defaultProvider]
  );

  const visibleOidcMethods = useMemo(
    () => filterVisibleOidcMethods(oidcMethods, providerParam),
    [oidcMethods, providerParam]
  );

  const view = useMemo(
    () =>
      deriveLoginView({
        methodsLoading,
        providerParam,
        oidcMethods,
        visibleOidcMethods,
        localEnabled,
        showLocalForm,
      }),
    [
      methodsLoading,
      providerParam,
      oidcMethods,
      visibleOidcMethods,
      localEnabled,
      showLocalForm,
    ]
  );

  const shouldAttemptSilent = useMemo(() => {
    if (methodsLoading || !silentLogin || !defaultProvider) {
      return false;
    }
    if (hasSilentBlockingParams(urlParams)) {
      return false;
    }
    if (AuthService.getCurrentUser()) {
      return false;
    }
    if (sessionStorage.getItem(SILENT_SSO_FLAG)) {
      return false;
    }
    return enabledAuthMethods.some(
      (method) => method.id === `oidc-${defaultProvider}`
    );
  }, [
    methodsLoading,
    silentLogin,
    defaultProvider,
    urlParams,
    enabledAuthMethods,
  ]);

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
    if (!token) {
      return;
    }

    try {
      localStorage.setItem("user", JSON.stringify({ accessToken: token }));
      navigate(resolveReturnPath(urlParams), { replace: true });
    } catch (tokenError) {
      log.auth.error("Error processing OIDC token", {
        error: tokenError.message,
      });
      navigate("/login?error=token_failed", { replace: true });
    }
  }, [urlParams, navigate]);

  useEffect(() => {
    if (!shouldAttemptSilent) {
      return;
    }
    try {
      sessionStorage.setItem(SILENT_SSO_FLAG, "1");
      redirectToProvider(defaultProvider, "?prompt=none");
    } catch (err) {
      log.auth.error("Silent SSO attempt failed to start", {
        error: err.message,
      });
    }
  }, [shouldAttemptSilent, defaultProvider]);

  const handleOidcLogin = (provider) => {
    rememberIntendedUrl();
    setLoading(true);
    setStatusMessage("");
    try {
      redirectToProvider(provider);
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
        EventBus.dispatch("login", user);
        navigate(resolveReturnPath(urlParams), { replace: true });
      })
      .catch((error) => {
        const resMessage =
          error.response?.data?.message || error.message || error.toString();

        setLoading(false);
        setStatusMessage(resMessage);
      });
  };

  if (shouldAttemptSilent) {
    return <SilentCheckScreen />;
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

        {view.showButtons && (
          <OidcProviderButtons
            methods={visibleOidcMethods}
            defaultProvider={defaultProvider}
            loading={loading}
            onSelect={handleOidcLogin}
          />
        )}

        {view.showEscapeHatch && (
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

        {view.showGatedLink && (
          <div className="text-center mt-2">
            <Link to="/login" className="btn btn-link btn-sm">
              {t("login.otherOptions")}
            </Link>
          </div>
        )}

        {view.showLocalForm && (
          <LocalLoginForm
            formValues={formValues}
            onChange={handleInputChange}
            onSubmit={handleLogin}
            loading={loading}
            showDivider={view.showDivider}
          />
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
