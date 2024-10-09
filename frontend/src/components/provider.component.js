import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from 'react-router-dom';
import ArchitectureService from "../services/architecture.service";
import ProviderService from "../services/provider.service";
import FileService from "../services/file.service";
import authHeader from "../services/auth-header";
import Form from "react-validation/build/form";
import Input from "react-validation/build/input";
import CheckButton from "react-validation/build/button";

const Provider = () => {
  const { organization, name, version, providerName } = useParams();
  const navigate = useNavigate();
  const form = useRef();
  const checkBtn = useRef();

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
  const [checksum, setChecksum] = useState("");
  const [checksumType, setChecksumType] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);

  const checksumTypes = ['NULL', 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512'];

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      setIsAuthorized(user.organization === organization);
    }

    ProviderService.getProvider(organization, name, version, providerName)
      .then(response => {
        setCurrentProvider(response.data);
      })
      .catch(e => {
        console.log(e);
        setCurrentProvider(null);
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
        setMessage("Error fetching architectures");
      });
  }, [organization, name, version, providerName]);

  const handleInputChange = event => {
    const { name, value } = event.target;
    setCurrentProvider({ ...currentProvider, [name]: value });
  };

  const handleArchitectureInputChange = event => {
    const { name, value } = event.target;
    setNewArchitecture({ ...newArchitecture, [name]: value });
  };

  const required = (value) => {
    if (!value) {
      return (
        <div className="alert alert-danger" role="alert">
          This field is required!
        </div>
      );
    }
  };
  
  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
  
  const validateName = (value) => {
    if (!validCharsRegex.test(value)) {
      return (
        <div className="alert alert-danger" role="alert">
          Invalid name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.
        </div>
      );
    }
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
  
    // Check for duplicate provider name
    const providerExists = await checkProviderExists(organization, name, version, currentProvider.name);
    if (providerExists) {
      setMessage('A provider with this name already exists. Please choose a different name.');
      setMessageType("danger");
      return;
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
      setMessage("Could not update the provider");
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
      const response = await ArchitectureService.createArchitecture(organization, name, version, providerName, architectureData);
      const createdArchitecture = response.data;
      setMessage("The architecture was added successfully!");
      setMessageType("success");
      setArchitectures([...architectures, createdArchitecture]);
  
      let currentFile = selectedFiles[0];
      setProgress(0);
  
      await FileService.upload(currentFile, organization, name, version, providerName, newArchitecture.name, (event) => {
        setProgress(Math.round((100 * event.loaded) / event.total));
      });
  
      const fileInfo = await FileService.info(organization, name, version, providerName, newArchitecture.name);
      const updatedArchitecture = {
        ...createdArchitecture,
        fileName: fileInfo.data.fileName,
        downloadUrl: fileInfo.data.downloadUrl,
        fileSize: fileInfo.data.fileSize,
        checksum: fileInfo.data.checksum,
        checksumType: fileInfo.data.checksumType,
      };
      setArchitectures([...architectures, updatedArchitecture]);
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
    <div className="provider">
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
                <Form onSubmit={saveProvider}>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4>Edit Provider</h4>
                    <div>
                      {isAuthorized && (
                        <>
                          <button type="submit" className="btn btn-success me-2">
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
                  <div className="form-group">
                    <label htmlFor="name">Provider Name</label>
                    <Input
                      type="text"
                      className="form-control input-small"
                      id="name"
                      value={currentProvider.name}
                      onChange={handleInputChange}
                      name="name"
                      validations={[required, validateName]}
                    />
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
                </Form>
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
                        <button className="btn btn-danger me-2" onClick={deleteProvider}>
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
              <h4>No Provider Found</h4>
              <button className="btn btn-dark me-2" onClick={() => navigate(`/${organization}/${name}/${version}`)}>
                Back
              </button>
            </div>
            {isAuthorized && (
              <button
                className={`btn ${showAddArchitectureForm ? 'btn-secondary' : 'btn-outline-success'} me-2`}
                onClick={() => setShowAddArchitectureForm(!showAddArchitectureForm)}
              >
                {showAddArchitectureForm ? "Cancel" : "Add Architecture"}
              </button>
            )}
            {showAddArchitectureForm && (
              <Form onSubmit={addArchitecture} ref={form}>
              <div className="form-group horizontal-fields">
                <label htmlFor="architectureName">Architecture Name</label>
                <Input
                  type="text"
                  className="form-control"
                  id="architectureName"
                  value={newArchitecture.name}
                  onChange={handleArchitectureInputChange}
                  name="name"
                  validations={[required, validateName]}
                />
              </div>
              <div className="form-group horizontal-fields">
                <label htmlFor="defaultBox">Default Box</label>
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="defaultBox"
                  checked={newArchitecture.defaultBox}
                  onChange={() => setNewArchitecture({ ...newArchitecture, defaultBox: !newArchitecture.defaultBox })}
                  name="defaultBox"
                />
              </div>
              <div className="form-group">
                <label className="btn btn-default">
                  <Input type="file" onChange={selectFile} validations={[requiredFile]} />
                </label>
              </div>
              {selectedFiles && (
                <div className="progress">
                  <div
                    className="progress-bar progress-bar-info progress-bar-striped"
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
              <button className="btn btn-success" type="submit">
                Submit
              </button>
              <CheckButton style={{ display: "none" }} ref={checkBtn} />
            </Form>
            )}
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
                  <button className="btn btn-success" onClick={addArchitecture}>
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
                  <input type="file" onChange={selectFile} />
                </label>
                {selectedFiles && (
                  <div className="progress">
                    <div
                      className="progress-bar progress-bar-info progress-bar-striped"
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
                <div className="form-group">
                  <label htmlFor="architectureName">Architecture Name</label>
                  <input
                    type="text"
                    className="form-control input-small"
                    id="architectureName"
                    value={newArchitecture.name}
                    onChange={handleArchitectureInputChange}
                    name="name"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="checksumType">Checksum Type</label>
                  <select
                    className="form-control input-small"
                    id="checksumType"
                    value={checksumType}
                    onChange={(e) => setChecksumType(e.target.value)}
                    name="checksumType"
                  >
                    {checksumTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="checksum">Checksum</label>
                  <input
                    type="text"
                    className="form-control"
                    id="checksum"
                    value={checksum}
                    onChange={(e) => setChecksum(e.target.value)}
                    name="checksum"
                  />
                </div>
              </div>
            </div>
          )}
          <table className="table">
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
                      <button className="btn btn-danger me-2" onClick={() => deleteArchitecture(architecture.name)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Provider;
