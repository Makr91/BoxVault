import PropTypes from "prop-types";
import { useState, useEffect, useRef } from "react";
import { Table } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, Link } from "react-router-dom";

import ArchitectureService from "../services/architecture.service";
import AuthService from "../services/auth.service";
import BoxDataService from "../services/box.service";
import FileService from "../services/file.service";
import ProviderService from "../services/provider.service";
import VersionDataService from "../services/version.service";
import { log } from "../utils/Logger";

import ConfirmationModal from "./confirmation.component";

const Box = ({ theme }) => {
  const { t } = useTranslation();
  const { organization, name } = useParams();
  const [versions, setVersions] = useState([]);
  const [originalName, setOriginalName] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState(null);
  const navigate = useNavigate();
  log.component.debug("Box component theme", { theme });
  const initialBoxState = {
    id: null,
    name: "",
    description: "",
    published: false,
    isPublic: false,
    userId: null,
    organization: null,
    githubRepo: "",
    workflowFile: "",
    cicdUrl: "",
  };

  const [currentUser, setCurrentUser] = useState(null);
  const [currentBox, setCurrentBox] = useState(initialBoxState);
  const [boxOrganization, setBoxOrganization] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showAddVersionForm, setShowAddVersionForm] = useState(false);
  const [newVersion, setNewVersion] = useState({
    versionNumber: "",
    description: "",
  });
  const [providers, setProviders] = useState({});
  const [allVersions, setAllVersions] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [isAuthorized, setIsAuthorized] = useState(false);

  const form = useRef();

  const required = (value) => (value ? undefined : t("validation.required"));

  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  const validateName = (value) =>
    validCharsRegex.test(value) ? undefined : t("validation.invalidName");

  const deleteFilesForArchitecture = async (
    providerName,
    versionNumber,
    architectureName
  ) => {
    await FileService.delete(
      currentUser.organization,
      currentBox.name,
      versionNumber,
      providerName,
      architectureName
    ).catch((e) => {
      log.file.error("Error deleting files for architecture", {
        architectureName,
        error: e.message,
      });
      throw e;
    });
  };

  const deleteArchitecturesForProvider = async (
    providerName,
    versionNumber
  ) => {
    const architectures = await ArchitectureService.getArchitectures(
      currentUser.organization,
      currentBox.name,
      versionNumber,
      providerName
    );
    for (const architecture of architectures.data) {
      log.component.debug("Deleting architecture", {
        architectureName: architecture.name,
        provider: providerName,
      });
      // eslint-disable-next-line no-await-in-loop
      await deleteFilesForArchitecture(
        providerName,
        versionNumber,
        architecture.name
      );
      // eslint-disable-next-line no-await-in-loop
      await ArchitectureService.deleteArchitecture(
        currentUser.organization,
        currentBox.name,
        versionNumber,
        providerName,
        architecture.name
      ).catch((e) => {
        log.component.error("Error deleting architecture", {
          architectureName: architecture.name,
          error: e.message,
        });
        throw e;
      });
    }
  };

  const deleteProvidersForVersion = async (versionNumber) => {
    const versionProviders = await ProviderService.getProviders(
      currentUser.organization,
      currentBox.name,
      versionNumber
    );
    for (const provider of versionProviders.data) {
      log.component.debug("Deleting provider", {
        providerName: provider.name,
        version: versionNumber,
      });
      // eslint-disable-next-line no-await-in-loop
      await deleteArchitecturesForProvider(provider.name, versionNumber);
      // eslint-disable-next-line no-await-in-loop
      await ProviderService.deleteProvider(
        currentUser.organization,
        currentBox.name,
        versionNumber,
        provider.name
      ).catch((e) => {
        log.component.error("Error deleting provider", {
          providerName: provider.name,
          error: e.message,
        });
        throw e;
      });
    }
  };

  const deleteVersion = async (versionNumber) => {
    try {
      await deleteProvidersForVersion(versionNumber);
      await VersionDataService.deleteVersion(
        currentUser.organization,
        currentBox.name,
        versionNumber
      );
      setMessage(t("version.deleted"));
      setMessageType("success");
      setVersions(
        versions.filter((version) => version.versionNumber !== versionNumber)
      );
    } catch (e) {
      log.component.error("Error deleting version", {
        versionNumber,
        error: e.message,
      });
      const errorMessage =
        e.response && e.response.data && e.response.data.message
          ? e.response.data.message
          : t("version.deleteError");
      setMessage(errorMessage);
      setMessageType("danger");
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const user = AuthService.getCurrentUser();
      if (user) {
        setCurrentUser(user);
        setIsAuthorized(user.organization === organization);
      }

      if (name) {
        try {
          const boxResponse = await BoxDataService.get(organization, name);
          const boxData = boxResponse.data;
          setCurrentBox(boxData);
          setOriginalName(boxData.name);

          // Set document title
          document.title = boxData.name;

          if (boxData.user && boxData.user.organization) {
            setBoxOrganization(boxData.user.organization.name);
          }

          if (
            boxData.isPublic ||
            (user && user.organization === organization)
          ) {
            const versionsResponse = await VersionDataService.getVersions(
              organization,
              name
            );
            setVersions(versionsResponse.data);
            setAllVersions(versionsResponse.data);

            versionsResponse.data.forEach((version) => {
              ProviderService.getProviders(
                organization,
                name,
                version.versionNumber
              )
                .then((providerResponse) => {
                  setProviders((prev) => ({
                    ...prev,
                    [version.versionNumber]: providerResponse.data,
                  }));
                })
                .catch((e) => {
                  log.api.error("Error fetching providers", {
                    versionNumber: version.versionNumber,
                    error: e.message,
                  });
                });
            });
          } else {
            setMessage(t("box.notFound"));
            setMessageType("danger");
          }
        } catch (e) {
          log.api.error("Error loading box data", {
            organization,
            boxName: name,
            error: e.message,
          });
          setMessage(t("box.notFound"));
          setMessageType("danger");
        }
      }
    };

    loadData();
  }, [organization, name, t]);

  // Update title when box name changes (e.g., after edit)
  useEffect(() => {
    if (currentBox.name) {
      document.title = currentBox.name;
    }
  }, [currentBox.name]);

  const convertFieldValue = (fieldName, value) => {
    if (fieldName === "isPublic") {
      return value === "true" ? 1 : 0;
    }
    return value;
  };

  const handleInputChange = (event) => {
    const { name: fieldName, value } = event.target;
    setCurrentBox({
      ...currentBox,
      [fieldName]: convertFieldValue(fieldName, value),
    });
    setNewVersion({ ...newVersion, [fieldName]: value });

    if (fieldName === "name") {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, name: error });
    }

    if (fieldName === "versionNumber") {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, versionNumber: error });
    }
  };

  const updateRelease = (status) => {
    const data = {
      id: currentBox.id,
      name: currentBox.name,
      isPublic: currentBox.isPublic,
      description: currentBox.description,
      published: status,
    };

    BoxDataService.update(currentUser.organization, currentBox.name, data).then(
      (response) => {
        setCurrentBox({ ...currentBox, published: status });
        log.api.debug("Box release status updated", {
          boxName: currentBox.name,
          published: status,
          response: response.data,
        });
      }
    );
  };

  const updateBox = () => {
    if (currentBox.name !== originalName) {
      const boxExists = allVersions.some((v) => v.name === currentBox.name);
      if (boxExists) {
        setMessage(t("box.exists"));
        setMessageType("danger");
        return;
      }
    }

    BoxDataService.update(currentUser.organization, originalName, currentBox)
      .then(() => {
        setMessage(t("box.updated"));
        setMessageType("success");
        setEditMode(false);

        if (originalName !== currentBox.name) {
          navigate(`/${currentUser.organization}/${currentBox.name}`);
        }
      })
      .catch((e) => {
        log.api.error("Error updating box", {
          boxName: currentBox.name,
          error: e.message,
        });
        if (e.response && e.response.data && e.response.data.message) {
          setMessage(e.response.data.message);
        } else {
          setMessage(t("box.updateError"));
        }
        setMessageType("danger");
      });
  };

  const deleteBox = () => {
    BoxDataService.remove(currentUser.organization, currentBox.name)
      .then((response) => {
        log.api.debug("Box deleted successfully", {
          boxName: currentBox.name,
          response: response.data,
        });
        navigate(`/${currentUser.organization}`);
      })
      .catch((e) => {
        log.api.error("Error deleting box", {
          boxName: currentBox.name,
          error: e.message,
        });
        setMessage(t("box.deleteError"));
        setMessageType("danger");
      });
  };

  const cancelEdit = () => {
    setEditMode(false);
    setCurrentBox({ ...currentBox, name: originalName });
    setValidationErrors({});
  };

  const addVersion = (event) => {
    event.preventDefault();

    const versionNumberError =
      required(newVersion.versionNumber) ||
      validateName(newVersion.versionNumber);
    if (versionNumberError) {
      setMessage(versionNumberError);
      setMessageType("danger");
      return;
    }

    const versionExists = versions.some(
      (v) => v.versionNumber === newVersion.versionNumber
    );
    if (versionExists) {
      setMessage(t("version.exists"));
      setMessageType("danger");
      return;
    }

    VersionDataService.createVersion(
      currentUser.organization,
      currentBox.name,
      newVersion
    )
      .then((response) => {
        setMessage(t("version.added"));
        setMessageType("success");
        setVersions([...versions, response.data]);
        setShowAddVersionForm(false);
        setNewVersion({ versionNumber: "", description: "" });
      })
      .catch((e) => {
        if (e.response && e.response.data && e.response.data.message) {
          setMessage(e.response.data.message);
        } else {
          setMessage(t("version.addError"));
        }
        setMessageType("danger");
      });
  };

  const handleDeleteClick = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleConfirmDelete = () => {
    deleteBox();
  };

  const handleVersionDeleteClick = (versionNumber) => {
    setVersionToDelete(versionNumber);
    setShowVersionModal(true);
  };

  const handleCloseVersionModal = () => {
    setShowVersionModal(false);
    setVersionToDelete(null);
  };

  const handleConfirmVersionDelete = () => {
    if (versionToDelete) {
      deleteVersion(versionToDelete);
      handleCloseVersionModal();
    }
  };

  const renderBackButton = () => (
    <Link className="btn btn-dark me-2" to={`/${boxOrganization}`}>
      {t("actions.backToFiles")}
    </Link>
  );

  const renderCicdIntegration = () => {
    if (
      !currentBox.githubRepo &&
      !currentBox.workflowFile &&
      !currentBox.cicdUrl
    ) {
      return null;
    }

    return (
      <div className="mt-3">
        <h5>
          <strong>{t("box.cicd.title")}</strong>
        </h5>
        {currentBox.githubRepo && currentBox.workflowFile && (
          <div className="mb-2">
            <p>
              <strong>{t("box.cicd.buildStatus")}:</strong>
            </p>
            <a
              href={
                currentBox.cicdUrl ||
                `https://github.com/${currentBox.githubRepo}/actions`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={`https://github.com/${currentBox.githubRepo}/actions/workflows/${currentBox.workflowFile}/badge.svg`}
                alt={t("box.cicd.buildStatus")}
                className="badge-max-height"
              />
            </a>
          </div>
        )}
        {currentBox.githubRepo && (
          <p>
            <strong>{t("box.cicd.repository")}:</strong>
            <a
              href={`https://github.com/${currentBox.githubRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ms-2"
            >
              {currentBox.githubRepo}
            </a>
          </p>
        )}
        {currentBox.workflowFile && (
          <p>
            <strong>{t("box.cicd.workflow")}:</strong> {currentBox.workflowFile}
          </p>
        )}
        {currentBox.cicdUrl && (
          <p>
            <strong>{t("box.cicd.pipeline")}:</strong>
            <a
              href={currentBox.cicdUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ms-2"
            >
              {t("box.cicd.viewPipeline")}
            </a>
          </p>
        )}
      </div>
    );
  };

  const renderPublishButton = () => {
    if (currentBox.published) {
      return (
        <button
          className="btn btn-warning me-2"
          onClick={() => updateRelease(false)}
        >
          {t("box.unpublish")}
        </button>
      );
    }

    if (currentBox.id) {
      return (
        <button
          className="btn btn-outline-primary me-2"
          onClick={() => updateRelease(true)}
          disabled={!!validationErrors.name}
        >
          {t("box.publish")}
        </button>
      );
    }

    return null;
  };

  const renderEditForm = () => (
    <div className="edit-form">
      <form ref={form}>
        <div className="mb-1">
          <strong>{t("box.name")}:</strong>
        </div>
        <div className="form-group row align-items-center">
          <div className="col-auto pe-0">
            <input
              type="text"
              className="form-control"
              id="organization"
              name="organization"
              value={currentUser ? currentUser.organization : ""}
              onChange={handleInputChange}
              disabled
            />
          </div>
          <div className="col-auto px-1">
            <span className="font-size-xl font-weight-bolder">/</span>
          </div>
          <div className="col-auto ps-0">
            <input
              type="text"
              className="form-control"
              id="name"
              name="name"
              value={currentBox.name}
              onChange={handleInputChange}
              required
            />
          </div>
        </div>
        {validationErrors.name && (
          <div className="text-danger">{validationErrors.name}</div>
        )}
        <small className="form-text text-muted">
          {t("box.shortDescription")}
        </small>
        <div className="form-group mt-2">
          <label htmlFor="boxStatus">
            <strong>{t("box.status")}: </strong>
          </label>
          {currentBox.published ? t("status.completed") : t("status.pending")}
        </div>
        <div className="form-group mt-2">
          <label htmlFor="boxVisibility">
            <strong>{t("box.visibility")}:</strong>
          </label>
          <div className="d-flex">
            <div className="form-check me-3">
              <input
                type="radio"
                className="form-check-input"
                id="visibilityPrivate"
                name="isPublic"
                value="false"
                checked={!currentBox.isPublic}
                onChange={handleInputChange}
              />
              <label className="form-check-label" htmlFor="visibilityPrivate">
                {t("box.organization.visibility.private")}
              </label>
            </div>
            <div className="form-check">
              <input
                type="radio"
                className="form-check-input"
                id="visibilityPublic"
                name="isPublic"
                value="true"
                checked={currentBox.isPublic}
                onChange={handleInputChange}
              />
              <label className="form-check-label" htmlFor="visibilityPublic">
                {t("box.organization.visibility.public")}
              </label>
            </div>
          </div>
          <small className="form-text text-muted">
            {t("box.visibilityHint")}
          </small>
        </div>
        <div className="form-group mt-2">
          <label className="mb-1" htmlFor="description">
            <strong>{t("box.description")}:</strong> {t("box.optional")}
          </label>
          <textarea
            className="form-control"
            id="description"
            required
            value={currentBox.description}
            onChange={handleInputChange}
            name="description"
            rows="4"
            placeholder={t("box.shortDescription")}
          />
        </div>
        <div className="form-group mt-3">
          <h5>
            <strong>{t("box.cicd.title")}</strong> {t("box.optional")}
          </h5>
          <small className="form-text text-muted mb-3">
            {t("box.cicd.connect")}
          </small>
          <div className="form-group mt-2">
            <label className="mb-1" htmlFor="githubRepo">
              <strong>{t("box.cicd.repository")}:</strong> {t("box.optional")}
            </label>
            <input
              type="text"
              className="form-control"
              id="githubRepo"
              name="githubRepo"
              value={currentBox.githubRepo || ""}
              onChange={handleInputChange}
              placeholder={t("box.cicd.repositoryPlaceholder")}
            />
            <small className="form-text text-muted">
              {t("box.cicd.repositoryHint")}
            </small>
          </div>
          <div className="form-group mt-2">
            <label className="mb-1" htmlFor="workflowFile">
              <strong>{t("box.cicd.workflow")}:</strong> {t("box.optional")}
            </label>
            <input
              type="text"
              className="form-control"
              id="workflowFile"
              name="workflowFile"
              value={currentBox.workflowFile || ""}
              onChange={handleInputChange}
              placeholder={t("box.cicd.workflowPlaceholder")}
            />
            <small className="form-text text-muted">
              {t("box.cicd.workflowHint")}
            </small>
          </div>
          <div className="form-group mt-2">
            <label className="mb-1" htmlFor="cicdUrl">
              <strong>{t("box.cicd.pipelineUrl")}:</strong> {t("box.optional")}
            </label>
            <input
              type="url"
              className="form-control"
              id="cicdUrl"
              name="cicdUrl"
              value={currentBox.cicdUrl || ""}
              onChange={handleInputChange}
              placeholder={t("box.cicd.pipelinePlaceholder")}
            />
            <small className="form-text text-muted">
              {t("box.cicd.pipelineHint")}
            </small>
          </div>
        </div>
      </form>
    </div>
  );

  const renderActionButtons = () => (
    <>
      {editMode ? (
        <>
          <button
            type="submit"
            className="btn btn-success me-2"
            onClick={updateBox}
            disabled={!!validationErrors.name}
          >
            {t("buttons.save")}
          </button>
          <button className="btn btn-secondary me-2" onClick={cancelEdit}>
            {t("buttons.cancel")}
          </button>
        </>
      ) : (
        <button
          className="btn btn-primary me-2"
          onClick={() => setEditMode(true)}
        >
          {t("buttons.edit")}
        </button>
      )}
      {currentBox.id && !editMode && (
        <button className="btn btn-danger me-2" onClick={handleDeleteClick}>
          {t("buttons.delete")}
        </button>
      )}
      <ConfirmationModal
        show={showModal}
        handleClose={handleCloseModal}
        handleConfirm={handleConfirmDelete}
      />
      {renderPublishButton()}
    </>
  );

  return (
    <div className="list row">
      {message && (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      )}
      {currentBox.id ? (
        <>
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4>{t("box.details")}</h4>
              <div>
                {isAuthorized && renderActionButtons()}
                {renderBackButton()}
              </div>
            </div>
            {editMode ? (
              renderEditForm()
            ) : (
              <div>
                <p>
                  <strong>{t("box.name")}:</strong> {currentBox.name}
                </p>
                <p>
                  <strong>{t("box.status")}:</strong>{" "}
                  {currentBox.published
                    ? t("status.completed")
                    : t("status.pending")}
                </p>
                <p>
                  <strong>{t("box.visibility")}:</strong>{" "}
                  {currentBox.isPublic
                    ? t("box.organization.visibility.public")
                    : t("box.organization.visibility.private")}
                </p>
                <p>
                  <strong>{t("box.description")}:</strong>{" "}
                  {currentBox.description}
                </p>
                {renderCicdIntegration()}
              </div>
            )}
          </div>
          <div className="list-table">
            <div className="d-flex justify-content-between align-items-center">
              <h4>{t("box.versions", { name: currentBox.name })}</h4>
              {isAuthorized && (
                <div>
                  <button
                    className={`btn ${showAddVersionForm ? "btn-secondary" : "btn-outline-success"} me-2`}
                    onClick={() => setShowAddVersionForm(!showAddVersionForm)}
                  >
                    {showAddVersionForm
                      ? t("buttons.cancel")
                      : t("version.add")}
                  </button>
                  {showAddVersionForm && (
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={addVersion}
                      disabled={
                        !newVersion.versionNumber ||
                        !!validationErrors.versionNumber
                      }
                    >
                      {t("buttons.save")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {showAddVersionForm && (
            <div>
              <form onSubmit={addVersion} ref={form}>
                <div className="form-group col-md-3">
                  <label htmlFor="versionNumber">{t("version.number")}</label>
                  <input
                    type="text"
                    className="form-control"
                    id="versionNumber"
                    name="versionNumber"
                    value={newVersion.versionNumber}
                    onChange={handleInputChange}
                    required
                  />
                  {validationErrors.versionNumber && (
                    <div className="text-danger">
                      {validationErrors.versionNumber}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="versionDescription">
                    {t("provider.description")}
                  </label>
                  <textarea
                    className="form-control"
                    id="versionDescription"
                    name="description"
                    value={newVersion.description}
                    onChange={handleInputChange}
                    rows="3"
                  />
                </div>
              </form>
            </div>
          )}

          <Table striped className="table">
            <thead>
              <tr>
                <th>{t("version.number")}</th>
                <th>{t("version.details")}</th>
                <th>
                  {t("version.providers", { version: "" }).replace(":", "")}
                </th>
                {isAuthorized && <th>{t("version.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id || version.versionNumber}>
                  <td>
                    <Link
                      to={`/${organization}/${name}/${version.versionNumber}`}
                    >
                      {version.versionNumber}
                    </Link>
                  </td>
                  <td>{version.description}</td>
                  <td>
                    {providers[version.versionNumber] &&
                      providers[version.versionNumber].map((provider) => (
                        <div key={provider.id || provider.name}>
                          <Link
                            to={`/${organization}/${name}/${version.versionNumber}/${provider.name}`}
                          >
                            {provider.name}
                          </Link>
                        </div>
                      ))}
                  </td>
                  {isAuthorized && (
                    <td>
                      <button
                        className="btn btn-danger"
                        onClick={() =>
                          handleVersionDeleteClick(version.versionNumber)
                        }
                      >
                        {t("buttons.delete")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
          <ConfirmationModal
            show={showVersionModal}
            handleClose={handleCloseVersionModal}
            handleConfirm={handleConfirmVersionDelete}
          />
        </>
      ) : (
        <div>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <button className="btn btn-dark me-2" onClick={() => navigate(`/`)}>
              {t("actions.backToFiles")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

Box.propTypes = {
  theme: PropTypes.string.isRequired,
};

export default Box;
