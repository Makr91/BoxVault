import React, { useState, useEffect, useRef } from "react";
import { Table } from "react-bootstrap";
import { useParams, useNavigate, Link } from "react-router-dom";
import ArchitectureService from "../services/architecture.service";
import BoxDataService from "../services/box.service";
import VersionDataService from "../services/version.service";
import ProviderService from "../services/provider.service";
import FileService from "../services/file.service";
import AuthService from "../services/auth.service";

import ConfirmationModal from "./confirmation.component";

const Box = ({ theme }) => {
  const { organization, name } = useParams();
  const [versions, setVersions] = useState([]);
  const [originalName, setOriginalName] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState(null);
  const navigate = useNavigate();
  console.log(theme);
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

  const required = (value) => (value ? undefined : "This field is required!");

  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  const validateName = (value) =>
    validCharsRegex.test(value)
      ? undefined
      : "Invalid name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.";

  useEffect(() => {
    const user = AuthService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setIsAuthorized(user.organization === organization);
    }

    if (name) {
      // Fetch the box details using the box's organization
      BoxDataService.get(organization, name)
        .then((response) => {
          const boxData = response.data;
          setCurrentBox(boxData);
          setOriginalName(boxData.name);
          // Fetch the organization of the box's user
          if (boxData.user && boxData.user.organization) {
            setBoxOrganization(boxData.user.organization.name);
          }

          // Check if the box is public or the user is authorized
          if (
            boxData.isPublic ||
            (user && user.organization === organization)
          ) {
            // Fetch versions using the box's organization
            VersionDataService.getVersions(organization, name)
              .then((response) => {
                setVersions(response.data);
                setAllVersions(response.data);
                response.data.forEach((version) => {
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
                      console.log(e);
                    });
                });
              })
              .catch((e) => {
                console.log(e);
              });
          } else {
            setMessage("No Box Found");
            setMessageType("danger");
          }
        })
        .catch((e) => {
          console.log(e);
          setMessage("No Box Found");
          setMessageType("danger");
        });
    }
  }, [organization, name]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setCurrentBox({
      ...currentBox,
      [name]: name === "isPublic" ? (value === "true" ? 1 : 0) : value,
    });
    setNewVersion({ ...newVersion, [name]: value });

    // Validate the name field
    if (name === "name") {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, name: error });
    }

    // Validate the versionNumber field
    if (name === "versionNumber") {
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
        console.log(response.data);
      }
    );
  };

  const updateBox = () => {
    // Check for duplicate box name
    if (currentBox.name !== originalName) {
      const boxExists = allVersions.some((v) => v.name === currentBox.name);
      if (boxExists) {
        setMessage(
          "A box with this name already exists. Please choose a different name."
        );
        setMessageType("danger");
        return;
      }
    }

    BoxDataService.update(currentUser.organization, originalName, currentBox)
      .then(() => {
        setMessage("The box was updated successfully!");
        setMessageType("success");
        setEditMode(false);

        if (originalName !== currentBox.name) {
          navigate(`/${currentUser.organization}/${currentBox.name}`);
        }
      })
      .catch((e) => {
        console.log(e);
        if (e.response && e.response.data && e.response.data.message) {
          setMessage(e.response.data.message);
        } else {
          setMessage("An error occurred while updating the box.");
        }
        setMessageType("danger");
      });
  };

  const deleteBox = () => {
    BoxDataService.remove(currentUser.organization, currentBox.name)
      .then((response) => {
        console.log(response.data);
        navigate(`/${currentUser.organization}`);
      })
      .catch((e) => {
        console.log(e);
        setMessage("An error occurred while deleting the box.");
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

    // Check for duplicate version number
    const versionExists = versions.some(
      (v) => v.versionNumber === newVersion.versionNumber
    );
    if (versionExists) {
      setMessage(
        `Version ${newVersion.versionNumber} with this number already exists. Please choose a different version number.`
      );
      setMessageType("danger");
      return;
    }

    VersionDataService.createVersion(
      currentUser.organization,
      currentBox.name,
      newVersion
    )
      .then((response) => {
        setMessage("The version was added successfully!");
        setMessageType("success");
        setVersions([...versions, response.data]);
        setShowAddVersionForm(false);
        setNewVersion({ versionNumber: "", description: "" });
      })
      .catch((e) => {
        if (e.response && e.response.data && e.response.data.message) {
          setMessage(e.response.data.message);
        } else {
          setMessage("An error occurred while adding the version.");
        }
        setMessageType("danger");
      });
  };

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
      console.log(
        `Error deleting files for architecture ${architectureName}:`,
        e
      );
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
      console.log(architecture.name);
      await deleteFilesForArchitecture(
        providerName,
        versionNumber,
        architecture.name
      );
      await ArchitectureService.deleteArchitecture(
        currentUser.organization,
        currentBox.name,
        versionNumber,
        providerName,
        architecture.name
      ).catch((e) => {
        console.log(`Error deleting architecture ${architecture.name}:`, e);
        throw e;
      });
    }
  };

  const deleteProvidersForVersion = async (versionNumber) => {
    const providers = await ProviderService.getProviders(
      currentUser.organization,
      currentBox.name,
      versionNumber
    );
    for (const provider of providers.data) {
      console.log(provider.name);
      await deleteArchitecturesForProvider(provider.name, versionNumber);
      await ProviderService.deleteProvider(
        currentUser.organization,
        currentBox.name,
        versionNumber,
        provider.name
      ).catch((e) => {
        console.log(`Error deleting provider ${provider.name}:`, e);
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
      setMessage("The version was deleted successfully!");
      setMessageType("success");
      setVersions(
        versions.filter((version) => version.versionNumber !== versionNumber)
      );
    } catch (e) {
      console.log(`Error deleting version ${versionNumber}:`, e);
      const errorMessage =
        e.response && e.response.data && e.response.data.message
          ? e.response.data.message
          : "Error deleting version. Please try again.";
      setMessage(errorMessage);
      setMessageType("danger");
    }
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
              <h4>Box Details</h4>
              <div>
                {isAuthorized && (
                  <>
                    {editMode ? (
                    <>
                      <button
                        type="submit"
                        className="btn btn-success me-2"
                        onClick={updateBox}
                        disabled={!!validationErrors.name}
                      >
                        Update
                      </button>
                      <button
                        className="btn btn-secondary me-2"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </>
                    ) : (
                      <button
                        className="btn btn-primary me-2"
                        onClick={() => setEditMode(true)}
                      >
                        Edit
                      </button>
                    )}
                    {currentBox.id && !editMode && (
                      <button className="btn btn-danger me-2" onClick={handleDeleteClick}>
                        Delete
                      </button>
                    )}
                    <ConfirmationModal
                      show={showModal}
                      handleClose={handleCloseModal}
                      handleConfirm={handleConfirmDelete}
                    />
                    {currentBox.published ? (
                      <button
                        className="btn btn-warning me-2"
                        onClick={() => updateRelease(false)}
                      >
                        Unpublish
                      </button>
                    ) : (
                      currentBox.id && (
                        <button
                          className="btn btn-outline-primary me-2"
                          onClick={() => updateRelease(true)}
                          disabled={!!validationErrors.name}
                        >
                          Publish
                        </button>
                      )
                    )}
                  </>
                )}
                {currentUser ? (
                  <Link
                    className="btn btn-dark me-2"
                    to={`/${boxOrganization}`}
                  >
                    Back
                  </Link>
                ) : (
                  <Link
                    className="btn btn-dark me-2"
                    to={`/${boxOrganization}`}
                  >
                    Back
                  </Link>
                )}
              </div>
            </div>
            {editMode ? (
              <div className="edit-form">
                <form ref={form}>
                  <div className="mb-1">
                    <strong>Box name:</strong>
                  </div>
                  <div className="form-group row align-items-center">
                    <div className="col-auto pe-0">
                      <input
                        type="text"
                        className="form-control"
                        id="organization"
                        name="organization"
                        value={currentUser ? currentUser.organization : ''}
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
                    The name of your Vagrant box is used in tools, notifications, routing, and this UI. Short and simple is best.
                  </small>
                  <div className="form-group mt-2">
                    <label>
                      <strong>Status: </strong>
                    </label>
                    {currentBox.published ? "Published" : "Pending"}
                  </div>
                  <div className="form-group mt-2">
                    <label>
                      <strong>Visibility:</strong>
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
                            Private
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
                            Public
                          </label>
                        </div>
                      </div>
                      <small className="form-text text-muted">
                        Making a box private prevents users from accessing it unless given permission.
                      </small>
                  </div>
                    
                  <div className="form-group mt-2">
                    <label className="mb-1" htmlFor="description"><strong>Description:</strong> (Optional)</label>
                    <textarea
                      className="form-control"
                      id="description"
                      required
                      value={currentBox.description}
                      onChange={handleInputChange}
                      name="description"
                      rows="4"
                      placeholder="The short description is used to describe the box."
                    />
                  </div>

                  <div className="form-group mt-3">
                    <h5><strong>CI/CD Integration</strong> (Optional)</h5>
                    <small className="form-text text-muted mb-3">
                      Connect your box to GitHub Actions for automated build status badges.
                    </small>
                    
                    <div className="form-group mt-2">
                      <label className="mb-1" htmlFor="githubRepo"><strong>GitHub Repository:</strong> (Optional)</label>
                      <input
                        type="text"
                        className="form-control"
                        id="githubRepo"
                        name="githubRepo"
                        value={currentBox.githubRepo || ""}
                        onChange={handleInputChange}
                        placeholder="owner/repository-name"
                      />
                      <small className="form-text text-muted">
                        Format: owner/repository-name (e.g., myorg/my-vagrant-box)
                      </small>
                    </div>

                    <div className="form-group mt-2">
                      <label className="mb-1" htmlFor="workflowFile"><strong>Workflow File:</strong> (Optional)</label>
                      <input
                        type="text"
                        className="form-control"
                        id="workflowFile"
                        name="workflowFile"
                        value={currentBox.workflowFile || ""}
                        onChange={handleInputChange}
                        placeholder="build.yml"
                      />
                      <small className="form-text text-muted">
                        GitHub Actions workflow file name (e.g., build.yml, ci.yaml)
                      </small>
                    </div>

                    <div className="form-group mt-2">
                      <label className="mb-1" htmlFor="cicdUrl"><strong>CI/CD URL:</strong> (Optional)</label>
                      <input
                        type="url"
                        className="form-control"
                        id="cicdUrl"
                        name="cicdUrl"
                        value={currentBox.cicdUrl || ""}
                        onChange={handleInputChange}
                        placeholder="https://github.com/owner/repo/actions"
                      />
                      <small className="form-text text-muted">
                        Direct link to your CI/CD pipeline or GitHub Actions page
                      </small>
                    </div>
                  </div>
                </form>
              </div>
            ) : (
              <div>
                <p><strong>Name:</strong> {currentBox.name}</p>
                <p><strong>Status:</strong> {currentBox.published ? "Published" : "Pending"}</p>
                <p><strong>Visibility:</strong> {currentBox.isPublic ? "Public" : "Private"}</p>
                <p><strong>Description:</strong> {currentBox.description}</p>
                
                {/* CI/CD Integration Display */}
                {(currentBox.githubRepo || currentBox.workflowFile || currentBox.cicdUrl) && (
                  <div className="mt-3">
                    <h5><strong>CI/CD Integration</strong></h5>
                    
                    {currentBox.githubRepo && currentBox.workflowFile && (
                      <div className="mb-2">
                        <p><strong>Build Status:</strong></p>
                        <a 
                          href={currentBox.cicdUrl || `https://github.com/${currentBox.githubRepo}/actions`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img 
                            src={`https://github.com/${currentBox.githubRepo}/actions/workflows/${currentBox.workflowFile}/badge.svg`}
                            alt="Build Status"
                            style={{ maxHeight: '20px' }}
                          />
                        </a>
                      </div>
                    )}
                    
                    {currentBox.githubRepo && (
                      <p><strong>Repository:</strong> 
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
                      <p><strong>Workflow:</strong> {currentBox.workflowFile}</p>
                    )}
                    
                    {currentBox.cicdUrl && (
                      <p><strong>CI/CD Pipeline:</strong> 
                        <a 
                          href={currentBox.cicdUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ms-2"
                        >
                          View Pipeline
                        </a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="list-table">
            <div className="d-flex justify-content-between align-items-center">
              <h4>Versions for Box: {currentBox.name}</h4>
              {isAuthorized && (
                <div>
                  <button
                    className={`btn ${showAddVersionForm ? 'btn-secondary' : 'btn-outline-success'} me-2`}
                    onClick={() => setShowAddVersionForm(!showAddVersionForm)}
                  >
                    {showAddVersionForm ? "Cancel" : "Add Version"}
                  </button>
                  {showAddVersionForm && (
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={addVersion}
                      disabled={!newVersion.versionNumber || !!validationErrors.versionNumber} // Disable if versionNumber is empty or has validation errors
                    >
                      Submit
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
                  <label htmlFor="versionNumber">Version Number</label>
                  <input
                    type="text"
                    className="form-control"
                    id="versionNumber"
                    name="versionNumber"
                    value={newVersion.versionNumber}
                    onChange={handleInputChange}
                    required // This makes the field required
                  />
                  {validationErrors.versionNumber && (
                    <div className="text-danger">{validationErrors.versionNumber}</div>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    className="form-control"
                    id="description"
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
                <th>Version Number</th>
                <th>Details</th>
                <th>Providers</th>
                {isAuthorized && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {versions.map((version, index) => (
                <tr key={index}>
                  <td>
                    <Link to={`/${organization}/${name}/${version.versionNumber}`}>
                      {version.versionNumber}
                    </Link>
                  </td>
                  <td>{version.description}</td>
                  <td>
                    {providers[version.versionNumber] && providers[version.versionNumber].map((provider, idx) => (
                      <div key={idx}>
                        <Link to={`/${organization}/${name}/${version.versionNumber}/${provider.name}`}>
                          {provider.name}
                        </Link>
                      </div>
                    ))}
                  </td>
                  {isAuthorized && (
                    <td>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleVersionDeleteClick(version.versionNumber)}
                      >
                        Delete
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
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Box;
