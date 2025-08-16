import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import BoxDataService from "../services/box.service";
import AuthService from "../services/auth.service";
import { Link } from "react-router-dom";
import ConfirmationModal from './confirmation.component';
import Table from 'react-bootstrap/Table';
import BoxVaultLight from '../images/BoxVault.svg?react';
import BoxVaultDark from '../images/BoxVaultDark.svg?react';
import EventBus from "../common/EventBus";


const BoxesList = ({ showOnlyPublic, theme }) => {
  const isMountedRef = useRef(true);
  const { organization: routeOrganization } = useParams();
  const [boxes, setBoxes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [searchName, setSearchName] = useState("");
  const currentUser = AuthService.getCurrentUser();
  const organization = routeOrganization || (currentUser ? currentUser.organization : null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [gravatarUrls, setGravatarUrls] = useState({});

  const [newBox, setNewBox] = useState({
    name: "",
    description: "",
    isPublic: false,
  });
  const navigate = useNavigate();

  // Add state for message and messageType
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const fetchGravatarUrl = useCallback(async (emailHash) => {
    try {
      const profile = await AuthService.getGravatarProfile(emailHash);
      if (profile && profile.avatar_url) {
        return profile.avatar_url;
      }
    } catch (error) {
      console.error("Error fetching Gravatar profile:", error);
    }
    return null;
  }, []);

  const retrieveBoxes = useCallback(() => {
    if (showOnlyPublic) {
      BoxDataService.discoverAll()
        .then(response => {
          if (isMountedRef.current) {
            const allBoxes = Array.isArray(response.data) ? response.data : [];
            setBoxes(allBoxes);
          }
        })
        .catch(e => {
          if (e.response?.status === 401) {
            // Token expired - clear cached data and update UI
            EventBus.dispatch("logout", null);
            setBoxes([]); // Clear any cached private boxes
          } else {
            console.log(e);
            setMessage("Error retrieving public boxes.");
            setMessageType("danger");
          }
        });
    } else if (organization) {
      BoxDataService.getAll(organization)
        .then(response => {
          if (isMountedRef.current) {
            const allBoxes = Array.isArray(response.data.boxes) ? response.data.boxes : [];
            setBoxes(allBoxes);
          }
        })
        .catch(e => {
          if (e.response?.status === 401) {
            // Token expired - clear cached data and update UI
            EventBus.dispatch("logout", null);
            setBoxes([]); // Clear any cached private boxes
          } else {
            console.log(e);
            setMessage("Error retrieving organization boxes.");
            setMessageType("danger");
          }
        });
    }
  }, [showOnlyPublic, organization]);


  useEffect(() => {
    isMountedRef.current = true;

    const fetchBoxes = async () => {
      try {
        let response;
        if (showOnlyPublic) {
          response = await BoxDataService.discoverAll();
        } else if (organization) {
          response = await BoxDataService.getAll(organization);
        } else {
          return;
        }

        if (isMountedRef.current) {
          const allBoxes = Array.isArray(response.data) ? response.data : 
                           (response.data.boxes ? response.data.boxes : []);
          setBoxes(allBoxes);

          const urls = {};
          for (const box of allBoxes) {
            const orgName = box.user?.organization?.name;
            if (orgName && !urls[orgName]) {
              const emailHash = box.user?.organization?.emailHash;
              if (emailHash) {
                try {
                  const url = await fetchGravatarUrl(emailHash);
                  urls[orgName] = url;
                } catch (error) {
                  console.error(`Error fetching Gravatar for ${orgName}:`, error);
                }
              }
            }
          }
          setGravatarUrls(urls);
        }
      } catch (e) {
        console.error("Error fetching boxes:", e);
        if (isMountedRef.current) {
          setBoxes([]);
          const errorMessage = e.response && e.response.data && e.response.data.message
            ? e.response.data.message
            : "Error fetching boxes.";
          setMessage(errorMessage);
          setMessageType("danger");
        }
      }
    };

    fetchBoxes();

    return () => {
      isMountedRef.current = false;
    };
  }, [showOnlyPublic, organization, fetchGravatarUrl]);



  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  const validateName = (value) => {
    return validCharsRegex.test(value) ? undefined : "Invalid name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.";
  };

  const onChangeSearchName = (e) => {
    const searchName = e.target.value;
    setSearchName(searchName);
  };

  const refreshList = () => {
    retrieveBoxes();
    setCurrentIndex(-1);
  };

  const removeAllBoxes = () => {
    if (organization) {
      BoxDataService.removeAll(organization)
        .then(response => {
          refreshList();
          setMessage("All boxes removed successfully.");
          setMessageType("success");
        })
        .catch(e => {
          console.log(e);
          setMessage("Error removing all boxes.");
          setMessageType("danger");
        });
    }
  };

  const handleDeleteClick = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleConfirmDelete = () => {
    removeAllBoxes();
  };

  const findByName = useCallback(() => {
    if (searchName.trim() === "") {
      retrieveBoxes();
      return;
    }

    const filterBoxes = (boxesData) => {
      return boxesData.filter(box => 
        box.name.toLowerCase().includes(searchName.toLowerCase())
      );
    };

    const fetchAndFilterBoxes = async () => {
      try {
        let response;
        if (showOnlyPublic) {
          response = await BoxDataService.discoverAll();
        } else if (organization) {
          response = await BoxDataService.getAll(organization);
        }

        if (isMountedRef.current) {
          const allBoxes = Array.isArray(response.data) ? response.data : 
                           (response.data.boxes ? response.data.boxes : []);
          const filteredBoxes = filterBoxes(allBoxes);
          setBoxes(filteredBoxes);
        }
      } catch (e) {
        console.log(e);
        if (isMountedRef.current) {
          setBoxes([]);
        }
        setMessage("Error filtering boxes.");
        setMessageType("danger");
      }
    };

    fetchAndFilterBoxes();
  }, [searchName, showOnlyPublic, organization, retrieveBoxes]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setNewBox({ 
      ...newBox, 
      [name]: name === "isPublic" ? value === "true" : value 
    });

    if (name === "name") {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, name: error });
    }
  };

  const createBox = () => {
    if (!showCreateForm) {
      setShowCreateForm(true);
      return;
    }

    const boxData = {
      ...newBox,
      organization: currentUser.organization,
    };

    BoxDataService.create(currentUser.organization, boxData)
      .then(response => {
        setShowCreateForm(false);
        setNewBox({ name: "", description: "", isPublic: false });
        refreshList();
        navigate(`/${currentUser.organization}/${newBox.name}`);
        setMessage("Box created successfully.");
        setMessageType("success");
      })
      .catch(e => {
        console.log(e);
        const errorMessage = e.response && e.response.data && e.response.data.message
          ? e.response.data.message
          : "An error occurred while creating the box.";
        setMessage(errorMessage);
        setMessageType("danger");
      });
  };

  const canEditBoxes = (box) => {
    return currentUser && currentUser.organization === box.organization;
  };

  return (
    <div className="list row">
      {message && (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      )}
      <div className="d-flex justify-content-between align-items-center">
        <div className="search-bar">
          <div className="input-group">
            <div className="form-group col-md-8">
              <input
                type="text"
                className="form-control"
                placeholder="Search by name"
                id="search"
                name="search"
                value={searchName}
                onChange={onChangeSearchName}
              />
            </div>
            <div className="input-group-append">
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={findByName}
              >
                Search
              </button>
            </div>
          </div>
        </div>
        <div className="form-group">
          {!showOnlyPublic && canEditBoxes({ organization }) && (
            <>
              <button
                className="btn btn-outline-success me-2"
                onClick={createBox}
                disabled={!!validationErrors.name}
              >
                {showCreateForm ? "Create Box" : "Create New Box"}
              </button>
              {showCreateForm && (
                <button
                  className="btn btn-secondary me-2"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewBox({ name: "", description: "", isPublic: false });
                    setValidationErrors({});
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                className="btn btn-danger me-2"
                onClick={handleDeleteClick}
              >
                Remove All
              </button>
              <ConfirmationModal
                show={showModal}
                handleClose={handleCloseModal}
                handleConfirm={handleConfirmDelete}
              />
            </>
          )}
          {!showOnlyPublic &&  (
            <button
              className="btn btn-outline-primary"
              onClick={() => navigate("/")}
            >
              Back
            </button>
          )}
        </div>
      </div>
  
      {showCreateForm && (
        <div className="create-form mt-2 mb-3">
          <h4>Create New Box</h4>
          <form>
            <div className="form-group">
              <label>
                <strong>Box name:</strong>
              </label>
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
                    value={newBox.name}
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
            </div>
            <div className="form-group mt-2">
              <label>
                <strong>Description:</strong>
              </label>
              <textarea
                className="form-control"
                id="description"
                name="description"
                value={newBox.description}
                onChange={handleInputChange}
                rows="3"
              />
            </div>
            <div className="form-group mt-2">
              <label>
                <strong>Visibility:</strong>
              </label>
              <div>
                <div className="form-check">
                  <input
                    type="radio"
                    className="form-check-input"
                    id="visibilityPrivate"
                    name="isPublic"
                    value="false"
                    checked={!newBox.isPublic}
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
                    checked={newBox.isPublic}
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
          </form>
        </div>
      )}
  
      <div className="col-md-12">
        <h4>Template List</h4>
        <Table striped className="table">
          <thead>
            <tr>
              <th>Box</th>
              <th>Status</th>
              <th>Public</th>
              <th>Created</th>
              <th>Downloads</th>
              <th># Versions</th>
              <th>Providers</th>
              <th>Architectures</th>
            </tr>
          </thead>
          <tbody key="tbody">
            {boxes.length > 0 ? (
              boxes.map((box, index) => {
                // Calculate total downloads for public view
                const totalDownloads = box.versions ? box.versions.reduce((versionTotal, version) => {
                  return versionTotal + (version.providers ? version.providers.reduce((providerTotal, provider) => {
                    return providerTotal + (provider.architectures ? provider.architectures.reduce((archTotal, architecture) => {
                      return archTotal + (architecture.files ? architecture.files.reduce((fileTotal, file) => {
                        return fileTotal + file.downloadCount;
                      }, 0) : 0);
                    }, 0) : 0);
                  }, 0) : 0);
                }, 0) : 0;
              
                // Calculate total downloads for private view
                const totalDownloadsPrivate = box.providers ? box.providers.reduce((providerTotal, provider) => {
                  return providerTotal + (provider.architectures ? provider.architectures.reduce((archTotal, architecture) => {
                    return archTotal + (architecture.files ? architecture.files.reduce((fileTotal, file) => {
                      return fileTotal + file.downloadCount;
                    }, 0) : 0);
                  }, 0) : 0);
                }, 0) : 0;
              
                // Get provider names for public view
                const providerNames = box.versions ? [...new Set(box.versions.flatMap(version => 
                  version.providers ? version.providers.map(provider => provider.name) : []
                ))] : [];
              
                // Get provider names for private view
                const providerNamesPrivate = box.providers ? [...new Set(box.providers.map(provider => provider.name))] : [];
              
                // Get architecture names for public view
                const architectureNames = box.versions ? [...new Set(box.versions.flatMap(version => 
                  version.providers ? version.providers.flatMap(provider => 
                    provider.architectures ? provider.architectures.map(architecture => architecture.name) : []
                  ) : []
                ))] : [];
              
                // Get architecture names for private view
                const architectureNamesPrivate = box.providers ? [...new Set(box.providers.flatMap(provider => 
                  provider.architectures ? provider.architectures.map(architecture => architecture.name) : []
                ))] : [];
              
                // Determine organization name
                const organizationName = box.user.organization.name || currentUser.organization;
              
                return (
                  <tr
                    className={index === currentIndex ? "active" : ""}
                    key={index}
                  >
                     <td>
                      {gravatarUrls[box.user?.organization?.name] ? (
                        <img
                          src={gravatarUrls[box.user?.organization?.name]}
                          alt=""
                          className="rounded-circle"
                          width="30"
                          height="30"
                          style={{ marginRight: '10px', verticalAlign: 'middle' }}
                        />
                      ) : (
                        theme === "light" ? <BoxVaultLight style={{ width: "30px", height: "30px", marginRight: "10px" }}  /> : <BoxVaultDark style={{ width: "30px", height: "30px", marginRight: "10px" }}  />
                      )}
                      <Link
                        to={`/${organizationName}/${box.name}`}
                        style={{ verticalAlign: 'middle' }}
                      >
                        {organizationName}/{box.name}
                      </Link>
                    </td>
                    <td className="px-2">{box.published ? "Published" : "Pending"}</td>
                    <td>{box.public || box.isPublic ? "Public" : "Private"}</td>
                    <td>{new Date(box.createdAt).toLocaleDateString()}</td>
                    <td>{totalDownloads || totalDownloadsPrivate}</td>
                    <td>{box.versions ? box.versions.length : box.numberOfVersions || 0}</td>
                    <td>{providerNames.length > 0 ? providerNames.join(', ') : providerNamesPrivate.join(', ') || "N/A"}</td>
                    <td>{architectureNames.length > 0 ? architectureNames.join(', ') : architectureNamesPrivate.join(', ') || "N/A"}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="text-center">No boxes found</td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
};

export default BoxesList;
