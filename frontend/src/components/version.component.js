import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from 'react-router-dom';
import BoxDataService from "../services/box.service";
import ProviderService from "../services/provider.service";
import ArchitectureService from "../services/architecture.service";
import FileService from "../services/file.service";
import authHeader from "../services/auth-header";
import Form from "react-validation/build/form";
import Input from "react-validation/build/input";
import CheckButton from "react-validation/build/button";

const Version = () => {
  const { organization, name, version } = useParams();
  let navigate = useNavigate();

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

  const form = useRef();
  const checkBtn = useRef();

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

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      setIsAuthorized(user.organization === organization);
    }
  
    ProviderService.getProviders(organization, name, version)
      .then(response => {
        setProviders(response.data);
        response.data.forEach(provider => {
          ArchitectureService.getArchitectures(organization, name, version, provider.name)
            .then(archResponse => {
              const architecturesWithInfo = archResponse.data.map(architecture => {
                return FileService.info(organization, name, version, provider.name, architecture.name)
                  .then(fileInfoResponse => ({
                    ...architecture,
                    downloadUrl: fileInfoResponse.data.downloadUrl,
                  }))
                  .catch(() => ({
                    ...architecture,
                    downloadUrl: null,
                  }));
              });
  
              Promise.all(architecturesWithInfo).then(archs => {
                setArchitectures(prev => ({ ...prev, [provider.name]: archs }));
              });
            })
            .catch(e => {
              console.log(e);
            });
        });
      })
      .catch(e => {
        console.log(e);
      });
  
    BoxDataService.getVersion(organization, name, version)
      .then(response => {
        setCurrentVersion(response.data);
      })
      .catch(e => {
        console.log(e);
        if (!user) {
          navigate("/login");
        }
      });
  
    // Fetch all versions using getVersions
    BoxDataService.getVersions(organization, name)
      .then(response => {
        setAllVersions(response.data);
      })
      .catch(e => {
        console.log(e);
      });
  }, [organization, name, version, navigate]);

  const handleProviderInputChange = (event) => {
    const { name, value } = event.target;
    setNewProvider({ ...newProvider, [name]: value });
  };

  const addProvider = async (event) => {
    event.preventDefault();

    if (required(newProvider.name) || validateName(newProvider.name)) {
      setMessage("Please fix the errors in the form.");
      setMessageType("danger");
      return;
    }

    const providerExists = providers.some(provider => provider.name === newProvider.name);
    if (providerExists) {
      setMessage("A provider with this name already exists. Please choose a different name.");
      setMessageType("danger");
      return;
    }

    try {
      const response = await ProviderService.createProvider(organization, name, version, newProvider);
      setMessage("The provider was created successfully!");
      setMessageType("success");
      setProviders([...providers, response.data]);
      setShowAddProviderForm(false);
      setNewProvider({ name: "", description: "" });
    } catch (e) {
      if (e.response && e.response.data && e.response.data.message) {
        setMessage(e.response.data.message);
      } else {
        setMessage("An error occurred while creating the provider.");
      }
      setMessageType("danger");
    }
  };

  const deleteFilesForArchitecture = (providerName, architectureName) => {
    return FileService.delete(organization, name, version, providerName, architectureName)
      .catch(e => {
        console.log(`Error deleting files for architecture ${architectureName}:`, e);
        throw e;
      });
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

  const deleteArchitecturesForProvider = async (providerName) => {
    const architecturesToDelete = architectures[providerName] || [];
    for (const architecture of architecturesToDelete) {
      await deleteFilesForArchitecture(providerName, architecture.name);
      await ArchitectureService.deleteArchitecture(organization, name, version, providerName, architecture.name)
        .catch(e => {
          console.log(`Error deleting architecture ${architecture.name}:`, e);
          throw e;
        });
    }
  };

  const deleteProvider = async (providerName) => {
    try {
      await deleteArchitecturesForProvider(providerName);
      await ProviderService.deleteProvider(organization, name, version, providerName);
      setMessage("The provider was deleted successfully!");
      setMessageType("success");
      setProviders(providers.filter(provider => provider.name !== providerName));
    } catch (e) {
      console.log(`Error deleting provider ${providerName}:`, e);
      setMessage("Error deleting provider. Please try again.");
      setMessageType("danger");
    }
  };

  const handleInputChange = event => {
    const { name, value } = event.target;
    setCurrentVersion({ ...currentVersion, [name]: value });
  };

  const deleteVersion = () => {
    BoxDataService.deleteVersion(organization, name, version)
      .then(response => {
        setMessage("The version was deleted successfully!");
        setMessageType("success");
        navigate(`/${organization}/${name}`);
      })
      .catch(e => {
        console.log(e);
      });
  };

  const saveVersion = async (event) => {
    event.preventDefault();
  
    if (required(currentVersion.versionNumber) || validateName(currentVersion.versionNumber)) {
      setMessage("Please fix the errors in the form.");
      setMessageType("danger");
      return;
    }
  
    // Check for duplicate version number, excluding the current version
    const versionExists = allVersions.some(v => v.version === currentVersion.versionNumber && v.id !== currentVersion.id);
    if (versionExists) {
      setMessage("A version with this number already exists. Please choose a different version number.");
      setMessageType("danger");
      return;
    }
  
    const data = {
      version: currentVersion.versionNumber,
      description: currentVersion.description,
    };
  
    try {
      await BoxDataService.updateVersion(organization, name, version, data);
      setMessage("The version was updated successfully!");
      setMessageType("success");
      setEditMode(false);
  
      if (version !== currentVersion.versionNumber) {
        navigate(`/${organization}/${name}/${currentVersion.versionNumber}`);
      }
    } catch (e) {
      if (e.response && e.response.data && e.response.data.message) {
        setMessage(e.response.data.message);
      } else {
        setMessage("An error occurred while updating the version.");
      }
      setMessageType("danger");
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
  };

  return (
    <div className="version">
      {message && (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      )}
      <div className="version-form">
        {editMode ? (
          <div>
            <Form onSubmit={saveVersion} ref={form}>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h4>Edit Version</h4>
                <div>
                  <button type="submit" className="btn btn-success me-2">
                    Save
                  </button>
                  <button type="button" className="btn btn-secondary me-2" onClick={cancelEdit}>
                    Cancel
                  </button>
                  <button className="btn btn-dark me-2" onClick={() => navigate(`/${organization}/${name}`)}>
                    Back
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="versionNumber">Version Number</label>
                <Input
                  type="text"
                  className="form-control input-small"
                  id="versionNumber"
                  value={currentVersion.versionNumber}
                  onChange={handleInputChange}
                  name="versionNumber"
                  validations={[required, validateName]}
                />
              </div>
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  className="form-control"
                  id="description"
                  value={currentVersion.description}
                  onChange={handleInputChange}
                  name="description"
                />
              </div>
              <CheckButton style={{ display: "none" }} ref={checkBtn} />
            </Form>
          </div>
        ) : (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4>Version Details</h4>
              <div>
                {isAuthorized && (
                  <>
                    <button className="btn btn-primary me-2" onClick={() => setEditMode(true)}>
                      Edit
                    </button>
                    <button className="btn btn-danger me-2" onClick={deleteVersion}>
                      Delete
                    </button>
                  </>
                )}
                <button className="btn btn-dark me-2" onClick={() => navigate(`/${organization}/${name}`)}>
                  Back
                </button>
              </div>
            </div>
            <p>Version Number: {currentVersion.versionNumber}</p>
            <p>Description: {currentVersion.description}</p>
            <p>Created At: {currentVersion.createdAt}</p>
            <p>Updated At: {currentVersion.updatedAt}</p>
          </div>
        )}
      </div>
      <div className="list-table">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4>Providers for Version: {version}</h4>
          <div>
            {isAuthorized && (
              <>
                <button
                  className={`btn ${showAddProviderForm ? 'btn-secondary' : 'btn-outline-success'} me-2`}
                  onClick={() => setShowAddProviderForm(!showAddProviderForm)}
                >
                  {showAddProviderForm ? "Cancel" : "Add Provider"}
                </button>
                {showAddProviderForm && (
                  <button className="btn btn-success me-2" onClick={addProvider}>
                    Submit
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {showAddProviderForm && (
          <Form onSubmit={addProvider} ref={form}>
            <div className="add-provider-form">
              <div className="form-group">
                <label htmlFor="providerName">Provider Name</label>
                <Input
                  type="text"
                  className="form-control input-small"
                  id="providerName"
                  value={newProvider.name}
                  onChange={handleProviderInputChange}
                  name="name"
                  validations={[required, validateName]}
                />
              </div>
              <div className="form-group">
                <label htmlFor="providerDescription">Description</label>
                <textarea
                  className="form-control"
                  id="providerDescription"
                  value={newProvider.description}
                  onChange={handleProviderInputChange}
                  name="description"
                />
              </div>
              <CheckButton style={{ display: "none" }} ref={checkBtn} />
            </div>
          </Form>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>Provider Name</th>
              <th>Description</th>
              <th>Architectures</th>
              {isAuthorized && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {providers.map((provider, index) => (
              <tr key={index}>
                <td>
                  <Link to={`/${organization}/${name}/${version}/${provider.name}`}>
                    {provider.name}
                  </Link>
                </td>
                <td>{provider.description}</td>
                <td>
                  {architectures[provider.name] && architectures[provider.name].map((arch, idx) => (
                    <div key={idx}>
                      {arch.downloadUrl ? (
                        <button
                          className="btn btn-link"
                          onClick={() => downloadFile(arch.downloadUrl, arch.name)}
                        >
                          {arch.name}
                        </button>
                      ) : (
                        <span>{arch.name}</span>
                      )}
                    </div>
                  ))}
                </td>
                {isAuthorized && (
                  <td>
                    <button className="btn btn-danger me-2" onClick={() => deleteProvider(provider.name)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Version;