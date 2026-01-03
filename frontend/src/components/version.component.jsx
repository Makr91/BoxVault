import { useState, useEffect, useRef } from "react";
import Table from "react-bootstrap/Table";
import { useTranslation } from "react-i18next";
import { useParams, Link, useNavigate } from "react-router-dom";

import ArchitectureService from "../services/architecture.service";
import FileService from "../services/file.service";
import ProviderService from "../services/provider.service";
import VersionDataService from "../services/version.service";
import { log } from "../utils/Logger";

import ConfirmationModal from "./confirmation.component";

const Version = () => {
  const { t } = useTranslation();
  const { organization, name, version } = useParams();
  const navigate = useNavigate();

  const [providers, setProviders] = useState([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [currentVersion, setCurrentVersion] = useState({
    id: null,
    version: "",
    description: "",
    boxId: null,
    createdAt: "",
    updatedAt: "",
  });
  const [editMode, setEditMode] = useState(false);
  const [architectures, setArchitectures] = useState({});
  const [newProvider, setNewProvider] = useState({ name: "", description: "" });
  const [showAddProviderForm, setShowAddProviderForm] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [allVersions, setAllVersions] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const form = useRef();

  const required = (value) => (value ? undefined : t("validation.required"));

  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  const validateName = (value) =>
    validCharsRegex.test(value) ? undefined : t("validation.invalidName");

  const deleteFilesForArchitecture = (providerName, architectureName) =>
    FileService.delete(
      organization,
      name,
      version,
      providerName,
      architectureName
    ).catch((e) => {
      log.file.error("Error deleting files for architecture", {
        architectureName,
        error: e.message,
      });
      throw e;
    });

  const deleteArchitecturesForProvider = async (providerName) => {
    const architecturesToDelete = architectures[providerName] || [];
    for (const architecture of architecturesToDelete) {
      // eslint-disable-next-line no-await-in-loop
      await deleteFilesForArchitecture(providerName, architecture.name);
      // eslint-disable-next-line no-await-in-loop
      await ArchitectureService.deleteArchitecture(
        organization,
        name,
        version,
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

  const deleteProvider = async (providerName) => {
    try {
      await deleteArchitecturesForProvider(providerName);
      await ProviderService.deleteProvider(
        organization,
        name,
        version,
        providerName
      );
      setMessage(t("provider.deleted"));
      setMessageType("success");
      setProviders(
        providers.filter((provider) => provider.name !== providerName)
      );
    } catch (e) {
      log.component.error("Error deleting provider", {
        providerName,
        error: e.message,
      });
      setMessage(t("provider.deleteError"));
      setMessageType("danger");
    }
  };

  const deleteVersion = () => {
    VersionDataService.deleteVersion(organization, name, version)
      .then(() => {
        setMessage(t("version.deleted"));
        setMessageType("success");
        navigate(`/${organization}/${name}`);
      })
      .catch((e) => {
        log.component.error("Error deleting version", {
          versionNumber: version,
          error: e.message,
        });
      });
  };

  const handleProviderDeleteClick = (providerName) => {
    setItemToDelete({ type: "provider", name: providerName });
    setShowDeleteModal(true);
  };

  const handleVersionDeleteClick = () => {
    setItemToDelete({ type: "version", name: currentVersion.versionNumber });
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      if (itemToDelete.type === "provider") {
        deleteProvider(itemToDelete.name);
      } else if (itemToDelete.type === "version") {
        deleteVersion();
      }
      handleCloseDeleteModal();
    }
  };

  useEffect(() => {
    // Set document title
    document.title = `${name} v${version}`;

    const fetchData = async () => {
      // Check authorization
      const user = JSON.parse(localStorage.getItem("user"));
      const userAuthorized = user && user.organization === organization;
      setIsAuthorized(userAuthorized);

      try {
        const providerResponse = await ProviderService.getProviders(
          organization,
          name,
          version
        );
        setProviders(providerResponse.data);

        // Fetch architectures for all providers in parallel
        const architecturePromises = providerResponse.data.map(
          async (provider) => {
            try {
              const archResponse = await ArchitectureService.getArchitectures(
                organization,
                name,
                version,
                provider.name
              );
              const architecturesWithInfo = await Promise.all(
                archResponse.data.map(async (architecture) => {
                  try {
                    const downloadLink = await FileService.getDownloadLink(
                      organization,
                      name,
                      version,
                      provider.name,
                      architecture.name
                    );
                    return {
                      ...architecture,
                      downloadUrl: downloadLink,
                    };
                  } catch (e) {
                    log.api.error("Error fetching download link", {
                      architectureName: architecture.name,
                      error: e.message,
                    });
                    return {
                      ...architecture,
                      downloadUrl: null,
                    };
                  }
                })
              );
              return { providerName: provider.name, architecturesWithInfo };
            } catch (e) {
              log.api.error("Error fetching architectures", {
                providerName: provider.name,
                error: e.message,
              });
              return { providerName: provider.name, architecturesWithInfo: [] };
            }
          }
        );

        const results = await Promise.all(architecturePromises);
        const architecturesByProvider = {};
        results.forEach((result) => {
          architecturesByProvider[result.providerName] =
            result.architecturesWithInfo;
        });

        setArchitectures(architecturesByProvider);
      } catch (e) {
        log.api.error("Error fetching providers", {
          versionNumber: version,
          error: e.message,
        });
      }

      try {
        const versionResponse = await VersionDataService.getVersion(
          organization,
          name,
          version
        );
        setCurrentVersion(versionResponse.data);
      } catch (e) {
        log.api.error("Error fetching version", {
          versionNumber: version,
          error: e.message,
        });
        setCurrentVersion(null);
        setMessage(t("version.notFound"));
        setMessageType("danger");
      }

      try {
        const versionsResponse = await VersionDataService.getVersions(
          organization,
          name
        );
        setAllVersions(versionsResponse.data);
      } catch (e) {
        log.api.error("Error fetching all versions", {
          boxName: name,
          error: e.message,
        });
      }
    };

    fetchData();
  }, [organization, name, version, navigate, t]);

  const handleProviderInputChange = (event) => {
    const { name: fieldName, value } = event.target;
    setNewProvider({ ...newProvider, [fieldName]: value });

    // Validate the provider name field
    if (fieldName === "name") {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, providerName: error });
    }
  };

  const addProvider = async (event) => {
    event.preventDefault();

    if (required(newProvider.name) || validateName(newProvider.name)) {
      setMessage(t("validation.fixErrors"));
      setMessageType("danger");
      return;
    }

    const providerExists = providers.some(
      (provider) => provider.name === newProvider.name
    );
    if (providerExists) {
      setMessage(t("provider.exists"));
      setMessageType("danger");
      return;
    }

    try {
      const response = await ProviderService.createProvider(
        organization,
        name,
        version,
        newProvider
      );
      setMessage(t("provider.created"));
      setMessageType("success");
      setProviders([...providers, response.data]);
      setShowAddProviderForm(false);
      setNewProvider({ name: "", description: "" });
    } catch (e) {
      if (e.response && e.response.data && e.response.data.message) {
        setMessage(e.response.data.message);
      } else {
        setMessage(t("provider.createError"));
      }
      setMessageType("danger");
    }
  };

  const handleInputChange = (event) => {
    const { name: fieldName, value } = event.target;
    setCurrentVersion({ ...currentVersion, [fieldName]: value });

    // Validate the version number field
    if (fieldName === "versionNumber") {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, versionNumber: error });
    }
  };

  const saveVersion = async (event) => {
    event.preventDefault();

    // Check for validation errors
    if (validationErrors.versionNumber) {
      setMessage(validationErrors.versionNumber);
      setMessageType("danger");
      return;
    }

    // Check for duplicate version number, excluding the current version
    if (currentVersion.versionNumber !== version) {
      const versionExists = allVersions.some(
        (v) =>
          v.version === currentVersion.versionNumber &&
          v.id !== currentVersion.id
      );
      if (versionExists) {
        setMessage(t("version.exists"));
        setMessageType("danger");
        return;
      }
    }

    const data = {
      versionNumber: currentVersion.versionNumber,
      description: currentVersion.description,
    };

    try {
      await VersionDataService.updateVersion(organization, name, version, data);
      setMessage(t("version.updated"));
      setMessageType("success");
      setEditMode(false);

      if (version !== currentVersion.versionNumber) {
        navigate(`/${organization}/${name}/${currentVersion.versionNumber}`);
      }
    } catch (e) {
      if (e.response && e.response.data && e.response.data.message) {
        setMessage(e.response.data.message);
      } else {
        setMessage(t("version.updateError"));
      }
      setMessageType("danger");
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
  };

  return (
    <div className="list row">
      {message ? (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      ) : null}
      {currentVersion ? (
        <>
          <div className="mb-4">
            {editMode ? (
              <div>
                <form onSubmit={saveVersion} ref={form}>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4>{t("version.edit")}</h4>
                    <div>
                      <button
                        type="submit"
                        className="btn btn-success me-2"
                        disabled={!!validationErrors.versionNumber}
                      >
                        {t("buttons.save")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary me-2"
                        onClick={cancelEdit}
                      >
                        {t("buttons.cancel")}
                      </button>
                      <Link
                        className="btn btn-dark me-2"
                        to={`/${organization}/${name}`}
                      >
                        {t("actions.back")}
                      </Link>
                    </div>
                  </div>
                  <div className="form-group col-md-3">
                    <label htmlFor="versionNumber">{t("version.number")}</label>
                    <input
                      type="text"
                      className="form-control"
                      id="versionNumber"
                      value={currentVersion.versionNumber}
                      onChange={handleInputChange}
                      name="versionNumber"
                      required
                    />
                    {validationErrors.versionNumber ? (
                      <div className="text-danger">
                        {validationErrors.versionNumber}
                      </div>
                    ) : null}
                  </div>
                  <div className="form-group">
                    <label htmlFor="description">
                      {t("provider.description")}
                    </label>
                    <textarea
                      className="form-control"
                      id="description"
                      value={currentVersion.description}
                      onChange={handleInputChange}
                      name="description"
                    />
                  </div>
                </form>
              </div>
            ) : (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h4>{t("version.details")}</h4>
                  <div>
                    {isAuthorized ? (
                      <>
                        <button
                          className="btn btn-primary me-2"
                          onClick={() => setEditMode(true)}
                        >
                          {t("buttons.edit")}
                        </button>
                        <button
                          className="btn btn-danger me-2"
                          onClick={handleVersionDeleteClick}
                        >
                          {t("buttons.delete")}
                        </button>
                      </>
                    ) : null}
                    <Link
                      className="btn btn-dark me-2"
                      to={`/${organization}/${name}`}
                    >
                      {t("actions.backToFiles")}
                    </Link>
                  </div>
                </div>
                <p>
                  {t("version.number")}: {currentVersion.versionNumber}
                </p>
                <p>
                  {t("provider.description")}: {currentVersion.description}
                </p>
                <p>
                  {t("version.createdAt")}: {currentVersion.createdAt}
                </p>
                <p>
                  {t("version.updatedAt")}: {currentVersion.updatedAt}
                </p>
              </div>
            )}
          </div>
          <div className="list-table">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4>{t("version.providers", { version })}</h4>
              <div>
                {isAuthorized ? (
                  <>
                    <button
                      className={`btn ${showAddProviderForm ? "btn-secondary" : "btn-outline-success"} me-2`}
                      onClick={() =>
                        setShowAddProviderForm(!showAddProviderForm)
                      }
                    >
                      {showAddProviderForm
                        ? t("buttons.cancel")
                        : t("provider.add")}
                    </button>
                    {showAddProviderForm ? (
                      <button
                        type="submit"
                        className="btn btn-success me-2"
                        disabled={
                          !newProvider.name || !!validationErrors.providerName
                        }
                        onClick={addProvider}
                      >
                        {t("buttons.save")}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
            {showAddProviderForm ? (
              <form onSubmit={addProvider} ref={form}>
                <div className="add-provider-form">
                  <div className="form-group col-md-3">
                    <label htmlFor="providerName">{t("provider.name")}</label>
                    <input
                      type="text"
                      className="form-control"
                      id="providerName"
                      value={newProvider.name}
                      onChange={handleProviderInputChange}
                      name="name"
                      required
                    />
                    {validationErrors.providerName ? (
                      <div className="text-danger">
                        {validationErrors.providerName}
                      </div>
                    ) : null}
                  </div>
                  <div className="form-group">
                    <label htmlFor="providerDescription">
                      {t("provider.description")}
                    </label>
                    <textarea
                      className="form-control"
                      id="providerDescription"
                      value={newProvider.description}
                      onChange={handleProviderInputChange}
                      name="description"
                    />
                  </div>
                </div>
              </form>
            ) : null}
            <Table striped className="table">
              <thead>
                <tr>
                  <th>{t("provider.name")}</th>
                  <th>{t("provider.description")}</th>
                  <th>{t("buttons.download")}</th>
                  {isAuthorized ? <th>{t("buttons.delete")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.name}>
                    <td>
                      <Link
                        to={`/${organization}/${name}/${version}/${provider.name}`}
                      >
                        {provider.name}
                      </Link>
                    </td>
                    <td>{provider.description}</td>
                    <td>
                      {architectures[provider.name]
                        ? architectures[provider.name].map((architecture) => (
                            <div key={architecture.name}>
                              {architecture.downloadUrl ? (
                                <a
                                  href={architecture.downloadUrl}
                                  className="btn btn-outline-primary mt-2"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {t("buttons.download")} {architecture.name}
                                </a>
                              ) : null}
                            </div>
                          ))
                        : null}
                    </td>
                    {isAuthorized ? (
                      <td>
                        <button
                          className="btn btn-danger"
                          onClick={() =>
                            handleProviderDeleteClick(provider.name)
                          }
                        >
                          {t("buttons.delete")}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
            <ConfirmationModal
              show={showDeleteModal}
              handleClose={handleCloseDeleteModal}
              handleConfirm={handleConfirmDelete}
            />
          </div>
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

export default Version;
