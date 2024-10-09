import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import BoxDataService from "../services/box.service";
import AuthService from "../services/auth.service";
import { Link } from "react-router-dom";

const BoxesList = ({ showOnlyPublic }) => {
  const isMountedRef = useRef(true);

  const { organization: routeOrganization } = useParams();
  const [boxes, setBoxes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [searchName, setSearchName] = useState("");
  const currentUser = AuthService.getCurrentUser();
  const organization = routeOrganization || (currentUser ? currentUser.organization : null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBox, setNewBox] = useState({
    name: "",
    description: "",
    isPublic: false,
  });
  const navigate = useNavigate();

  const retrieveBoxes = useCallback(() => {
    if (showOnlyPublic) {
      BoxDataService.discoverAll()
        .then(response => {
          if (isMountedRef.current) {
            const allBoxes = Array.isArray(response.data) ? response.data : [];
            console.log("Public Boxes:", allBoxes);
            setBoxes(allBoxes);
          }
        })
        .catch(e => {
          console.log(e);
        });
    } else if (organization) {
      BoxDataService.getAll(organization)
        .then(response => {
          if (isMountedRef.current) {
            const allBoxes = Array.isArray(response.data.boxes) ? response.data.boxes : [];
            console.log("Organization Boxes:", allBoxes);
            setBoxes(allBoxes);
          }
        })
        .catch(e => {
          console.log(e);
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
        }
  
        if (isMountedRef.current) {
          const allBoxes = Array.isArray(response.data) ? response.data : 
                           (response.data.boxes ? response.data.boxes : []);
          setBoxes(allBoxes);
        }
      } catch (e) {
        console.log(e);
        if (isMountedRef.current) {
          setBoxes([]);
        }
      }
    };
  
    fetchBoxes();
  
    return () => {
      isMountedRef.current = false;
    };
  }, [showOnlyPublic, organization]);

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
          console.log(response.data);
          refreshList();
        })
        .catch(e => {
          console.log(e);
        });
    }
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
        console.log(response.data);
        setShowCreateForm(false);
        setNewBox({ name: "", description: "", isPublic: false }); // Reset form
        refreshList();
        navigate(`/${currentUser.organization}/${newBox.name}`);
      })
      .catch(e => {
        console.log(e);
      });
  };

  const canEditBoxes = (box) => {
    return currentUser && currentUser.organization === box.organization;
  };
  
  return (
    <div className="list row">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="search-bar">
          <div className="input-group">
            <input
              type="text"
              className="form-control input-small"
              placeholder="Search by name"
              value={searchName}
              onChange={onChangeSearchName}
            />
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
        <div className="form-group horizontal-fields">
          {organization && (
            <>
              {canEditBoxes({ organization }) && (
                <>
                  <button
                    className="btn btn-outline-success me-2"
                    onClick={createBox}
                  >
                    {showCreateForm ? "Create Box" : "Create New Box"}
                  </button>
                  {showCreateForm && (
                    <button
                      className="btn btn-secondary me-2"
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    className="btn btn-danger me-2"
                    onClick={removeAllBoxes}
                  >
                    Remove All
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="create-form mb-3">
          <h4>Create New Box</h4>
          <form>
            <div className="form-group">
              <label>
                <strong>Box name:</strong>
              </label>
              <div className="form-group horizontal-fields">
                <div>
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
                <span className="separator">/</span>
                <div>
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
              <label>The name of your Vagrant box is used in tools, notifications, routing, and this UI. Short and simple is best.</label>
            </div>

            <div className="form-group">
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
              <div>Making a box private prevents users from accessing it unless given permission.</div>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description (Optional)</label>
              <textarea
                className="form-control"
                id="description"
                name="description"
                value={newBox.description}
                onChange={handleInputChange}
                rows="4"
                placeholder="The short description is used to describe the box."
              />
            </div>
          </form>
        </div>
      )}

      <div className="col-md-12">
        <h4>Template List</h4>
        <table className="table">
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
                const organizationName = box.organization || (currentUser ? currentUser.organization : "Unknown");

                return (
                  <tr
                    className={index === currentIndex ? "active" : ""}
                    key={index}
                  >
                    <td>
                      <Link
                        to={`/${organizationName}/${box.name}`}
                      >
                        {organizationName}/{box.name}
                      </Link>
                    </td>
                    <td>{box.published ? "Published" : "Pending"}</td>
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
        </table>
      </div>
    </div>
  );
};

export default BoxesList;