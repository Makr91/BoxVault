import PropTypes from "prop-types";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Table from "react-bootstrap/Table";
import { useParams, useNavigate, Link } from "react-router-dom";

import EventBus from "../common/EventBus";
import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import AuthService from "../services/auth.service";
import BoxDataService from "../services/box.service";
import { log } from "../utils/Logger";

import ConfirmationModal from "./confirmation.component";

const BoxesList = ({ showOnlyPublic, theme }) => {
  const isMountedRef = useRef(true);
  const { organization: routeOrganization } = useParams();
  const [boxes, setBoxes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [searchName, setSearchName] = useState("");
  const currentUser = AuthService.getCurrentUser();

  // Stabilize organization dependency with useMemo
  const organization = useMemo(
    () => routeOrganization || (currentUser ? currentUser.organization : null),
    [routeOrganization, currentUser]
  );

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

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  const validateName = (value) =>
    validCharsRegex.test(value)
      ? undefined
      : "Invalid name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.";

  const fetchGravatarUrl = useCallback(async (emailHash) => {
    try {
      const profile = await AuthService.getGravatarProfile(emailHash);
      if (profile && profile.avatar_url) {
        return profile.avatar_url;
      }
    } catch (error) {
      log.api.error("Error fetching Gravatar profile", {
        emailHash,
        error: error.message,
      });
    }
    return null;
  }, []);

  const fetchGravatarUrls = useCallback(
    async (boxesList) => {
      const urls = {};
      const uniqueOrgs = new Map();

      boxesList.forEach((box) => {
        const orgName = box.user?.organization?.name;
        const emailHash = box.user?.organization?.emailHash;
        if (orgName && emailHash && !uniqueOrgs.has(orgName)) {
          uniqueOrgs.set(orgName, emailHash);
        }
      });

      const gravatarPromises = Array.from(uniqueOrgs.entries()).map(
        async ([orgName, emailHash]) => {
          try {
            const url = await fetchGravatarUrl(emailHash);
            return { orgName, url };
          } catch (error) {
            log.api.error("Error fetching Gravatar for organization", {
              orgName,
              error: error.message,
            });
            return { orgName, url: null };
          }
        }
      );

      const results = await Promise.all(gravatarPromises);
      results.forEach((result) => {
        if (result.url) {
          urls[result.orgName] = result.url;
        }
      });

      return urls;
    },
    [fetchGravatarUrl]
  );

  const calculatePublicDownloads = (box) => {
    if (!box.versions) {
      return 0;
    }
    return box.versions.reduce((versionTotal, version) => {
      if (!version.providers) {
        return versionTotal;
      }
      const versionDownloads = version.providers.reduce(
        (providerTotal, provider) => {
          if (!provider.architectures) {
            return providerTotal;
          }
          const providerDownloads = provider.architectures.reduce(
            (archTotal, architecture) => {
              if (!architecture.files) {
                return archTotal;
              }
              const archDownloads = architecture.files.reduce(
                (fileTotal, file) => fileTotal + file.downloadCount,
                0
              );
              return archTotal + archDownloads;
            },
            0
          );
          return providerTotal + providerDownloads;
        },
        0
      );
      return versionTotal + versionDownloads;
    }, 0);
  };

  const calculatePrivateDownloads = (box) => {
    if (!box.providers) {
      return 0;
    }
    return box.providers.reduce((providerTotal, provider) => {
      if (!provider.architectures) {
        return providerTotal;
      }
      const providerDownloads = provider.architectures.reduce(
        (archTotal, architecture) => {
          if (!architecture.files) {
            return archTotal;
          }
          const archDownloads = architecture.files.reduce(
            (fileTotal, file) => fileTotal + file.downloadCount,
            0
          );
          return archTotal + archDownloads;
        },
        0
      );
      return providerTotal + providerDownloads;
    }, 0);
  };

  const getProviderNames = (box) => {
    if (box.versions) {
      return [
        ...new Set(
          box.versions.flatMap((version) =>
            version.providers
              ? version.providers.map((provider) => provider.name)
              : []
          )
        ),
      ];
    }
    if (box.providers) {
      return [...new Set(box.providers.map((provider) => provider.name))];
    }
    return [];
  };

  const getArchitectureNames = (box) => {
    if (box.versions) {
      return [
        ...new Set(
          box.versions.flatMap((version) =>
            version.providers
              ? version.providers.flatMap((provider) =>
                  provider.architectures
                    ? provider.architectures.map(
                        (architecture) => architecture.name
                      )
                    : []
                )
              : []
          )
        ),
      ];
    }
    if (box.providers) {
      return [
        ...new Set(
          box.providers.flatMap((provider) =>
            provider.architectures
              ? provider.architectures.map((architecture) => architecture.name)
              : []
          )
        ),
      ];
    }
    return [];
  };

  const retrieveBoxes = useCallback(() => {
    if (showOnlyPublic) {
      BoxDataService.discoverAll()
        .then((response) => {
          if (isMountedRef.current) {
            const allBoxes = Array.isArray(response.data) ? response.data : [];
            setBoxes(allBoxes);
          }
        })
        .catch((e) => {
          if (e.response?.status === 401) {
            EventBus.dispatch("logout", null);
            setBoxes([]);
          } else {
            log.api.error("Error retrieving public boxes", {
              error: e.message,
            });
            setMessage("Error retrieving public boxes.");
            setMessageType("danger");
          }
        });
    } else if (organization) {
      BoxDataService.getAll(organization)
        .then((response) => {
          if (isMountedRef.current) {
            const allBoxes = Array.isArray(response.data) ? response.data : [];
            setBoxes(allBoxes);
          }
        })
        .catch((e) => {
          if (e.response?.status === 401) {
            EventBus.dispatch("logout", null);
            setBoxes([]);
          } else {
            log.api.error("Error retrieving organization boxes", {
              organization,
              error: e.message,
            });
            setMessage("Error retrieving organization boxes.");
            setMessageType("danger");
          }
        });
    }
  }, [showOnlyPublic, organization]);

  useEffect(() => {
    // Set document title based on organization
    if (organization) {
      document.title = organization;
    } else {
      document.title = "BoxVault";
    }
  }, [organization]);

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
          let allBoxes = [];
          if (showOnlyPublic) {
            allBoxes = Array.isArray(response.data) ? response.data : [];
          } else {
            allBoxes = Array.isArray(response.data) ? response.data : [];
          }

          setBoxes(allBoxes);

          const urls = await fetchGravatarUrls(allBoxes);
          setGravatarUrls(urls);
        }
      } catch (e) {
        log.api.error("Error fetching boxes", {
          showOnlyPublic,
          organization,
          error: e.message,
        });
        if (isMountedRef.current) {
          setBoxes([]);
          const errorMessage =
            e.response && e.response.data && e.response.data.message
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
  }, [showOnlyPublic, organization, fetchGravatarUrls]);

  const onChangeSearchName = (e) => {
    const searchValue = e.target.value;
    setSearchName(searchValue);
  };

  const refreshList = () => {
    retrieveBoxes();
    setCurrentIndex(-1);
  };

  const removeAllBoxes = () => {
    if (organization) {
      BoxDataService.removeAll(organization)
        .then(() => {
          refreshList();
          setMessage("All boxes removed successfully.");
          setMessageType("success");
        })
        .catch((e) => {
          log.api.error("Error removing all boxes", {
            organization,
            error: e.message,
          });
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

    const filterBoxes = (boxesData) =>
      boxesData.filter((box) =>
        box.name.toLowerCase().includes(searchName.toLowerCase())
      );

    const fetchAndFilterBoxes = async () => {
      try {
        let response;
        if (showOnlyPublic) {
          response = await BoxDataService.discoverAll();
        } else if (organization) {
          response = await BoxDataService.getAll(organization);
        }

        if (isMountedRef.current) {
          let allBoxes = [];
          if (showOnlyPublic) {
            allBoxes = Array.isArray(response.data) ? response.data : [];
          } else {
            allBoxes = Array.isArray(response.data) ? response.data : [];
          }
          const filteredBoxes = filterBoxes(allBoxes);
          setBoxes(filteredBoxes);
        }
      } catch (e) {
        log.api.error("Error filtering boxes", {
          searchName,
          error: e.message,
        });
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
    const { name: fieldName, value } = event.target;
    setNewBox({
      ...newBox,
      [fieldName]: fieldName === "isPublic" ? value === "true" : value,
    });

    if (fieldName === "name") {
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
      .then(() => {
        setShowCreateForm(false);
        setNewBox({ name: "", description: "", isPublic: false });
        refreshList();
        navigate(`/${currentUser.organization}/${newBox.name}`);
        setMessage("Box created successfully.");
        setMessageType("success");
      })
      .catch((e) => {
        log.api.error("Error creating box", {
          boxName: newBox.name,
          error: e.message,
        });
        const errorMessage =
          e.response && e.response.data && e.response.data.message
            ? e.response.data.message
            : "An error occurred while creating the box.";
        setMessage(errorMessage);
        setMessageType("danger");
      });
  };

  const canEditBoxes = (box) =>
    currentUser && currentUser.organization === box.organization;

  const renderOrgLogo = (box) => {
    if (gravatarUrls[box.user?.organization?.name]) {
      return (
        <img
          src={gravatarUrls[box.user?.organization?.name]}
          alt=""
          className="rounded-circle"
          width="30"
          height="30"
          style={{
            marginRight: "10px",
            verticalAlign: "middle",
          }}
        />
      );
    }

    const LogoComponent = theme === "light" ? BoxVaultLight : BoxVaultDark;
    return (
      <LogoComponent
        style={{
          width: "30px",
          height: "30px",
          marginRight: "10px",
        }}
      />
    );
  };

  const renderTableRow = (box, index) => {
    const totalDownloads = showOnlyPublic
      ? calculatePublicDownloads(box)
      : calculatePrivateDownloads(box);
    const providerNames = getProviderNames(box);
    const architectureNames = getArchitectureNames(box);
    const organizationName =
      box.user.organization.name || currentUser.organization;

    return (
      <tr
        className={index === currentIndex ? "active" : ""}
        key={box.id || box.name}
      >
        <td>
          {renderOrgLogo(box)}
          <Link
            to={`/${organizationName}/${box.name}`}
            style={{ verticalAlign: "middle" }}
          >
            {organizationName}/{box.name}
          </Link>
        </td>
        <td className="px-2">{box.published ? "Published" : "Pending"}</td>
        <td>{box.public || box.isPublic ? "Public" : "Private"}</td>
        <td>{new Date(box.createdAt).toLocaleDateString()}</td>
        <td>{totalDownloads}</td>
        <td>
          {box.versions ? box.versions.length : box.numberOfVersions || 0}
        </td>
        <td>{providerNames.length > 0 ? providerNames.join(", ") : "N/A"}</td>
        <td>
          {architectureNames.length > 0 ? architectureNames.join(", ") : "N/A"}
        </td>
      </tr>
    );
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
          {!showOnlyPublic && (
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
              <label htmlFor="boxName">
                <strong>Box name:</strong>
              </label>
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
                    id="boxName"
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
                The name of your Vagrant box is used in tools, notifications,
                routing, and this UI. Short and simple is best.
              </small>
            </div>
            <div className="form-group mt-2">
              <label htmlFor="description">
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
              <label htmlFor="visibility">
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
                  <label
                    className="form-check-label"
                    htmlFor="visibilityPrivate"
                  >
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
                  <label
                    className="form-check-label"
                    htmlFor="visibilityPublic"
                  >
                    Public
                  </label>
                </div>
              </div>
              <small className="form-text text-muted">
                Making a box private prevents users from accessing it unless
                given permission.
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
              boxes.map((box, index) => renderTableRow(box, index))
            ) : (
              <tr>
                <td colSpan="8" className="text-center">
                  No boxes found
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
};

BoxesList.propTypes = {
  showOnlyPublic: PropTypes.bool.isRequired,
  theme: PropTypes.string.isRequired,
};

export default BoxesList;
