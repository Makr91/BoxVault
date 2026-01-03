import PropTypes from "prop-types";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import ConfirmationModal from "./confirmation.component";

/**
 * OidcProviderManager - Manages OIDC authentication providers
 */
const OidcProviderManager = ({
  config,
  onConfigUpdate,
  setMessage,
  setMessageType,
}) => {
  const { t } = useTranslation();
  const [showOidcProviderModal, setShowOidcProviderModal] = useState(false);
  const [oidcProviderForm, setOidcProviderForm] = useState({
    name: "",
    displayName: "",
    issuer: "",
    clientId: "",
    clientSecret: "",
    scope: "openid profile email",
    responseType: "code",
    enabled: true,
  });
  const [oidcProviderLoading, setOidcProviderLoading] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState(null);

  const resetOidcProviderForm = () => {
    setOidcProviderForm({
      name: "",
      displayName: "",
      issuer: "",
      clientId: "",
      clientSecret: "",
      scope: "openid profile email",
      responseType: "code",
      enabled: true,
    });
  };

  const handleOidcProviderFormChange = (field, value) => {
    setOidcProviderForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleEditProvider = (providerName, providerConfig) => {
    setEditingProvider(providerName);
    setOidcProviderForm({
      name: providerName,
      displayName: providerConfig.display_name?.value || "",
      issuer: providerConfig.issuer?.value || "",
      clientId: providerConfig.client_id?.value || "",
      clientSecret: providerConfig.client_secret?.value || "",
      scope: providerConfig.scope?.value || "openid profile email",
      responseType: providerConfig.response_type?.value || "code",
      enabled:
        providerConfig.enabled?.value !== undefined
          ? providerConfig.enabled.value
          : false,
    });
    setShowOidcProviderModal(true);
  };

  // Validation helper
  const validateProviderForm = (formData) => {
    const { name, displayName, issuer, clientId, clientSecret } = formData;

    if (!name || !displayName || !issuer || !clientId || !clientSecret) {
      return t("oidc.errors.requiredFields");
    }

    if (!/^[a-z0-9_]+$/i.test(name)) {
      return t("oidc.errors.invalidName");
    }

    if (config.auth?.oidc?.providers?.[name] && !editingProvider) {
      return t("oidc.errors.providerExists", { name });
    }

    return null;
  };

  const addOidcProvider = async (e) => {
    e.preventDefault();
    const {
      name,
      displayName,
      issuer,
      clientId,
      clientSecret,
      scope,
      responseType,
      enabled,
    } = oidcProviderForm;

    // Validate form
    const validationError = validateProviderForm(oidcProviderForm);
    if (validationError) {
      setMessage(validationError);
      setMessageType("danger");
      return;
    }

    try {
      setOidcProviderLoading(true);
      setMessage(
        editingProvider
          ? t("oidc.messages.updating")
          : t("oidc.messages.adding")
      );
      setMessageType("info");

      const newConfig = { ...config };
      if (!newConfig.auth) {
        newConfig.auth = {};
      }
      if (!newConfig.auth.oidc) {
        newConfig.auth.oidc = {};
      }
      if (!newConfig.auth.oidc.providers) {
        newConfig.auth.oidc.providers = {};
      }

      newConfig.auth.oidc.providers[name] = {
        enabled: {
          type: "boolean",
          value: enabled,
          description: `Enable ${displayName} OIDC authentication`,
        },
        display_name: {
          type: "string",
          value: displayName,
          description: "Display name shown on login button",
        },
        issuer: {
          type: "string",
          value: issuer,
          description: `${displayName} OIDC issuer URL`,
        },
        client_id: {
          type: "string",
          value: clientId,
          description: `${displayName} OAuth Client ID`,
        },
        client_secret: {
          type: "password",
          value: clientSecret,
          description: `${displayName} OAuth Client Secret`,
        },
        scope: {
          type: "string",
          value: scope,
          description: "OAuth scopes to request",
        },
        response_type: {
          type: "select",
          value: responseType,
          options: ["code", "id_token", "code id_token"],
          description: "OAuth 2.0 response type",
        },
        prompt: {
          type: "string",
          value: "",
          description: "Optional prompt parameter",
        },
      };

      await onConfigUpdate(newConfig);
      setMessage(
        t("oidc.messages.success", {
          displayName,
          action: editingProvider
            ? t("oidc.actions.updated")
            : t("oidc.actions.added"),
        })
      );
      setMessageType("success");
      setShowOidcProviderModal(false);
      setEditingProvider(null);
      resetOidcProviderForm();
    } catch (error) {
      const action = editingProvider
        ? t("oidc.actions.updating")
        : t("oidc.actions.adding");
      setMessage(
        t("oidc.errors.apiError", {
          action,
          error: error.response?.data?.message || error.message,
        })
      );
      setMessageType("danger");
    } finally {
      setOidcProviderLoading(false);
    }
  };

  const handleDeleteClick = (providerName) => {
    setProviderToDelete(providerName);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setProviderToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!providerToDelete) {
      return;
    }

    try {
      setMessage(t("oidc.messages.deleting"));
      setMessageType("info");

      const newConfig = { ...config };
      if (newConfig.auth?.oidc?.providers) {
        delete newConfig.auth.oidc.providers[providerToDelete];
      }

      await onConfigUpdate(newConfig);
      setMessage(
        t("oidc.messages.deleteSuccess", { providerName: providerToDelete })
      );
      setMessageType("success");
    } catch (error) {
      setMessage(
        t("oidc.errors.deleteError", {
          error: error.response?.data?.message || error.message,
        })
      );
      setMessageType("danger");
    } finally {
      handleCloseDeleteModal();
    }
  };

  const providers = config.auth?.oidc?.providers || {};

  return (
    <>
      <div className="card mb-4">
        <div
          className="card-header d-flex justify-content-between align-items-center"
          role="button"
          tabIndex={0}
          onClick={() => {
            /* Could add collapse functionality */
          }}
          onKeyPress={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              /* Could add collapse functionality */
            }
          }}
        >
          <h6 className="mb-0">
            <i className="fas fa-shield-alt me-2" />
            {t("oidc.title")}
            <span className="badge bg-light text-dark ms-2">
              {t("oidc.providerCount", {
                count: Object.keys(providers).length,
              })}
            </span>
          </h6>
          <button
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setEditingProvider(null);
              resetOidcProviderForm();
              setShowOidcProviderModal(true);
            }}
          >
            <i className="fas fa-plus me-1" />
            {t("oidc.buttons.add")}
          </button>
        </div>
        <div className="card-body">
          <p className="text-muted mb-3">{t("oidc.description")}</p>

          {Object.keys(providers).length > 0 ? (
            <div className="row">
              {Object.entries(providers).map(
                ([providerName, providerConfig]) => (
                  <div key={providerName} className="col-md-6 mb-3">
                    <div
                      className="card border-secondary cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        handleEditProvider(providerName, providerConfig)
                      }
                      onKeyPress={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          handleEditProvider(providerName, providerConfig);
                        }
                      }}
                    >
                      <div className="card-header">
                        <h6 className="mb-0">
                          <i className="fab fa-openid me-2" />
                          {providerConfig.display_name?.value || providerName}
                          {providerConfig.enabled?.value && (
                            <span className="badge bg-success ms-2">
                              {t("oidc.enabled")}
                            </span>
                          )}
                        </h6>
                      </div>
                      <div className="card-body">
                        <small className="text-muted">
                          <strong>{t("oidc.issuer")}:</strong>{" "}
                          {providerConfig.issuer?.value}
                          <br />
                          <strong>{t("oidc.clientId")}:</strong>{" "}
                          {providerConfig.client_id?.value}
                          <br />
                          <strong>{t("oidc.scope")}:</strong>{" "}
                          {providerConfig.scope?.value}
                        </small>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="alert alert-info">
              <i className="fas fa-info-circle me-2" />
              {t("oidc.noProvidersConfigured")}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit OIDC Provider Modal */}
      {showOidcProviderModal && (
        <div className="modal show d-block modal-backdrop-custom" tabIndex="-1">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fab fa-openid me-2" />
                  {editingProvider
                    ? t("oidc.modal.editTitle")
                    : t("oidc.modal.addTitle")}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowOidcProviderModal(false);
                    setEditingProvider(null);
                  }}
                />
              </div>
              <form onSubmit={addOidcProvider}>
                <div className="modal-body">
                  <p className="text-muted mb-4">
                    {t("oidc.modal.description")}
                  </p>

                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="providerName">
                          {t("oidc.form.name.label")}{" "}
                          <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          id="providerName"
                          placeholder="e.g., mycompany, enterprise, provider1"
                          value={oidcProviderForm.name}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "name",
                              e.target.value.toLowerCase()
                            )
                          }
                          disabled={oidcProviderLoading || editingProvider}
                          required
                        />
                        <small className="form-text text-muted">
                          {t("oidc.form.name.hint")}
                        </small>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="displayName">
                          {t("oidc.form.displayName.label")}{" "}
                          <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          id="displayName"
                          placeholder="e.g., Sign in with Company SSO"
                          value={oidcProviderForm.displayName}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "displayName",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                          required
                        />
                        <small className="form-text text-muted">
                          {t("oidc.form.displayName.hint")}
                        </small>
                      </div>
                    </div>

                    <div className="col-md-12">
                      <div className="form-group mb-3">
                        <label htmlFor="issuer">
                          {t("oidc.form.issuer.label")}{" "}
                          <span className="text-danger">*</span>
                        </label>
                        <input
                          type="url"
                          className="form-control"
                          id="issuer"
                          placeholder="https://your-provider.com or https://your-domain.auth0.com"
                          value={oidcProviderForm.issuer}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "issuer",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                          required
                        />
                        <small className="form-text text-muted">
                          {t("oidc.form.issuer.hint")}
                        </small>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="clientId">
                          {t("oidc.form.clientId.label")}{" "}
                          <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          id="clientId"
                          placeholder="Your OAuth client ID"
                          value={oidcProviderForm.clientId}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "clientId",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                          required
                        />
                        <small className="form-text text-muted">
                          {t("oidc.form.clientId.hint")}
                        </small>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="clientSecret">
                          {t("oidc.form.clientSecret.label")}{" "}
                          <span className="text-danger">*</span>
                        </label>
                        <input
                          type="password"
                          className="form-control"
                          id="clientSecret"
                          placeholder="Your OAuth client secret"
                          value={oidcProviderForm.clientSecret}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "clientSecret",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                          required
                        />
                        <small className="form-text text-muted">
                          {t("oidc.form.clientSecret.hint")}
                        </small>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="scope">
                          {t("oidc.form.scope.label")}
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          id="scope"
                          value={oidcProviderForm.scope}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "scope",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                        />
                        <small className="form-text text-muted">
                          {t("oidc.form.scope.hint")}
                        </small>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="form-group mb-3">
                        <label htmlFor="responseType">
                          {t("oidc.form.responseType.label")}
                        </label>
                        <select
                          className="form-control"
                          id="responseType"
                          value={oidcProviderForm.responseType}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "responseType",
                              e.target.value
                            )
                          }
                          disabled={oidcProviderLoading}
                        >
                          <option value="code">
                            {t("oidc.form.responseType.options.code")}
                          </option>
                          <option value="id_token">
                            {t("oidc.form.responseType.options.id_token")}
                          </option>
                          <option value="code id_token">
                            {t("oidc.form.responseType.options.code_id_token")}
                          </option>
                        </select>
                        <small className="form-text text-muted">
                          {t("oidc.form.responseType.hint")}
                        </small>
                      </div>
                    </div>

                    <div className="col-md-12">
                      <div className="form-check">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="enabled"
                          checked={oidcProviderForm.enabled}
                          onChange={(e) =>
                            handleOidcProviderFormChange(
                              "enabled",
                              e.target.checked
                            )
                          }
                          disabled={oidcProviderLoading}
                        />
                        <label className="form-check-label" htmlFor="enabled">
                          {t("oidc.form.enabled.label")}
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="alert alert-info mt-3">
                    <h6>{t("oidc.instructions.title")}</h6>
                    <ol className="mb-0">
                      <li>{t("oidc.instructions.step1")}</li>
                      <li>
                        {t("oidc.instructions.step2")}{" "}
                        <code>
                          https://your-domain.com/api/auth/oidc/callback
                        </code>{" "}
                        {t("oidc.instructions.step2_cont")}
                      </li>
                      <li>{t("oidc.instructions.step3")}</li>
                      <li>{t("oidc.instructions.step4")}</li>
                      <li>{t("oidc.instructions.step5")}</li>
                    </ol>
                  </div>
                </div>
                <div className="modal-footer">
                  {editingProvider && (
                    <button
                      type="button"
                      className="btn btn-danger me-auto"
                      onClick={() => {
                        setShowOidcProviderModal(false);
                        setEditingProvider(null);
                        handleDeleteClick(editingProvider);
                      }}
                      disabled={oidcProviderLoading}
                    >
                      <i className="fas fa-trash me-1" />
                      {t("oidc.buttons.delete")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowOidcProviderModal(false);
                      setEditingProvider(null);
                    }}
                    disabled={oidcProviderLoading}
                  >
                    {t("buttons.cancel")}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={oidcProviderLoading}
                  >
                    {oidcProviderLoading && (
                      <span className="spinner-border spinner-border-sm me-2" />
                    )}
                    {(() => {
                      if (oidcProviderLoading) {
                        return editingProvider
                          ? t("oidc.buttons.updating")
                          : t("oidc.buttons.adding");
                      }
                      return editingProvider
                        ? t("oidc.buttons.update")
                        : t("oidc.buttons.add");
                    })()}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={handleConfirmDelete}
        title={t("oidc.deleteModal.title")}
        message={t("oidc.deleteModal.message", {
          providerName: providerToDelete,
        })}
      />
    </>
  );
};

OidcProviderManager.propTypes = {
  config: PropTypes.object.isRequired,
  onConfigUpdate: PropTypes.func.isRequired,
  setMessage: PropTypes.func.isRequired,
  setMessageType: PropTypes.func.isRequired,
};

export default OidcProviderManager;
