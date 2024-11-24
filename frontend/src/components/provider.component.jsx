import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from 'react-router-dom';
import ArchitectureService from "../services/architecture.service";
import ProviderService from "../services/provider.service";
import FileService from "../services/file.service";
import authHeader from "../services/auth-header";
import ConfirmationModal from './confirmation.component';
import Table from 'react-bootstrap/Table';

const Provider = () => {
  const { organization, name, version, providerName } = useParams();
  const navigate = useNavigate();
  const [originalProviderName, setOriginalProviderName] = useState("");
  const [architectures, setArchitectures] = useState([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [currentProvider, setCurrentProvider] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [showAddArchitectureForm, setShowAddArchitectureForm] = useState(false);
  const [newArchitecture, setNewArchitecture] = useState({
    name: "",
    defaultBox: false,
  });
  const [selectedFiles, setSelectedFiles] = useState(undefined);
  const [progress, setProgress] = useState(0);
  const [checksumType, setChecksumType] = useState("NULL"); // Initialize to "NULL"
  const [checksum, setChecksum] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const checksumTypes = ['NULL', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512'];
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const handleProviderDeleteClick = () => {
    setItemToDelete({ type: 'provider', name: providerName });
    setShowDeleteModal(true);
  };
  
  const handleArchitectureDeleteClick = (architectureName) => {
    setItemToDelete({ type: 'architecture', name: architectureName });
    setShowDeleteModal(true);
  };
  
  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };
  
  const handleConfirmDelete = () => {
    if (itemToDelete) {
      if (itemToDelete.type === 'provider') {
        deleteProvider();
      } else if (itemToDelete.type === 'architecture') {
        deleteArchitecture(itemToDelete.name);
      }
      handleCloseDeleteModal();
    }
  };

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      setIsAuthorized(user.organization === organization);
    }
  
    ProviderService.getProvider(organization, name, version, providerName)
      .then(response => {
        setCurrentProvider(response.data);
        setOriginalProviderName(response.data.name); // Store the original name
      })
      .catch(e => {
        console.log(e);
        setCurrentProvider(null);
        setMessage("No Provider Found");
        setMessageType("danger");
      });
  
    ArchitectureService.getArchitectures(organization, name, version, providerName)
      .then(response => {
        const architecturesWithInfo = response.data.map(architecture => {
          return FileService.info(organization, name, version, providerName, architecture.name)
            .then(fileInfoResponse => ({
              ...architecture,
              fileName: fileInfoResponse.data.fileName,
              downloadUrl: fileInfoResponse.data.downloadUrl,
              fileSize: fileInfoResponse.data.fileSize,
              checksum: fileInfoResponse.data.checksum,
              checksumType: fileInfoResponse.data.checksumType,
            }))
            .catch(() => ({
              ...architecture,
              fileName: null,
              downloadUrl: null,
              fileSize: null,
              checksum: null,
              checksumType: null,
            }));
        });
  
        Promise.all(architecturesWithInfo).then(setArchitectures);
      })
      .catch(e => {
        console.log(e);
      });
  }, [organization, name, version, providerName]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setCurrentProvider({ ...currentProvider, [name]: value });
  
    // Validate the name field
    if (name === "name") {
      const error = required(value) || validateName(value);
      setValidationErrors({ ...validationErrors, name: error });
    }
  };
  
  const handleArchitectureInputChange = (event) => {
    const { name, value } = event.target;
    setNewArchitecture({ ...newArchitecture, [name]: value });
  
    if (name === "name") {
      const error = required(value) || validateName(value);
      setValidationErrors((prevErrors) => {
        const updatedErrors = { ...prevErrors, architectureName: error };
        return updatedErrors;
      });
    }
  };

   // Define a function to validate the checksum based on the type
   const validateChecksum = (checksum, type) => {
    const checksumPatterns = {
      MD5: /^[a-fA-F0-9]{32}$/,
      SHA1: /^[a-fA-F0-9]{40}$/,
      SHA256: /^[a-fA-F0-9]{64}$/,
      SHA384: /^[a-fA-F0-9]{96}$/,
      SHA512: /^[a-fA-F0-9]{128}$/,
    };

    if (type === "NULL") {
      return undefined; // No validation needed for NULL type
    }

    const pattern = checksumPatterns[type];
    if (!pattern) {
      return "Unsupported checksum type!";
    }

    return pattern.test(checksum) ? undefined : `Invalid ${type} checksum format!`;
  };

  // Update the handleChecksumChange function to include validation
  const handleChecksumChange = (event) => {
    const value = event.target.value;
    setChecksum(value);

    // Validate the checksum field if the type is not "NULL"
    if (checksumType !== "NULL") {
      const error = required(value) || validateChecksum(value, checksumType);
      setValidationErrors((prevErrors) => ({ ...prevErrors, checksum: error }));
    }
  };

  // Update the handleChecksumTypeChange function to clear errors if needed
  const handleChecksumTypeChange = (event) => {
    const selectedType = event.target.value;
    setChecksumType(selectedType);

    // Validate the checksum field if the type is not "NULL"
    if (selectedType !== "NULL") {
      const error = required(checksum) || validateChecksum(checksum, selectedType);
      setValidationErrors((prevErrors) => ({ ...prevErrors, checksum: error }));
    } else {
      // Clear checksum validation error if type is "NULL"
      setValidationErrors((prevErrors) => {
        const { checksum, ...rest } = prevErrors;
        return rest;
      });
    }
  };

  const required = (value) => {
    return value ? undefined : "This field is required!";
  };
  
  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
  
  const validateName = (value) => {
    return validCharsRegex.test(value) ? undefined : "Invalid name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.";
  };

  const requiredFile = (files) => {
    if (!files || files.length === 0) {
      return (
        <div className="alert alert-danger" role="alert">
          A file must be selected for upload!
        </div>
      );
    }
  };

  const selectFile = (event) => {
    setSelectedFiles(event.target.files);
  };

  const saveProvider = async (event) => {
    event.preventDefault();
  
    // Check for duplicate provider name only if the name has changed
    if (currentProvider.name !== originalProviderName) {
      const providerExists = await checkProviderExists(organization, name, version, currentProvider.name);
      if (providerExists) {
        setMessage('A provider with this name already exists. Please choose a different name.');
        setMessageType("danger");
        return;
      }
    }
  
    const data = {
      name: currentProvider.name,
      description: currentProvider.description,
    };
  
    try {
      await ProviderService.updateProvider(organization, name, version, providerName, data);
      setMessage("The provider was updated successfully!");
      setMessageType("success");
      setEditMode(false);
      if (providerName !== currentProvider.name) {
        navigate(`/${organization}/${name}/${version}/${currentProvider.name}`);
      }
    } catch (e) {
      console.log(e);
      if (e.response && e.response.data && e.response.data.message) {
        setMessage(e.response.data.message); // Display the specific error message from the response
      } else {
        setMessage("Could not update the provider"); // Fallback message
      }
      setMessageType("danger");
    }
  };

  const deleteProvider = () => {
    ProviderService.deleteProvider(organization, name, version, providerName)
      .then(response => {
        setMessage("The provider was deleted successfully!");
        setMessageType("success");
        navigate(`/${organization}/${name}/${version}`);
      })
      .catch(e => {
        console.log(e);
      });
  };

  const deleteArchitecture = async (architectureName) => {
    try {
      await ArchitectureService.deleteArchitecture(organization, name, version, providerName, architectureName);
      setMessage("The architecture was deleted successfully!");
      setMessageType("success");
      setArchitectures(architectures.filter(arch => arch.name !== architectureName));
    } catch (error) {
      if (error.response && error.response.data && error.response.data.message) {
        setMessage(error.response.data.message);
        setMessageType("danger");
      } else {
        setMessage("Could not delete the architecture");
        setMessageType("danger");
      }
    }
  };

  const downloadFile = (downloadUrl, fileName) => {
    fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'x-access-token': localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).accessToken : '',
        ...authHeader()
      }
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(new Blob([blob]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
      })
      .catch(error => {
        console.error('There was an error downloading the file:', error);
        setMessage(error.response.data.message);
        setMessageType("danger");
      });
  };

  const formatFileSize = (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setMessage("Checksum copied to clipboard!");
      setMessageType("success");
    }, (err) => {
      console.error('Could not copy text: ', err);
    });
  };

  const checkProviderExists = async (organization, name, version, providerName) => {
    try {
      const response = await ProviderService.getProvider(organization, name, version, providerName);
      return response.data ? true : false;
    } catch (error) {
      console.error('Error checking provider existence:', error);
      return false;
    }
  };

  const addArchitecture = async (event) => {
    event.preventDefault();
  
    // Check if a file is selected
    if (!selectedFiles || selectedFiles.length === 0) {
      setMessage("Please select a file before adding an architecture.");
      setMessageType("danger");
      return;
    }
  
    const architectureData = {
      ...newArchitecture,
      checksum,
      checksumType,
    };
  
    try {
      await ArchitectureService.createArchitecture(organization, name, version, providerName, architectureData);
      setMessage("The architecture was added successfully!");
      setMessageType("success");
  
      let currentFile = selectedFiles[0];
      setProgress(0);
  
      await FileService.upload(
        currentFile,
        organization,
        name,
        version,
        providerName,
        newArchitecture.name,
        checksum,
        checksumType,
        (event) => {
          setProgress(Math.round((100 * event.loaded) / event.total));
        }
      );
  
      // Fetch the updated list of architectures after the file upload
      const updatedArchitecturesResponse = await ArchitectureService.getArchitectures(organization, name, version, providerName);
      const updatedArchitectures = await Promise.all(
        updatedArchitecturesResponse.data.map(async (architecture) => {
          try {
            const fileInfoResponse = await FileService.info(organization, name, version, providerName, architecture.name);
            return {
              ...architecture,
              fileName: fileInfoResponse.data.fileName,
              downloadUrl: fileInfoResponse.data.downloadUrl,
              fileSize: fileInfoResponse.data.fileSize,
              checksum: fileInfoResponse.data.checksum,
              checksumType: fileInfoResponse.data.checksumType,
            };
          } catch (error) {
            return {
              ...architecture,
              fileName: null,
              downloadUrl: null,
              fileSize: null,
              checksum: null,
              checksumType: null,
            };
          }
        })
      );
  
      setArchitectures(updatedArchitectures);
  
      setShowAddArchitectureForm(false);
      setNewArchitecture({ name: "", defaultBox: false });
      setChecksum("");
      setChecksumType("");
      setSelectedFiles(undefined);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        setMessage("No file uploaded!");
        setMessageType("danger");
      } else if (error.response && error.response.data && error.response.data.message) {
        setMessage(error.response.data.message);
        setMessageType("danger");
      } else {
        setMessage(`Could not add the architecture: ` + error);
        setMessageType("danger");
      }
    }
  };
  
  const cancelEdit = () => {
    setEditMode(false);
  };


  return (
    <div className="list row">
      {message && (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      )}
      <div className="provider-form">
        {currentProvider ? (
          <div>
            {editMode ? (
              <div>
                <form onSubmit={saveProvider}>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4>Edit Provider</h4>
                    <div>
                    {isAuthorized && (
                        <>
                          <button type="submit" className="btn btn-success me-2" disabled={!!validationErrors.name}>
                            Save
                          </button>
                          <button type="button" className="btn btn-secondary me-2" onClick={cancelEdit}>
                            Cancel
                          </button>
                        </>
                      )}
                      <button className="btn btn-dark me-2" onClick={() => navigate(`/${organization}/${name}/${version}`)}>
                        Back
                      </button>
                    </div>
                  </div>
                  <div className="form-group col-md-3">
                    <label htmlFor="name">Provider Name</label>
                    <input
                      type="text"
                      className="form-control"
                      id="name"
                      value={currentProvider.name}
                      onChange={handleInputChange}
                      name="name"
                      required
                    />
                    {validationErrors.name && (
                      <div className="text-danger">{validationErrors.name}</div>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="description">Description</label>
                    <textarea
                      className="form-control"
                      id="description"
                      value={currentProvider.description}
                      onChange={handleInputChange}
                      name="description"
                    />
                  </div>
                </form>
              </div>
            ) : (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h4>Provider Details</h4>
                  <div>
                  {isAuthorized && (
                        <>
                          <button className="btn btn-primary me-2" onClick={() => setEditMode(true)}>
                            Edit
                          </button>
                          <button className="btn btn-danger me-2" onClick={handleProviderDeleteClick}>
                            Delete
                          </button>
                        </>
                    )}
                    <button className="btn btn-dark me-2" onClick={() => navigate(`/${organization}/${name}/${version}`)}>
                      Back
                    </button>
                  </div>
                </div>
                <p>Provider Name: {currentProvider.name}</p>
                <p>Description: {currentProvider.description}</p>
              </div>
            )}
          </div>
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
      {currentProvider && (
        <div className="list-table mt-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h4>Architectures for Provider: {providerName}</h4>
            {isAuthorized && (
              <div>
                <button
                  className={`btn ${showAddArchitectureForm ? 'btn-secondary' : 'btn-outline-success'} me-2`}
                  onClick={() => setShowAddArchitectureForm(!showAddArchitectureForm)}
                >
                  {showAddArchitectureForm ? "Cancel" : "Add Architecture"}
                </button>
                {showAddArchitectureForm && (
                  <button
                    className="btn btn-success"
                    onClick={addArchitecture}
                    disabled={
                      !!validationErrors.architectureName ||
                      !selectedFiles ||
                      selectedFiles.length === 0 ||
                      (checksumType !== "NULL" && !checksum)
                    }
                  >
                    Submit
                  </button>
                )}
              </div>
            )}
          </div>
          {showAddArchitectureForm && (
            <div className="add-architecture-form">
              <div className="form-group">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="defaultBoxSwitch"
                    checked={newArchitecture.defaultBox}
                    onChange={() => setNewArchitecture({ ...newArchitecture, defaultBox: !newArchitecture.defaultBox })}
                    name="defaultBox"
                  />
                  <label className="form-check-label" htmlFor="defaultBoxSwitch">
                    Default Box
                  </label>
                </div>
                <label className="btn btn-default">
                  <input type="file" onChange={selectFile} validations={[requiredFile]} />
                </label>
                {selectedFiles && (
                  <div className="d-flex">
                    <div
                      className="progress-bar bg-success progress-bar-striped progress-bar-animated"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      style={{ width: progress + "%" }}
                    >
                      {progress}%
                    </div>
                  </div>
                )}
                <div className="form-group col-md-3">
                  <label htmlFor="architectureName">Architecture Name</label>
                  <input
                    type="text"
                    className="form-control"
                    id="architectureName"
                    value={newArchitecture.name}
                    onChange={handleArchitectureInputChange}
                    name="name"
                    required
                  />
                  {validationErrors.architectureName && (
                    <div className="text-danger">{validationErrors.architectureName}</div>
                  )}
                </div>
                <div className="form-group col-md-3">
                  <label htmlFor="checksumType">Checksum Type</label>
                  <select
                    className="form-control"
                    id="checksumType"
                    value={checksumType}
                    onChange={handleChecksumTypeChange}
                    name="checksumType"
                  >
                    {checksumTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                {checksumType !== "NULL" && (
                  <div className="form-group">
                    <label htmlFor="checksum">Checksum</label>
                    <input
                      type="text"
                      className="form-control"
                      id="checksum"
                      value={checksum}
                      onChange={handleChecksumChange}
                      name="checksum"
                    />
                    {validationErrors.checksum && (
                      <div className="text-danger">{validationErrors.checksum}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <Table striped className="table">
            <thead>
              <tr>
                <th>Architecture Name</th>
                <th>Default Box</th>
                <th>File Size</th>
                <th>Checksum</th>
                <th>Checksum Type</th>
                <th>Download</th>
                {isAuthorized && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {architectures.map((architecture, index) => (
                <tr key={index}>
                  <td>{architecture.name}</td>
                  <td>{architecture.defaultBox ? "Yes" : "No"}</td>
                  <td>{architecture.fileSize ? formatFileSize(architecture.fileSize) : "N/A"}</td>
                  <td>
                    {architecture.checksum ? (
                      <span
                        onClick={() => copyToClipboard(architecture.checksum)}
                        title="Click to copy checksum"
                        style={{ cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {architecture.checksum.substring(0, 20)}...{architecture.checksum.substring(architecture.checksum.length - 20)}
                      </span>
                    ) : "N/A"}
                  </td>
                  <td>{architecture.checksumType || "N/A"}</td>
                  <td>
                    {architecture.downloadUrl && (
                      <button onClick={() => downloadFile(architecture.downloadUrl, architecture.fileName)} className="btn btn-outline-primary">
                        Download
                      </button>
                    )}
                  </td>
                  {isAuthorized && (
                    <td>
                      <button className="btn btn-danger me-2" onClick={() => handleArchitectureDeleteClick(architecture.name)}>
                        Delete
                      </button>
                    </td>
                  )}
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
      )}
    </div>
  );
};

export default Provider;
