import PropTypes from "prop-types";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Table from "react-bootstrap/Table";
import { useTranslation } from "react-i18next";
import { FaSortUp, FaSortDown, FaSort } from "react-icons/fa6";
import { useParams, useNavigate, Link } from "react-router-dom";

import EventBus from "../common/EventBus";
import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import AuthService from "../services/auth.service";
import BoxDataService from "../services/box.service";
import { log } from "../utils/Logger";

import ConfirmationModal from "./confirmation.component";
import IsoList from "./iso-list.component";

const BoxesList = ({ showOnlyPublic, theme }) => {
  const { t } = useTranslation();
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

  // Sort and filter state - load initial values from localStorage
  const [sortColumn, setSortColumn] = useState(() => {
    const key = `boxvault_table_prefs_${routeOrganization || "home"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        return prefs.sortColumn || null;
      } catch {
        return null;
      }
    }
    return null;
  });

  const [sortDirection, setSortDirection] = useState(() => {
    const key = `boxvault_table_prefs_${routeOrganization || "home"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        return prefs.sortDirection || "asc";
      } catch {
        return "asc";
      }
    }
    return "asc";
  });

  const [activeProviders, setActiveProviders] = useState(() => {
    const key = `boxvault_table_prefs_${routeOrganization || "home"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        return new Set(prefs.providers || []);
      } catch {
        return new Set();
      }
    }
    return new Set();
  });

  const [activeArchitectures, setActiveArchitectures] = useState(() => {
    const key = `boxvault_table_prefs_${routeOrganization || "home"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        return new Set(prefs.architectures || []);
      } catch {
        return new Set();
      }
    }
    return new Set();
  });

  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  const validateName = (value) =>
    validCharsRegex.test(value)
      ? undefined
      : "Invalid name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.";

  // Helper functions - defined before use
  const calculatePublicDownloads = useCallback((box) => {
    if (!box.versions) {
      return 0;
    }
    return box.versions.reduce((versionTotal, version) => {
      if (!version.providers) {
        return versionTotal;
      }
      return (
        versionTotal +
        version.providers.reduce((providerTotal, provider) => {
          if (!provider.architectures) {
            return providerTotal;
          }
          return (
            providerTotal +
            provider.architectures.reduce((archTotal, architecture) => {
              if (!architecture.files) {
                return archTotal;
              }
              return (
                archTotal +
                architecture.files.reduce(
                  (fileTotal, file) => fileTotal + file.downloadCount,
                  0
                )
              );
            }, 0)
          );
        }, 0)
      );
    }, 0);
  }, []);

  const getProviderNames = useCallback((box) => {
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
  }, []);

  const getArchitectureNames = useCallback((box) => {
    if (box.versions) {
      return [
        ...new Set(
          box.versions.flatMap((version) =>
            version.providers
              ? version.providers.flatMap((provider) =>
                  provider.architectures
                    ? provider.architectures.map((arch) => arch.name)
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
              ? provider.architectures.map((arch) => arch.name)
              : []
          )
        ),
      ];
    }
    return [];
  }, []);

  // Extract unique providers and architectures with counts
  const allProviders = useMemo(() => {
    const providerCounts = {};
    boxes.forEach((box) => {
      getProviderNames(box).forEach((provider) => {
        providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      });
    });
    return providerCounts;
  }, [boxes, getProviderNames]);

  const allArchitectures = useMemo(() => {
    const archCounts = {};
    boxes.forEach((box) => {
      getArchitectureNames(box).forEach((arch) => {
        archCounts[arch] = (archCounts[arch] || 0) + 1;
      });
    });
    return archCounts;
  }, [boxes, getArchitectureNames]);

  // Toggle tag filter
  const toggleProviderFilter = (provider) => {
    setActiveProviders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(provider)) {
        newSet.delete(provider);
      } else {
        newSet.add(provider);
      }
      return newSet;
    });
  };

  const toggleArchitectureFilter = (arch) => {
    setActiveArchitectures((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(arch)) {
        newSet.delete(arch);
      } else {
        newSet.add(arch);
      }
      return newSet;
    });
  };

  // Handle column sort
  const handleSort = (column) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Filter and sort boxes
  const processedBoxes = useMemo(() => {
    let filtered = [...boxes];

    // Apply provider filter
    if (activeProviders.size > 0) {
      filtered = filtered.filter((box) => {
        const providers = getProviderNames(box);
        return providers.some((p) => activeProviders.has(p));
      });
    }

    // Apply architecture filter
    if (activeArchitectures.size > 0) {
      filtered = filtered.filter((box) => {
        const archs = getArchitectureNames(box);
        return archs.some((a) => activeArchitectures.has(a));
      });
    }

    // Apply search filter
    if (searchName.trim()) {
      filtered = filtered.filter((box) =>
        box.name.toLowerCase().includes(searchName.toLowerCase())
      );
    }

    // Apply sort
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal;
        let bVal;

        switch (sortColumn) {
          case "name":
            aVal = a.name.toLowerCase();
            bVal = b.name.toLowerCase();
            break;
          case "created":
            aVal = new Date(a.createdAt).getTime();
            bVal = new Date(b.createdAt).getTime();
            break;
          case "downloads":
            aVal = calculatePublicDownloads(a);
            bVal = calculatePublicDownloads(b);
            break;
          case "versions":
            aVal = a.versions ? a.versions.length : 0;
            bVal = b.versions ? b.versions.length : 0;
            break;
          default:
            return 0;
        }

        if (aVal < bVal) {
          return sortDirection === "asc" ? -1 : 1;
        }
        if (aVal > bVal) {
          return sortDirection === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [
    boxes,
    activeProviders,
    activeArchitectures,
    searchName,
    sortColumn,
    sortDirection,
    calculatePublicDownloads,
    getProviderNames,
    getArchitectureNames,
  ]);

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
        const orgName =
          box.user?.organization?.name || box.user?.primaryOrganization?.name;
        const emailHash =
          box.user?.organization?.emailHash ||
          box.user?.primaryOrganization?.emailHash;
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
            setMessage(t("box.organization.errors.retrievePublic"));
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
            setMessage(t("box.organization.errors.retrieveOrg"));
            setMessageType("danger");
          }
        });
    }
  }, [showOnlyPublic, organization, t]);

  useEffect(() => {
    // Set document title based on page type
    // Main page (public view) should always show "BoxVault"
    // Organization page should show organization name
    if (showOnlyPublic) {
      document.title = "BoxVault";
    } else if (organization) {
      document.title = organization;
    } else {
      document.title = "BoxVault";
    }
  }, [organization, showOnlyPublic]);

  // Save preferences to localStorage when they change (loading done in initial state)
  useEffect(() => {
    const key = `boxvault_table_prefs_${organization || "home"}`;
    const prefs = {
      sortColumn,
      sortDirection,
      providers: Array.from(activeProviders),
      architectures: Array.from(activeArchitectures),
    };
    localStorage.setItem(key, JSON.stringify(prefs));
  }, [
    sortColumn,
    sortDirection,
    activeProviders,
    activeArchitectures,
    organization,
  ]);

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
              : t("box.organization.errors.retrieveOrg");
          setMessage(errorMessage);
          setMessageType("danger");
        }
      }
    };

    fetchBoxes();

    return () => {
      isMountedRef.current = false;
    };
  }, [showOnlyPublic, organization, fetchGravatarUrls, t]);

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
          setMessage(t("box.organization.messages.removeAllSuccess"));
          setMessageType("success");
        })
        .catch((e) => {
          log.api.error("Error removing all boxes", {
            organization,
            error: e.message,
          });
          setMessage(t("box.organization.errors.removeAll"));
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
        setMessage(t("box.organization.errors.filter"));
        setMessageType("danger");
      }
    };

    fetchAndFilterBoxes();
  }, [searchName, showOnlyPublic, organization, retrieveBoxes, t]);

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
        setMessage(t("box.organization.messages.boxCreated"));
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
            : t("box.organization.errors.boxCreate");
        setMessage(errorMessage);
        setMessageType("danger");
      });
  };

  const canEditBoxes = (box) =>
    currentUser && currentUser.organization === box.organization;

  const renderSortIcon = (column) => {
    if (sortColumn !== column) {
      return <FaSort />;
    }
    return sortDirection === "asc" ? <FaSortUp /> : <FaSortDown />;
  };

  const renderOrgLogo = (box) => {
    const orgName =
      box.user?.organization?.name || box.user?.primaryOrganization?.name;
    if (gravatarUrls[orgName]) {
      return (
        <img
          src={gravatarUrls[orgName]}
          alt=""
          className="rounded-circle avatar-lg icon-with-margin-sm v-align-middle"
        />
      );
    }

    const LogoComponent = theme === "light" ? BoxVaultLight : BoxVaultDark;
    return <LogoComponent className="logo-xl icon-with-margin-sm" />;
  };

  const renderTableRow = (box, index) => {
    const totalDownloads = calculatePublicDownloads(box);
    const providerNames = getProviderNames(box);
    const architectureNames = getArchitectureNames(box);
    const organizationName =
      routeOrganization ||
      box.user?.primaryOrganization?.name ||
      currentUser?.organization ||
      "Unknown";

    return (
      <tr
        className={index === currentIndex ? "active" : ""}
        key={box.id || box.name}
      >
        <td>
          {renderOrgLogo(box)}
          <Link
            to={`/${organizationName}/${box.name}`}
            className="v-align-middle"
          >
            {organizationName}/{box.name}
          </Link>
        </td>
        <td className="px-2">
          <span
            className={`badge ${box.published ? "bg-success" : "bg-warning"}`}
          >
            {box.published
              ? t("box.organization.status.published")
              : t("box.organization.status.pending")}
          </span>
        </td>
        <td>
          <span
            className={`badge ${box.public || box.isPublic ? "bg-info" : "bg-secondary"}`}
          >
            {box.public || box.isPublic
              ? t("box.organization.visibility.public")
              : t("box.organization.visibility.private")}
          </span>
        </td>
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
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
        {/* Left: Search */}
        <div className="d-flex align-items-center gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder={t("common:actions.search")}
            id="search"
            name="search"
            value={searchName}
            onChange={onChangeSearchName}
          />
          <button
            className="btn btn-sm btn-outline-secondary"
            type="button"
            onClick={findByName}
          >
            {t("common:actions.search")}
          </button>
        </div>

        {/* Center: Tag Cloud Pills (compact, inline) */}
        {(Object.keys(allProviders).length > 0 ||
          Object.keys(allArchitectures).length > 0) && (
          <div className="d-flex flex-wrap align-items-center gap-1 flex-grow-1">
            <small className="text-muted">{t("box.filter")}:</small>
            {Object.entries(allProviders).map(([provider, count]) => (
              <span
                key={provider}
                className={`badge rounded-pill badge-xs cursor-pointer ${
                  activeProviders.has(provider)
                    ? "bg-primary"
                    : "bg-secondary bg-opacity-25"
                }`}
                onClick={() => toggleProviderFilter(provider)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleProviderFilter(provider);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {provider} ({count})
              </span>
            ))}
            {Object.entries(allArchitectures).map(([arch, count]) => (
              <span
                key={arch}
                className={`badge rounded-pill badge-xs cursor-pointer ${
                  activeArchitectures.has(arch)
                    ? "bg-info"
                    : "bg-secondary bg-opacity-25"
                }`}
                onClick={() => toggleArchitectureFilter(arch)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleArchitectureFilter(arch);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {arch} ({count})
              </span>
            ))}
          </div>
        )}

        {/* Right: Action Buttons */}
        <div className="d-flex gap-2">
          {showOnlyPublic && (
            <Link
              to="/organizations/discover"
              className="btn btn-sm btn-outline-primary"
            >
              {t("navbar.organization")}
            </Link>
          )}
          {!showOnlyPublic && canEditBoxes({ organization }) && (
            <>
              <button
                className="btn btn-sm btn-outline-success"
                onClick={createBox}
                disabled={!!validationErrors.name}
              >
                {showCreateForm
                  ? t("box.organization.buttons.createBox")
                  : t("box.organization.buttons.createNewBox")}
              </button>
              {showCreateForm && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewBox({ name: "", description: "", isPublic: false });
                    setValidationErrors({});
                  }}
                >
                  {t("buttons.cancel")}
                </button>
              )}
              <button
                className="btn btn-sm btn-danger"
                onClick={handleDeleteClick}
              >
                {t("box.organization.buttons.removeAll")}
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
              className="btn btn-sm btn-outline-primary"
              onClick={() => navigate("/")}
            >
              {t("actions.back")}
            </button>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="create-form mt-2 mb-3">
          <h4>{t("box.organization.headers.createNewBox")}</h4>
          <form>
            <div className="form-group">
              <label htmlFor="boxName">
                <strong>{t("box.name")}:</strong>
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
                {t("box.shortDescription")}
              </small>
            </div>
            <div className="form-group mt-2">
              <label htmlFor="description">
                <strong>{t("box.description")}:</strong>
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
                <strong>{t("box.visibility")}:</strong>
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
                    checked={newBox.isPublic}
                    onChange={handleInputChange}
                  />
                  <label
                    className="form-check-label"
                    htmlFor="visibilityPublic"
                  >
                    {t("box.organization.visibility.public")}
                  </label>
                </div>
              </div>
              <small className="form-text text-muted">
                {t("box.visibilityHint")}
              </small>
            </div>
          </form>
        </div>
      )}

      <div className="col-md-12">
        <h4>{t("box.organization.headers.templateList")}</h4>
        <Table striped className="table">
          <thead>
            <tr>
              <th
                onClick={() => handleSort("name")}
                className="sortable-header"
              >
                {t("box.organization.table.box")} {renderSortIcon("name")}
              </th>
              <th>{t("box.organization.table.status")}</th>
              <th>{t("box.organization.table.public")}</th>
              <th
                onClick={() => handleSort("created")}
                className="sortable-header"
              >
                {t("box.organization.table.created")}{" "}
                {renderSortIcon("created")}
              </th>
              <th
                onClick={() => handleSort("downloads")}
                className="sortable-header"
              >
                {t("box.organization.table.downloads")}{" "}
                {renderSortIcon("downloads")}
              </th>
              <th
                onClick={() => handleSort("versions")}
                className="sortable-header"
              >
                {t("box.organization.table.versions")}{" "}
                {renderSortIcon("versions")}
              </th>
              <th>{t("box.organization.table.providers")}</th>
              <th>{t("box.organization.table.architectures")}</th>
            </tr>
          </thead>
          <tbody key="tbody">
            {processedBoxes.length > 0 ? (
              processedBoxes.map((box, index) => renderTableRow(box, index))
            ) : (
              <tr>
                <td colSpan="8" className="text-center">
                  {t("box.organization.table.noBoxes")}
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

const Organization = ({ showOnlyPublic, theme }) => {
  const { organization: routeOrganization } = useParams();
  const currentUser = AuthService.getCurrentUser();
  const organization =
    routeOrganization || (currentUser ? currentUser.organization : null);
  const [activeTab, setActiveTab] = useState("boxes");

  const isAuthorized = currentUser && currentUser.organization === organization;

  if (showOnlyPublic) {
    return <BoxesList showOnlyPublic theme={theme} />;
  }

  return (
    <div className="container">
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "boxes" ? "active" : ""}`}
            onClick={() => setActiveTab("boxes")}
          >
            Boxes
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "isos" ? "active" : ""}`}
            onClick={() => setActiveTab("isos")}
          >
            ISOs
          </button>
        </li>
      </ul>

      {activeTab === "boxes" && (
        <BoxesList showOnlyPublic={false} theme={theme} />
      )}
      {activeTab === "isos" && (
        <IsoList
          key={organization}
          organization={organization}
          isAuthorized={isAuthorized}
        />
      )}
    </div>
  );
};

Organization.propTypes = {
  showOnlyPublic: PropTypes.bool.isRequired,
  theme: PropTypes.string.isRequired,
};

export default Organization;
