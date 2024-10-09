import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from 'react-router-dom';
import BoxDataService from "../services/box.service";
import ArchitectureService from "../services/architecture.service";
import ProviderService from "../services/provider.service";
import FileService from "../services/file.service";
import AuthService from "../services/auth.service";
import Form from "react-validation/build/form";
import Input from "react-validation/build/input";
import CheckButton from "react-validation/build/button";

const Box = () => {
  const { organization, name } = useParams();
  const [versions, setVersions] = useState([]);
  const [originalName, setOriginalName] = useState("");
  let navigate = useNavigate();

  const initialBoxState = {
    id: null,
    organization: "",
    name: "",
    description: "",
    published: false,
    isPublic: false,
    userId: null
  };
  const currentUser = AuthService.getCurrentUser();
  const [currentBox, setCurrentBox] = useState(initialBoxState);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showAddVersionForm, setShowAddVersionForm] = useState(false);
  const [newVersion, setNewVersion] = useState({ versionNumber: "", description: "" });
  const [providers, setProviders] = useState({});
  const [allVersions, setAllVersions] = useState([]);

  const isAuthorized = currentUser && currentUser.organization === currentBox.organization;
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
    const currentUser = AuthService.getCurrentUser();

    if (name) {
      // Fetch the box details using the box's organization
      BoxDataService.get(organization, name)
        .then(response => {
          setCurrentBox(response.data);
          setOriginalName(response.data.name);

          // Fetch versions using the box's organization
          BoxDataService.getVersions(organization, name)
            .then(response => {
              setVersions(response.data);
              setAllVersions(response.data);
              response.data.forEach(version => {
                ProviderService.getProviders(organization, name, version.versionNumber)
                  .then(providerResponse => {
                    setProviders(prev => ({
                      ...prev,
                      [version.versionNumber]: providerResponse.data
                    }));
                  })
                  .catch(e => {
                    console.log(e);
                  });
              });
            })
            .catch(e => {
              console.log(e);
            });
        })
        .catch(e => {
          console.log(e);
          if (!currentUser) {
            // Redirect to home if user is unauthenticated and box doesn't exist
            navigate("/");
          } else {
            setEditMode(true); // Set edit mode to true if no box is found but user is authenticated
          }
        });
    }
  }, [organization, name, navigate]);

  const handleInputChange = event => {
    const { name, value } = event.target;
    setCurrentBox({ 
      ...currentBox, 
      [name]: name === "isPublic" ? (value === "true" ? 1 : 0) : value 
    });
    setNewVersion({ ...newVersion, [name]: value });
  };

  const updateRelease = status => {
    var data = {
      id: currentBox.id,
      name: currentBox.name,
      isPublic: currentBox.isPublic,
      description: currentBox.description,
      published: status
    };

    BoxDataService.update(currentUser.organization, currentBox.name, data)
      .then(response => {
        setCurrentBox({ ...currentBox, published: status });
        console.log(response.data);
      })
      .catch(e => {
        console.log(e);
      });
  };

  const updateBox = () => {
    // Check for duplicate box name
    if (currentBox.name !== originalName) {
      const boxExists = allVersions.some(v => v.name === currentBox.name);
      if (boxExists) {
        setMessage("A box with this name already exists. Please choose a different name.");
        setMessageType("danger");
        return;
      }
    }

    BoxDataService.update(currentUser.organization, originalName, currentBox)
      .then(response => {
        console.log(response.data);
        setMessage("The box was updated successfully!");
        setMessageType("success");
        setEditMode(false);

        // Navigate to the new box URL if the name has changed
        if (originalName !== currentBox.name) {
          navigate(`/${currentUser.organization}/${currentBox.name}`);
        }
      })
      .catch(e => {
        console.log(e);
        setMessage("An error occurred while updating the box.");
        setMessageType("danger");
      });
  };

  const deleteBox = () => {
    BoxDataService.remove(currentUser.organization, currentBox.name)
      .then(response => {
        console.log(response.data);
        // Navigate to the home page or another appropriate route after deletion
        navigate("/");
      })
      .catch(e => {
        console.log(e);
        setMessage("An error occurred while deleting the box.");
        setMessageType("danger");
      });
  };

  const cancelEdit = () => {
    setEditMode(false);
    setCurrentBox({ ...currentBox, name: originalName }); // Reset name to original
  };

  const addVersion = (event) => {
    event.preventDefault();

    if (required(newVersion.versionNumber) || validateName(newVersion.versionNumber)) {
      setMessage("Please fix the errors in the form.");
      setMessageType("danger");
      return;
    }

    // Check for duplicate version number
    const versionExists = versions.some(v => v.versionNumber === newVersion.versionNumber);
    if (versionExists) {
      setMessage("A version with this number already exists. Please choose a different version number.");
      setMessageType("danger");
      return;
    }

    BoxDataService.createVersion(currentUser.organization, currentBox.name, newVersion)
      .then(response => {
        setMessage("The version was added successfully!");
        setMessageType("success");
        setVersions([...versions, response.data]);
        setShowAddVersionForm(false);
        setNewVersion({ versionNumber: "", description: "" });
      })
      .catch(e => {
        if (e.response && e.response.data && e.response.data.message) {
          setMessage(e.response.data.message);
        } else {
          setMessage("An error occurred while adding the version.");
        }
        setMessageType("danger");
      });
  };

  const deleteFilesForArchitecture = async (providerName, architectureName) => {
    await FileService.delete(currentUser.organization, currentBox.name, architectureName, providerName)
      .catch(e => {
        console.log(`Error deleting files for architecture ${architectureName}:`, e);
        throw e;
      });
  };

  const deleteArchitecturesForProvider = async (providerName) => {
    const architectures = await ArchitectureService.getArchitectures(currentUser.organization, currentBox.name, providerName);
    for (const architecture of architectures.data) {
      await deleteFilesForArchitecture(providerName, architecture.name);
      await ArchitectureService.deleteArchitecture(currentUser.organization, currentBox.name, providerName, architecture.name)
        .catch(e => {
          console.log(`Error deleting architecture ${architecture.name}:`, e);
          throw e;
        });
    }
  };

  const deleteProvidersForVersion = async (versionNumber) => {
    const providers = await ProviderService.getProviders(currentUser.organization, currentBox.name, versionNumber);
    for (const provider of providers.data) {
      await deleteArchitecturesForProvider(provider.name);
      await ProviderService.deleteProvider(currentUser.organization, currentBox.name, versionNumber, provider.name)
        .catch(e => {
          console.log(`Error deleting provider ${provider.name}:`, e);
          throw e;
        });
    }
  };

  const deleteVersion = async (versionNumber) => {
    try {
      await deleteProvidersForVersion(versionNumber);
      await BoxDataService.deleteVersion(currentUser.organization, currentBox.name, versionNumber);
      setMessage("The version was deleted successfully!");
      setMessageType("success");
      setVersions(versions.filter(version => version.versionNumber !== versionNumber));
    } catch (e) {
      console.log(`Error deleting version ${versionNumber}:`, e);
      setMessage("Error deleting version. Please try again.");
      setMessageType("danger");
    }
  };

  const createBox = () => {
    const boxData = {
      ...currentBox,
      organization: currentUser.organization, // Set the organization to the current user's organization
    };
  
    BoxDataService.create(currentUser.organization, boxData)
      .then(response => {
        console.log(response.data);
        setMessage("The box was created successfully!");
        setMessageType("success");
        setEditMode(false);
        navigate(`/${currentUser.organization}/${currentBox.name}`);
      })
      .catch(e => {
        console.log(e);
        if (e.response && e.response.data && e.response.data.message) {
          setMessage(e.response.data.message);
        } else {
          setMessage("An error occurred while creating the box.");
        }
        setMessageType("danger");
      });
  };

  return (
    <div>
      {message && (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      )}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>Box Details</h4>
        <div>
          {editMode ? (
            <>
              <button
                type="submit"
                className="btn btn-success me-2"
                onClick={currentBox.id ? updateBox : createBox}
              >
                {currentBox.id ? "Update" : "Create"}
              </button>
              <button
                className="btn btn-secondary me-2"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            </>
          ) : (
            isAuthorized && (
              <button
                className="btn btn-primary me-2"
                onClick={() => setEditMode(true)}
              >
                Edit
              </button>
            )
          )}
          {isAuthorized && currentBox.id && !editMode && (
            <button className="btn btn-danger me-2" onClick={deleteBox}>
              Delete
            </button>
          )}
          {isAuthorized && currentBox.published ? (
            <button
              className="btn btn-warning me-2"
              onClick={() => updateRelease(false)}
            >
              Unpublish
            </button>
          ) : (
            isAuthorized && currentBox.id && (
              <button
                className="btn btn-outline-primary me-2"
                onClick={() => updateRelease(true)}
              >
                Publish
              </button>
            )
          )}
          <button
            className="btn btn-dark me-2"
            onClick={() => navigate(`/${currentUser ? currentUser.organization : ''}`)}
          >
            Back
          </button>
        </div>
      </div>
  
      {editMode ? (
        <div className="edit-form">
          <Form ref={form}>
            <div className="mb-1">
              <strong>Box name:</strong>
            </div>
            <div className="form-group horizontal-fields">
              <div>
                <Input
                  type="text"
                  className="form-control"
                  id="organization"
                  name="organization"
                  value={currentUser ? currentUser.organization : ''}
                  onChange={handleInputChange}
                  disabled
                />
              </div>
              <span className="separator">/</span>
              <div>
                <Input
                  type="text"
                  className="form-control"
                  id="name"
                  name="name"
                  value={currentBox.name}
                  onChange={handleInputChange}
                  validations={[required, validateName]}
                  required
                />
              </div>
            </div>
            <label>The name of your Vagrant box is used in tools, notifications, routing, and this UI. Short and simple is best.</label>
            <div className="form-group">
              <label>
                <strong>Status:</strong>
              </label>
              {currentBox.published ? "Published" : "Pending"}
            </div>
            <div className="form-group">
              <label>
                <strong>Visibility:</strong>
              </label>
              <div>
                <div className="form-check">
                  <Input
                    type="radio"
                    className="form-check-input"
                    id="visibilityPrivate"
                    name="isPublic"
                    value="false"
                    checked={!currentBox.isPublic ? 1 : 0}
                    onChange={handleInputChange}
                  />
                  <label className="form-check-label" htmlFor="visibilityPrivate">
                    Private
                  </label>
                </div>
                <div className="form-check">
                  <Input
                    type="radio"
                    className="form-check-input"
                    id="visibilityPublic"
                    name="isPublic"
                    value="true"
                    checked={currentBox.isPublic ? 1 : 0}
                    onChange={handleInputChange}
                  />
                  <label className="form-check-label" htmlFor="visibilityPublic">
                    Public
                  </label>
                </div>
                <div>Making a box private prevents users from accessing it unless given permission.</div>
              </div>
            </div>
  
            <div className="form-group">
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
            <CheckButton style={{ display: "none" }} ref={checkBtn} />
          </Form>
        </div>
      ) : (
        currentBox.id && (
          <div>
            <p><strong>Name:</strong> {currentBox.name}</p>
            <p><strong>Status:</strong> {currentBox.published ? "Published" : "Pending"}</p>
            <p><strong>Visibility:</strong> {currentBox.isPublic ? "Public" : "Private"}</p>
            <p><strong>Description:</strong> {currentBox.description}</p>
          </div>
        )
      )}
  
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>Versions</h4>
        {isAuthorized && (
          <div>
            <button
              className={`btn ${showAddVersionForm ? 'btn-secondary' : 'btn-outline-success'} me-2`}
              onClick={() => setShowAddVersionForm(!showAddVersionForm)}
            >
              {showAddVersionForm ? "Cancel" : "Add Version"}
            </button>
            {showAddVersionForm && (
              <button type="button" className="btn btn-success" onClick={addVersion}>
                Submit
              </button>
            )}
          </div>
        )}
      </div>
  
      {showAddVersionForm && (
        <div className="add-version-form">
          <Form onSubmit={addVersion} ref={form}>
            <div className="form-group">
              <label htmlFor="versionNumber">Version Number</label>
              <Input
                type="text"
                className="form-control"
                id="versionNumber"
                name="versionNumber"
                value={newVersion.versionNumber}
                onChange={handleInputChange}
                validations={[required, validateName]}
                required
              />
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
            <CheckButton style={{ display: "none" }} ref={checkBtn} />
          </Form>
        </div>
      )}
  
      <table className="table">
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
                <Link to={`/${currentBox.organization}/${name}/${version.versionNumber}`}>
                  {version.versionNumber}
                </Link>
              </td>
              <td>{version.description}</td>
              <td>
                {providers[version.versionNumber] && providers[version.versionNumber].map((provider, idx) => (
                  <div key={idx}>
                    <Link to={`/${currentBox.organization}/${name}/${version.versionNumber}/${provider.name}`}>
                      {provider.name}
                    </Link>
                  </div>
                ))}
              </td>
              {isAuthorized && (
                <td>
                  <button
                    className="btn btn-danger"
                    onClick={() => deleteVersion(version.versionNumber)}
                  >
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Box;
