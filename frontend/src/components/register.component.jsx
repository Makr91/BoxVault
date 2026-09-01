import PropTypes from "prop-types";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import { Link, useLocation } from "react-router-dom";

import AuthService from "../services/auth.service";
import { log } from "../utils/Logger";
import {
  redirectToProvider,
  sortMethodsByDefault,
  readStoredLoginMethod,
  storeLoginMethod,
} from "../utils/providers";

import AuthShell, {
  AuthAlert,
  AuthSpinner,
  InboxIcon,
} from "./AuthShell.component";
import ProviderButtons from "./ProviderButtons.component";

const resolveInitialMode = ({ localAllowed, hasOidc }) => {
  if (!localAllowed) {
    return "sso";
  }
  if (!hasOidc) {
    return "local";
  }
  return readStoredLoginMethod() === "password" ? "local" : "sso";
};

const deriveRegisterView = ({ mode, localAllowed, hasOidc }) => {
  const localMode = mode === "local" && localAllowed;
  return {
    showClosed: !hasOidc && !localAllowed,
    showLocalForm: localMode,
    showDivider: localMode && hasOidc,
    showButtons: hasOidc,
    showLocalToggle: !localMode && localAllowed,
    showSsoToggle: localMode && hasOidc,
  };
};

const validateForm = (formValues, t) => {
  const errors = {};
  if (!formValues.username) {
    errors.username = t("errors.fieldRequired");
  } else if (
    formValues.username.length < 3 ||
    formValues.username.length > 20
  ) {
    errors.username = t("errors.usernameLength");
  }

  if (!formValues.email) {
    errors.email = t("errors.fieldRequired");
  } else if (!/\S+@\S+\.\S+/.test(formValues.email)) {
    errors.email = t("errors.invalidEmail");
  }

  if (!formValues.password) {
    errors.password = t("errors.fieldRequired");
  } else if (
    formValues.password.length < 6 ||
    formValues.password.length > 40
  ) {
    errors.password = t("errors.passwordLength");
  }

  return errors;
};

const RegisterField = ({
  id,
  name,
  label,
  hint,
  error,
  type,
  autoComplete,
  value,
  onChange,
  children,
}) => (
  <div className="auth-field">
    <label className="auth-field-label" htmlFor={id}>
      {label}
    </label>
    <div
      className={`auth-input-wrap${children ? " auth-input-wrap--password" : ""}${error ? " has-error" : ""}`}
    >
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        maxLength={255}
      />
      {children}
    </div>
    {hint && <p className="auth-field-hint">{hint}</p>}
    {error && <p className="auth-field-error">{error}</p>}
  </div>
);

RegisterField.propTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
  error: PropTypes.string,
  type: PropTypes.string.isRequired,
  autoComplete: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  children: PropTypes.node,
};

const LocalRegisterForm = ({
  formValues,
  validationErrors,
  onChange,
  onSubmit,
  loading,
}) => {
  const { t } = useTranslation(["auth"]);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <RegisterField
        id="register-username"
        name="username"
        label={t("register.username")}
        error={validationErrors.username}
        type="text"
        autoComplete="username"
        value={formValues.username}
        onChange={onChange}
      />
      <RegisterField
        id="register-name"
        name="name"
        label={t("register.name")}
        hint={t("register.nameHint")}
        type="text"
        autoComplete="name"
        value={formValues.name}
        onChange={onChange}
      />
      <RegisterField
        id="register-email"
        name="email"
        label={t("register.email")}
        error={validationErrors.email}
        type="email"
        autoComplete="email"
        value={formValues.email}
        onChange={onChange}
      />
      <RegisterField
        id="register-password"
        name="password"
        label={t("register.password")}
        error={validationErrors.password}
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        value={formValues.password}
        onChange={onChange}
      >
        <button
          type="button"
          className="auth-reveal"
          onClick={() => setShowPassword((visible) => !visible)}
          aria-label={
            showPassword ? t("login.hidePassword") : t("login.showPassword")
          }
        >
          {showPassword ? <FaEyeSlash /> : <FaEye />}
        </button>
      </RegisterField>

      <button
        type="submit"
        className={`auth-btn auth-btn-primary auth-btn-block${loading ? " is-loading" : ""}`}
        disabled={loading}
      >
        {t("register.signUpButton")}
      </button>
    </form>
  );
};

LocalRegisterForm.propTypes = {
  formValues: PropTypes.shape({
    username: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    password: PropTypes.string.isRequired,
  }).isRequired,
  validationErrors: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
};

const RegisterMethods = ({
  view,
  oidcMethods,
  defaultProvider,
  loading,
  formValues,
  validationErrors,
  onChange,
  onSubmit,
  onSelectProvider,
  onSwitchMode,
}) => {
  const { t } = useTranslation(["auth"]);
  const hasLinks = view.showLocalToggle || view.showSsoToggle;

  return (
    <>
      {view.showClosed && (
        <AuthAlert tone="info">{t("register.closed")}</AuthAlert>
      )}
      {view.showLocalForm && (
        <LocalRegisterForm
          formValues={formValues}
          validationErrors={validationErrors}
          onChange={onChange}
          onSubmit={onSubmit}
          loading={loading}
        />
      )}
      {view.showDivider && (
        <div className="auth-or">{t("login.orSeparator")}</div>
      )}
      {view.showButtons && (
        <ProviderButtons
          methods={oidcMethods}
          defaultProvider={defaultProvider}
          loading={loading}
          onSelect={onSelectProvider}
        />
      )}
      {hasLinks && (
        <div className="auth-links">
          {view.showLocalToggle && (
            <button
              type="button"
              className="auth-link auth-link-muted"
              onClick={() => onSwitchMode("local")}
            >
              {t("register.useLocal")}
            </button>
          )}
          {view.showSsoToggle && (
            <button
              type="button"
              className="auth-link auth-link-muted"
              onClick={() => onSwitchMode("sso")}
            >
              {t("register.useSso")}
            </button>
          )}
        </div>
      )}
    </>
  );
};

RegisterMethods.propTypes = {
  view: PropTypes.shape({
    showClosed: PropTypes.bool.isRequired,
    showLocalForm: PropTypes.bool.isRequired,
    showDivider: PropTypes.bool.isRequired,
    showButtons: PropTypes.bool.isRequired,
    showLocalToggle: PropTypes.bool.isRequired,
    showSsoToggle: PropTypes.bool.isRequired,
  }).isRequired,
  oidcMethods: PropTypes.arrayOf(PropTypes.object).isRequired,
  defaultProvider: PropTypes.string,
  loading: PropTypes.bool.isRequired,
  formValues: PropTypes.object.isRequired,
  validationErrors: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onSelectProvider: PropTypes.func.isRequired,
  onSwitchMode: PropTypes.func.isRequired,
};

const Register = () => {
  const { t } = useTranslation(["auth", "common"]);
  const location = useLocation();

  useEffect(() => {
    document.title = t("register.pageTitle");
  }, [t]);

  const [formValues, setFormValues] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(null);
  const [invitationToken, setInvitationToken] = useState(null);
  const [organizationName, setOrganizationName] = useState("");
  const [authMethods, setAuthMethods] = useState([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [defaultProvider, setDefaultProvider] = useState(null);
  const [localRegistrationEnabled, setLocalRegistrationEnabled] =
    useState(false);
  const [chosenMode, setChosenMode] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadAuthMethods = async () => {
      try {
        const result = await AuthService.getAuthMethods();
        if (cancelled) {
          return;
        }
        setAuthMethods(result.methods || []);
        setDefaultProvider(result.default_provider || null);
        setLocalRegistrationEnabled(!!result.local_registration_enabled);
      } catch (error) {
        if (!cancelled) {
          log.auth.error("Error loading auth methods", {
            error: error.message,
          });
          setAuthMethods([
            { id: "local", name: t("login.localAccount"), enabled: true },
          ]);
          setLocalRegistrationEnabled(true);
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
    const validateToken = async () => {
      const queryParams = new URLSearchParams(location.search);
      const token = queryParams.get("token");
      if (token) {
        setInvitationToken(token);
        try {
          const response = await AuthService.validateInvitationToken(token);
          setOrganizationName(response.data.organizationName);
        } catch (error) {
          log.auth.error("Invalid or expired token", {
            token,
            error: error.message,
          });
        }
      }
    };

    validateToken();
  }, [location]);

  const enabledAuthMethods = useMemo(
    () => authMethods.filter((method) => method.enabled),
    [authMethods]
  );
  const localEnabled = enabledAuthMethods.some(
    (method) => method.id === "local"
  );
  const oidcMethods = useMemo(
    () =>
      sortMethodsByDefault(
        enabledAuthMethods.filter((method) => method.id.startsWith("oidc-")),
        defaultProvider
      ),
    [enabledAuthMethods, defaultProvider]
  );
  const hasOidc = oidcMethods.length > 0;
  const localAllowed =
    localEnabled && (localRegistrationEnabled || !!invitationToken);
  const mode = chosenMode || resolveInitialMode({ localAllowed, hasOidc });
  const view = deriveRegisterView({ mode, localAllowed, hasOidc });

  const handleSwitchMode = (next) => {
    setChosenMode(next);
    storeLoginMethod(next === "local" ? "password" : "sso");
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleOidcRegister = (provider) => {
    try {
      localStorage.setItem(
        "boxvault_intended_url",
        invitationToken
          ? `/invite/${encodeURIComponent(invitationToken)}`
          : "/organizations/discover"
      );
      setIsSubmitting(true);
      redirectToProvider(provider);
    } catch (err) {
      log.auth.error("Invalid OIDC provider selected", { error: err.message });
      setIsSubmitting(false);
      setStatus({ success: false, message: t("errors.invalidProvider") });
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const errors = validateForm(formValues, t);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    AuthService.register(
      formValues.username,
      formValues.email,
      formValues.password,
      invitationToken,
      formValues.name
    )
      .then((response) => {
        setStatus({ success: true, message: response.data.message });
        setIsSubmitting(false);
      })
      .catch((error) => {
        const resMessage =
          error.response?.data?.message || error.message || error.toString();
        setStatus({ success: false, message: resMessage });
        setIsSubmitting(false);
      });
  };

  if (status?.success) {
    return (
      <AuthShell
        title={t("register.checkInbox")}
        subtitle={status.message}
        icon={<InboxIcon />}
      >
        <p className="auth-note">{t("register.checkInboxHint")}</p>
        <Link
          to="/login"
          className="auth-btn auth-btn-secondary auth-btn-block"
        >
          {t("register.signIn")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("register.headline")} subtitle={t("register.subhead")}>
      {organizationName && (
        <AuthAlert tone="info">
          {t("register.joiningOrganization")}{" "}
          <strong>{organizationName}</strong>
        </AuthAlert>
      )}

      {status?.message && <AuthAlert tone="danger">{status.message}</AuthAlert>}

      {methodsLoading ? (
        <AuthSpinner label={t("common:loading")} />
      ) : (
        <RegisterMethods
          view={view}
          oidcMethods={oidcMethods}
          defaultProvider={defaultProvider}
          loading={isSubmitting}
          formValues={formValues}
          validationErrors={validationErrors}
          onChange={handleInputChange}
          onSubmit={handleSubmit}
          onSelectProvider={handleOidcRegister}
          onSwitchMode={handleSwitchMode}
        />
      )}

      <p className="auth-foot">
        {t("register.haveAccount")}{" "}
        <Link to="/login" className="auth-link">
          {t("register.signIn")}
        </Link>
      </p>
    </AuthShell>
  );
};

export default Register;
