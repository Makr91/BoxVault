import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import AuthService from "../services/auth.service";
import { log } from "../utils/Logger";

const Register = ({ theme }) => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = "Register";
  }, []);

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
  const [authMethod, setAuthMethod] = useState("local");
  const [authMethods, setAuthMethods] = useState([]);
  const [methodsLoading, setMethodsLoading] = useState(true);

  const location = useLocation();

  const loadAuthMethods = async () => {
    try {
      setMethodsLoading(true);
      const result = await AuthService.getAuthMethods();
      if (result.methods && result.methods.length > 0) {
        setAuthMethods(result.methods);
      } else {
        setAuthMethods([{ id: "local", name: "Local Account", enabled: true }]);
      }
    } catch (error) {
      log.auth.error("Error loading auth methods", { error: error.message });
      setAuthMethods([{ id: "local", name: "Local Account", enabled: true }]);
    } finally {
      setMethodsLoading(false);
    }
  };

  useEffect(() => {
    loadAuthMethods();
  }, []);

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

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormValues({ ...formValues, [name]: value });
  };

  const validateForm = () => {
    const errors = {};
    if (!formValues.username) {
      errors.username = t("errors.fieldRequired", { ns: "auth" });
    } else if (
      formValues.username.length < 3 ||
      formValues.username.length > 20
    ) {
      errors.username = t("errors.usernameLength", { ns: "auth" });
    }

    if (!formValues.email) {
      errors.email = t("errors.fieldRequired", { ns: "auth" });
    } else if (!/\S+@\S+\.\S+/.test(formValues.email)) {
      errors.email = t("errors.invalidEmail", { ns: "auth" });
    }

    if (!formValues.password) {
      errors.password = t("errors.fieldRequired", { ns: "auth" });
    } else if (
      formValues.password.length < 6 ||
      formValues.password.length > 40
    ) {
      errors.password = t("errors.passwordLength", { ns: "auth" });
    }

    return errors;
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    // If OIDC method, redirect to OIDC provider
    if (authMethod.startsWith("oidc-")) {
      const provider = authMethod.replace("oidc-", "");
      localStorage.setItem("boxvault_intended_url", "/organizations/discover");
      window.location.href = `/api/auth/oidc/${provider}`;
      return;
    }

    // Local registration
    const errors = validateForm();
    setValidationErrors(errors);

    if (Object.keys(errors).length === 0) {
      setIsSubmitting(true);
      AuthService.register(
        formValues.username,
        formValues.email,
        formValues.password,
        invitationToken
      )
        .then((response) => {
          setStatus({ success: true, message: response.data.message });
          setIsSubmitting(false);
        })
        .catch((error) => {
          const resMessage =
            (error.response &&
              error.response.data &&
              error.response.data.message) ||
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
        {theme === "light" ? (
          <BoxVaultLight className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3" />
        ) : (
          <BoxVaultDark className="rounded mx-auto d-block img-fluid w-50 mt-5 mb-3" />
        )}
        <h2 className="fs-1 text-center mt-4">BoxVault</h2>

        {organizationName && (
          <div className="alert alert-info text-center">
            {t("register.joiningOrganization", { ns: "auth" })}{" "}
            <strong>{organizationName}</strong>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!status?.success && (
            <div>
              {!methodsLoading && authMethods.length > 1 && (
                <div className="form-group">
                  <label htmlFor="authMethod">Authentication Method</label>
                  <select
                    className="form-control"
                    name="authMethod"
                    value={authMethod}
                    onChange={(e) => setAuthMethod(e.target.value)}
                  >
                    {authMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                      </option>
                    ))}
                  </select>
                  <small className="form-text text-muted">
                    {authMethod.startsWith("oidc-")
                      ? "You will be redirected to authenticate with your identity provider"
                      : "Create a local BoxVault account"}
                  </small>
                </div>
              )}

              {authMethod.startsWith("oidc-") && (
                <div className="alert alert-info">
                  <p className="mb-0">
                    Click the button below to register using your
                    organization&apos;s identity provider.
                  </p>
                </div>
              )}

              {!authMethod.startsWith("oidc-") && (
                <>
                  <div className="form-group">
                    <label htmlFor="username">
                      {t("register.username", { ns: "auth" })}
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      name="username"
                      value={formValues.username}
                      onChange={handleInputChange}
                    />
                    {validationErrors.username && (
                      <div className="alert alert-danger">
                        {validationErrors.username}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">
                      {t("register.email", { ns: "auth" })}
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      name="email"
                      value={formValues.email}
                      onChange={handleInputChange}
                    />
                    {validationErrors.email && (
                      <div className="alert alert-danger">
                        {validationErrors.email}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="password">
                      {t("register.password", { ns: "auth" })}
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      name="password"
                      value={formValues.password}
                      onChange={handleInputChange}
                    />
                    {validationErrors.password && (
                      <div className="alert alert-danger">
                        {validationErrors.password}
                      </div>
                    )}
                  </div>

                  <div className="d-grid gap-2 col-6 mx-auto mt-3">
                    <button
                      type="submit"
                      className="btn btn-primary btn-block"
                      disabled={isSubmitting}
                    >
                      {authMethod.startsWith("oidc-")
                        ? authMethods.find((m) => m.id === authMethod)?.name ||
                          "Continue with SSO"
                        : t("register.signUpButton", { ns: "auth" })}
                    </button>
                  </div>
                </>
              )}
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

Register.propTypes = {
  theme: PropTypes.string.isRequired,
};

export default Register;
