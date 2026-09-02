import PropTypes from 'prop-types';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Table from 'react-bootstrap/Table';
import { useTranslation } from 'react-i18next';
import { FaSortUp, FaSortDown, FaSort, FaStar, FaRegStar } from 'react-icons/fa6';
import { useParams, useNavigate, Link } from 'react-router-dom';

import EventBus from '../common/EventBus';
import BoxVaultLight from '../images/BoxVault.svg?react';
import BoxVaultDark from '../images/BoxVaultDark.svg?react';
import AuthService from '../services/auth.service';
import BoxDataService from '../services/box.service';
import OrganizationService from '../services/organization.service';
import { getDistroIconUrl, getOsDisplayName } from '../utils/DistroIcons';
import { log } from '../utils/Logger';
import { isGlobalAdmin, isOrgMember, isOrgManager } from '../utils/permissions';
import { formatRelativeTime } from '../utils/relativeTime';

import ConfirmationModal from './confirmation.component';
import IsoList from './iso-list.component';

// Box rows carry the box's OWN organization (never the owner's primary org,
// which can differ and would mislabel the row).
const resolveBoxOrg = box => {
  const org = box.organization || {};
  return { orgName: org.name, logo: org.logo, emailHash: org.emailHash };
};

// Readable OS info for a box, from backend-provided metadata.
const getBoxOsInfo = box => {
  const metadata = box.metadata || {};
  return {
    distro: metadata.distro || null,
    label: getOsDisplayName(metadata),
  };
};

// Newest version creation time (ms) for a box, or null without versions.
const getLatestReleaseTime = box => {
  if (!Array.isArray(box.versions) || box.versions.length === 0) {
    return null;
  }
  const latest = box.versions.reduce((newest, version) => {
    const time = new Date(version.createdAt).getTime();
    return Number.isNaN(time) ? newest : Math.max(newest, time);
  }, 0);
  return latest || null;
};

// One clickable filter-pill group (providers / architectures / OS).
const FilterPillGroup = ({ entries, activeSet, activeClass, onToggle }) =>
  Object.entries(entries).map(([value, count]) => (
    <span
      key={value}
      className={`badge rounded-pill badge-xs cursor-pointer ${
        activeSet.has(value) ? activeClass : 'bg-secondary bg-opacity-25'
      }`}
      onClick={() => onToggle(value)}
      onKeyPress={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle(value);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {value} ({count})
    </span>
  ));

FilterPillGroup.propTypes = {
  entries: PropTypes.objectOf(PropTypes.number).isRequired,
  activeSet: PropTypes.instanceOf(Set).isRequired,
  activeClass: PropTypes.string.isRequired,
  onToggle: PropTypes.func.isRequired,
};

// OS cell: round distro icon plus readable OS name; empty without metadata.
const BoxOsCell = ({ box }) => {
  const { distro, label } = getBoxOsInfo(box);
  const iconUrl = getDistroIconUrl(distro);
  if (!iconUrl && !label) {
    return null;
  }
  return (
    <>
      {iconUrl && (
        <img
          src={iconUrl}
          alt=""
          className="rounded-circle icon-with-margin-sm v-align-middle"
          style={{ width: 30, height: 30 }}
        />
      )}
      <span className="v-align-middle">{label}</span>
    </>
  );
};

BoxOsCell.propTypes = {
  box: PropTypes.object.isRequired,
};

const WatchStarCell = ({ watched, onToggle }) => {
  const { t } = useTranslation();
  const label = watched ? t('watch.unwatch') : t('watch.watch');
  return (
    <button
      type="button"
      className="btn btn-link btn-sm p-0 text-warning"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={watched}
    >
      {watched ? <FaStar /> : <FaRegStar />}
    </button>
  );
};

WatchStarCell.propTypes = {
  watched: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

const WatchedFilterPill = ({ active, count, onToggle }) => {
  const { t } = useTranslation();
  return (
    <span
      className={`badge rounded-pill badge-xs cursor-pointer ${
        active ? 'bg-warning text-dark' : 'bg-secondary bg-opacity-25'
      }`}
      onClick={onToggle}
      onKeyPress={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {t('watch.filterWatched')} ({count})
    </span>
  );
};

WatchedFilterPill.propTypes = {
  active: PropTypes.bool.isRequired,
  count: PropTypes.number.isRequired,
  onToggle: PropTypes.func.isRequired,
};

// Shared boxes table markup (sortable headers + rows): used for the flat
// list and for each per-organization group on the signed-in home page.
const BoxesTable = ({ boxes, renderRow, sortColumn, sortDirection, onSort, showWatchColumn }) => {
  const { t } = useTranslation();

  const renderSortIcon = column => {
    if (sortColumn !== column) {
      return <FaSort />;
    }
    return sortDirection === 'asc' ? <FaSortUp /> : <FaSortDown />;
  };

  return (
    <Table striped className="table">
      <thead>
        <tr>
          {showWatchColumn && <th aria-label={t('watch.filterWatched')} />}
          <th onClick={() => onSort('name')} className="sortable-header">
            {t('box.organization.table.box')} {renderSortIcon('name')}
          </th>
          <th onClick={() => onSort('os')} className="sortable-header">
            {t('box.organization.table.os')} {renderSortIcon('os')}
          </th>
          <th>{t('box.organization.table.status')}</th>
          <th>{t('box.organization.table.public')}</th>
          <th onClick={() => onSort('created')} className="sortable-header">
            {t('box.organization.table.created')} {renderSortIcon('created')}
          </th>
          <th onClick={() => onSort('released')} className="sortable-header">
            {t('box.organization.table.released')} {renderSortIcon('released')}
          </th>
          <th onClick={() => onSort('downloads')} className="sortable-header">
            {t('box.organization.table.downloads')} {renderSortIcon('downloads')}
          </th>
          <th onClick={() => onSort('versions')} className="sortable-header">
            {t('box.organization.table.versions')} {renderSortIcon('versions')}
          </th>
          <th>{t('box.organization.table.providers')}</th>
          <th>{t('box.organization.table.architectures')}</th>
        </tr>
      </thead>
      <tbody key="tbody">
        {boxes.length > 0 ? (
          boxes.map((box, index) => renderRow(box, index))
        ) : (
          <tr>
            <td colSpan={showWatchColumn ? 11 : 10} className="text-center">
              {t('box.organization.table.noBoxes')}
            </td>
          </tr>
        )}
      </tbody>
    </Table>
  );
};

BoxesTable.propTypes = {
  boxes: PropTypes.arrayOf(PropTypes.object).isRequired,
  renderRow: PropTypes.func.isRequired,
  sortColumn: PropTypes.string,
  sortDirection: PropTypes.string.isRequired,
  onSort: PropTypes.func.isRequired,
  showWatchColumn: PropTypes.bool.isRequired,
};

// One organization section on the signed-in home page: org logo + org
// display name + box count header above that organization's boxes table.
const OrgGroupSection = ({ orgName, logo, count, children }) => {
  const { t } = useTranslation();

  return (
    <div className="mb-4">
      <div className="d-flex align-items-center mb-2">
        {logo}
        <h5 className="mb-0 v-align-middle">{orgName}</h5>
        <span className="badge bg-secondary bg-opacity-50 ms-2">
          {t('box.organization.group.boxCount', { count })}
        </span>
      </div>
      {children}
    </div>
  );
};

OrgGroupSection.propTypes = {
  orgName: PropTypes.string.isRequired,
  logo: PropTypes.node.isRequired,
  count: PropTypes.number.isRequired,
  children: PropTypes.node.isRequired,
};

const BoxManageButtons = ({
  showCreateForm,
  onCreateBox,
  onCancelCreate,
  createDisabled,
  canManage,
  onRemoveAll,
  showRemoveModal,
  onCloseRemoveModal,
  onConfirmRemoveAll,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <button
        className="btn btn-sm btn-outline-success"
        onClick={onCreateBox}
        disabled={createDisabled}
      >
        {showCreateForm
          ? t('box.organization.buttons.createBox')
          : t('box.organization.buttons.createNewBox')}
      </button>
      {showCreateForm && (
        <button className="btn btn-sm btn-secondary" onClick={onCancelCreate}>
          {t('buttons.cancel')}
        </button>
      )}
      {canManage && (
        <>
          <button className="btn btn-sm btn-danger" onClick={onRemoveAll}>
            {t('box.organization.buttons.removeAll')}
          </button>
          <ConfirmationModal
            show={showRemoveModal}
            handleClose={onCloseRemoveModal}
            handleConfirm={onConfirmRemoveAll}
          />
        </>
      )}
    </>
  );
};

BoxManageButtons.propTypes = {
  showCreateForm: PropTypes.bool.isRequired,
  onCreateBox: PropTypes.func.isRequired,
  onCancelCreate: PropTypes.func.isRequired,
  createDisabled: PropTypes.bool.isRequired,
  canManage: PropTypes.bool.isRequired,
  onRemoveAll: PropTypes.func.isRequired,
  showRemoveModal: PropTypes.bool.isRequired,
  onCloseRemoveModal: PropTypes.func.isRequired,
  onConfirmRemoveAll: PropTypes.func.isRequired,
};

const BoxesList = ({ showOnlyPublic, theme }) => {
  const { t, i18n } = useTranslation();
  const isMountedRef = useRef(true);
  const { organization: routeOrganization } = useParams();
  const [boxes, setBoxes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [searchName, setSearchName] = useState('');
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
  const [watchedBoxIds, setWatchedBoxIds] = useState(() => new Set());
  const [watchedOnly, setWatchedOnly] = useState(false);
  const isSignedIn = Boolean(currentUser);

  const [newBox, setNewBox] = useState({
    name: '',
    description: '',
    isPublic: false,
  });
  const navigate = useNavigate();

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Sort and filter state - load initial values from localStorage
  const [sortColumn, setSortColumn] = useState(() => {
    const key = `boxvault_table_prefs_${routeOrganization || 'home'}`;
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
    const key = `boxvault_table_prefs_${routeOrganization || 'home'}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        return prefs.sortDirection || 'asc';
      } catch {
        return 'asc';
      }
    }
    return 'asc';
  });

  const [activeProviders, setActiveProviders] = useState(() => {
    const key = `boxvault_table_prefs_${routeOrganization || 'home'}`;
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
    const key = `boxvault_table_prefs_${routeOrganization || 'home'}`;
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

  const [activeOs, setActiveOs] = useState(() => {
    const key = `boxvault_table_prefs_${routeOrganization || 'home'}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        return new Set(prefs.os || []);
      } catch {
        return new Set();
      }
    }
    return new Set();
  });

  const validCharsRegex = /^[0-9a-zA-Z-._]+$/;

  const validateName = value =>
    validCharsRegex.test(value)
      ? undefined
      : 'Invalid name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.';

  // Helper functions - defined before use
  const calculatePublicDownloads = useCallback(box => {
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
                architecture.files.reduce((fileTotal, file) => fileTotal + file.downloadCount, 0)
              );
            }, 0)
          );
        }, 0)
      );
    }, 0);
  }, []);

  const getProviderNames = useCallback(box => {
    if (box.versions) {
      return [
        ...new Set(
          box.versions.flatMap(version =>
            version.providers ? version.providers.map(provider => provider.name) : []
          )
        ),
      ];
    }
    if (box.providers) {
      return [...new Set(box.providers.map(provider => provider.name))];
    }
    return [];
  }, []);

  const getArchitectureNames = useCallback(box => {
    if (box.versions) {
      return [
        ...new Set(
          box.versions.flatMap(version =>
            version.providers
              ? version.providers.flatMap(provider =>
                  provider.architectures ? provider.architectures.map(arch => arch.name) : []
                )
              : []
          )
        ),
      ];
    }
    if (box.providers) {
      return [
        ...new Set(
          box.providers.flatMap(provider =>
            provider.architectures ? provider.architectures.map(arch => arch.name) : []
          )
        ),
      ];
    }
    return [];
  }, []);

  // Extract unique providers and architectures with counts
  const allProviders = useMemo(() => {
    const providerCounts = {};
    boxes.forEach(box => {
      getProviderNames(box).forEach(provider => {
        providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      });
    });
    return providerCounts;
  }, [boxes, getProviderNames]);

  const allArchitectures = useMemo(() => {
    const archCounts = {};
    boxes.forEach(box => {
      getArchitectureNames(box).forEach(arch => {
        archCounts[arch] = (archCounts[arch] || 0) + 1;
      });
    });
    return archCounts;
  }, [boxes, getArchitectureNames]);

  const allOs = useMemo(() => {
    const osCounts = {};
    boxes.forEach(box => {
      const { distro } = getBoxOsInfo(box);
      if (distro) {
        osCounts[distro] = (osCounts[distro] || 0) + 1;
      }
    });
    return osCounts;
  }, [boxes]);

  // Toggle tag filter
  const toggleProviderFilter = provider => {
    setActiveProviders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(provider)) {
        newSet.delete(provider);
      } else {
        newSet.add(provider);
      }
      return newSet;
    });
  };

  const toggleArchitectureFilter = arch => {
    setActiveArchitectures(prev => {
      const newSet = new Set(prev);
      if (newSet.has(arch)) {
        newSet.delete(arch);
      } else {
        newSet.add(arch);
      }
      return newSet;
    });
  };

  const toggleOsFilter = distro => {
    setActiveOs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(distro)) {
        newSet.delete(distro);
      } else {
        newSet.add(distro);
      }
      return newSet;
    });
  };

  // Handle column sort
  const handleSort = column => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Filter and sort boxes
  const processedBoxes = useMemo(() => {
    let filtered = [...boxes];

    // Apply provider filter
    if (activeProviders.size > 0) {
      filtered = filtered.filter(box => {
        const providers = getProviderNames(box);
        return providers.some(p => activeProviders.has(p));
      });
    }

    // Apply architecture filter
    if (activeArchitectures.size > 0) {
      filtered = filtered.filter(box => {
        const archs = getArchitectureNames(box);
        return archs.some(a => activeArchitectures.has(a));
      });
    }

    // Apply OS (distro) filter
    if (activeOs.size > 0) {
      filtered = filtered.filter(box => {
        const { distro } = getBoxOsInfo(box);
        return Boolean(distro) && activeOs.has(distro);
      });
    }

    if (watchedOnly) {
      filtered = filtered.filter(box => watchedBoxIds.has(box.id));
    }

    // Apply search filter
    if (searchName.trim()) {
      filtered = filtered.filter(box => box.name.toLowerCase().includes(searchName.toLowerCase()));
    }

    // Apply sort
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal;
        let bVal;

        switch (sortColumn) {
          case 'name':
            aVal = a.name.toLowerCase();
            bVal = b.name.toLowerCase();
            break;
          case 'created':
            aVal = new Date(a.createdAt).getTime();
            bVal = new Date(b.createdAt).getTime();
            break;
          case 'downloads':
            aVal = calculatePublicDownloads(a);
            bVal = calculatePublicDownloads(b);
            break;
          case 'versions':
            aVal = a.versions ? a.versions.length : 0;
            bVal = b.versions ? b.versions.length : 0;
            break;
          case 'os':
            aVal = getBoxOsInfo(a).label.toLowerCase();
            bVal = getBoxOsInfo(b).label.toLowerCase();
            break;
          case 'released':
            aVal = getLatestReleaseTime(a) || 0;
            bVal = getLatestReleaseTime(b) || 0;
            break;
          default:
            return 0;
        }

        if (aVal < bVal) {
          return sortDirection === 'asc' ? -1 : 1;
        }
        if (aVal > bVal) {
          return sortDirection === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [
    boxes,
    activeProviders,
    activeArchitectures,
    activeOs,
    watchedOnly,
    watchedBoxIds,
    searchName,
    sortColumn,
    sortDirection,
    calculatePublicDownloads,
    getProviderNames,
    getArchitectureNames,
  ]);

  const fetchGravatarUrl = useCallback(async emailHash => {
    try {
      const profile = await AuthService.getGravatarProfile(emailHash);
      if (profile && profile.avatar_url) {
        return profile.avatar_url;
      }
    } catch (error) {
      log.api.error('Error fetching Gravatar profile', {
        emailHash,
        error: error.message,
      });
    }
    return null;
  }, []);

  const fetchGravatarUrls = useCallback(
    async boxesList => {
      const urls = {};
      const uniqueOrgs = new Map();

      boxesList.forEach(box => {
        const { orgName, logo, emailHash } = resolveBoxOrg(box);
        if (!orgName || urls[orgName] || uniqueOrgs.has(orgName)) {
          return;
        }
        // Stored org logo wins; only orgs without one need a Gravatar fetch
        if (logo) {
          urls[orgName] = logo;
        } else if (emailHash) {
          uniqueOrgs.set(orgName, emailHash);
        }
      });

      const gravatarPromises = Array.from(uniqueOrgs.entries()).map(
        async ([orgName, emailHash]) => {
          try {
            const url = await fetchGravatarUrl(emailHash);
            return { orgName, url };
          } catch (error) {
            log.api.error('Error fetching Gravatar for organization', {
              orgName,
              error: error.message,
            });
            return { orgName, url: null };
          }
        }
      );

      const results = await Promise.all(gravatarPromises);
      results.forEach(result => {
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
        .then(response => {
          if (isMountedRef.current) {
            const allBoxes = Array.isArray(response.data) ? response.data : [];
            setBoxes(allBoxes);
          }
        })
        .catch(e => {
          if (e.response?.status === 401) {
            EventBus.dispatch('logout', null);
            setBoxes([]);
          } else {
            log.api.error(t('box.organization.errors.retrievePublic'), {
              error: e.message,
            });
            setMessage(t('box.organization.errors.retrievePublic'));
            setMessageType('danger');
          }
        });
    } else if (organization) {
      BoxDataService.getAll(organization)
        .then(response => {
          if (isMountedRef.current) {
            const allBoxes = Array.isArray(response.data) ? response.data : [];
            setBoxes(allBoxes);
          }
        })
        .catch(e => {
          if (e.response?.status === 401) {
            EventBus.dispatch('logout', null);
            setBoxes([]);
          } else {
            log.api.error(t('box.organization.errors.retrieveOrg'), {
              organization,
              error: e.message,
            });
            setMessage(t('box.organization.errors.retrieveOrg'));
            setMessageType('danger');
          }
        });
    }
  }, [showOnlyPublic, organization, t]);

  useEffect(() => {
    // Set document title based on page type
    // Main page (public view) should always show "BoxVault"
    // Organization page should show organization name
    if (showOnlyPublic) {
      document.title = 'BoxVault';
    } else if (organization) {
      document.title = organization;
    } else {
      document.title = 'BoxVault';
    }
  }, [organization, showOnlyPublic]);

  // Save preferences to localStorage when they change (loading done in initial state)
  useEffect(() => {
    const key = `boxvault_table_prefs_${organization || 'home'}`;
    const prefs = {
      sortColumn,
      sortDirection,
      providers: Array.from(activeProviders),
      architectures: Array.from(activeArchitectures),
      os: Array.from(activeOs),
    };
    localStorage.setItem(key, JSON.stringify(prefs));
  }, [sortColumn, sortDirection, activeProviders, activeArchitectures, activeOs, organization]);

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
        log.api.error('Error fetching boxes', {
          showOnlyPublic,
          organization,
          error: e.message,
        });
        if (isMountedRef.current) {
          setBoxes([]);
          const errorMessage =
            e.response && e.response.data && e.response.data.message
              ? e.response.data.message
              : t('box.organization.errors.retrieveOrg');
          setMessage(errorMessage);
          setMessageType('danger');
        }
      }
    };

    fetchBoxes();

    return () => {
      isMountedRef.current = false;
    };
  }, [showOnlyPublic, organization, fetchGravatarUrls, t]);

  useEffect(() => {
    if (!isSignedIn) {
      return undefined;
    }
    let mounted = true;
    BoxDataService.getUserWatches()
      .then(response => {
        if (mounted) {
          setWatchedBoxIds(new Set((response.data || []).map(entry => entry.boxId)));
        }
      })
      .catch(e => {
        log.api.error('Error fetching watched boxes', { error: e.message });
      });
    return () => {
      mounted = false;
    };
  }, [isSignedIn]);

  const toggleBoxWatch = box => {
    const orgName = resolveBoxOrg(box).orgName || organization;
    const nextWatched = !watchedBoxIds.has(box.id);
    const applyWatched = (ids, isWatched) => {
      const next = new Set(ids);
      if (isWatched) {
        next.add(box.id);
      } else {
        next.delete(box.id);
      }
      return next;
    };

    setWatchedBoxIds(prev => applyWatched(prev, nextWatched));

    const request = nextWatched
      ? BoxDataService.watch(orgName, box.name)
      : BoxDataService.unwatch(orgName, box.name);
    request.catch(e => {
      log.api.error('Error toggling box watch', {
        boxName: box.name,
        error: e.message,
      });
      setWatchedBoxIds(prev => applyWatched(prev, !nextWatched));
      setMessage(t('watch.error'));
      setMessageType('danger');
    });
  };

  const onChangeSearchName = e => {
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
          setMessage(t('box.organization.messages.removeAllSuccess'));
          setMessageType('success');
        })
        .catch(e => {
          log.api.error('Error removing all boxes', {
            organization,
            error: e.message,
          });
          setMessage(t('box.organization.errors.removeAll'));
          setMessageType('danger');
        });
    }
  };

  const handleJoinAsAdmin = () => {
    OrganizationService.joinOrganizationAsAdmin(organization)
      .then(async () => {
        await AuthService.refreshUserData();
        window.location.reload();
      })
      .catch(e => {
        log.api.error('Error joining organization as admin', {
          organization,
          error: e.message,
        });
        setMessage(e.response?.data?.message || t('messages.operationFailed'));
        setMessageType('danger');
      });
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
    if (searchName.trim() === '') {
      retrieveBoxes();
      return;
    }

    const filterBoxes = boxesData =>
      boxesData.filter(box => box.name.toLowerCase().includes(searchName.toLowerCase()));

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
        log.api.error('Error filtering boxes', {
          searchName,
          error: e.message,
        });
        if (isMountedRef.current) {
          setBoxes([]);
        }
        setMessage(t('box.organization.errors.filter'));
        setMessageType('danger');
      }
    };

    fetchAndFilterBoxes();
  }, [searchName, showOnlyPublic, organization, retrieveBoxes, t]);

  const handleInputChange = event => {
    const { name: fieldName, value } = event.target;
    setNewBox({
      ...newBox,
      [fieldName]: fieldName === 'isPublic' ? value === 'true' : value,
    });

    if (fieldName === 'name') {
      const error = validateName(value);
      setValidationErrors({ ...validationErrors, name: error });
    }
  };

  const createBox = () => {
    if (!showCreateForm) {
      setShowCreateForm(true);
      return;
    }

    const boxData = { ...newBox, organization };

    BoxDataService.create(organization, boxData)
      .then(() => {
        setShowCreateForm(false);
        setNewBox({ name: '', description: '', isPublic: false });
        refreshList();
        navigate(`/${organization}/${newBox.name}`);
        setMessage(t('box.organization.messages.boxCreated'));
        setMessageType('success');
      })
      .catch(e => {
        log.api.error('Error creating box', {
          boxName: newBox.name,
          error: e.message,
        });
        const errorMessage =
          e.response && e.response.data && e.response.data.message
            ? e.response.data.message
            : t('box.organization.errors.boxCreate');
        setMessage(errorMessage);
        setMessageType('danger');
      });
  };

  const canEditBoxes = box => isOrgMember(currentUser, box.organization);

  const showJoinAsAdmin =
    !showOnlyPublic && isGlobalAdmin(currentUser) && !isOrgMember(currentUser, organization);

  // Signed-in home page groups the final processed boxes (search/sort/filter
  // already applied) by organization; anonymous home and organization pages
  // keep one flat table.
  const groupedBoxes = useMemo(() => {
    if (!showOnlyPublic || !currentUser) {
      return null;
    }
    const groups = new Map();
    processedBoxes.forEach(box => {
      const { orgName } = resolveBoxOrg(box);
      const key = orgName || t('unknown');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(box);
    });
    return Array.from(groups.entries());
  }, [showOnlyPublic, currentUser, processedBoxes, t]);

  const renderOrgLogo = box => {
    const { orgName, logo } = resolveBoxOrg(box);
    // Stored org logo first, fetched Gravatar second, BoxVault logo last
    const logoUrl = logo || gravatarUrls[orgName];
    if (logoUrl) {
      return (
        <img
          src={logoUrl}
          alt=""
          className="rounded-circle avatar-lg icon-with-margin-sm v-align-middle"
        />
      );
    }

    const LogoComponent = theme === 'light' ? BoxVaultLight : BoxVaultDark;
    return <LogoComponent className="logo-xl icon-with-margin-sm" />;
  };

  const renderTableRow = (box, index) => {
    const totalDownloads = calculatePublicDownloads(box);
    const providerNames = getProviderNames(box);
    const architectureNames = getArchitectureNames(box);
    const releaseTime = getLatestReleaseTime(box);
    const organizationName = routeOrganization || box.organization?.name || 'Unknown';

    return (
      <tr className={index === currentIndex ? 'active' : ''} key={box.id || box.name}>
        {isSignedIn && (
          <td className="text-center align-middle">
            <WatchStarCell
              watched={watchedBoxIds.has(box.id)}
              onToggle={() => toggleBoxWatch(box)}
            />
          </td>
        )}
        <td>
          {renderOrgLogo(box)}
          <Link to={`/${organizationName}/${box.name}`} className="v-align-middle">
            {organizationName}/{box.name}
          </Link>
        </td>
        <td>
          <BoxOsCell box={box} />
        </td>
        <td className="px-2">
          <span className={`badge ${box.published ? 'bg-success' : 'bg-warning'}`}>
            {box.published
              ? t('box.organization.status.published')
              : t('box.organization.status.pending')}
          </span>
        </td>
        <td>
          <span className={`badge ${box.public || box.isPublic ? 'bg-info' : 'bg-secondary'}`}>
            {box.public || box.isPublic
              ? t('box.organization.visibility.public')
              : t('box.organization.visibility.private')}
          </span>
        </td>
        <td>{new Date(box.createdAt).toLocaleDateString()}</td>
        <td>{releaseTime ? formatRelativeTime(releaseTime, i18n.language) : ''}</td>
        <td>{totalDownloads}</td>
        <td>{box.versions ? box.versions.length : box.numberOfVersions || 0}</td>
        <td>{providerNames.length > 0 ? providerNames.join(', ') : 'N/A'}</td>
        <td>{architectureNames.length > 0 ? architectureNames.join(', ') : 'N/A'}</td>
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
        <div className="input-group input-group-sm" style={{ maxWidth: '300px' }}>
          <input
            type="text"
            className="form-control"
            placeholder={t('common:actions.search')}
            id="search"
            name="search"
            value={searchName}
            onChange={onChangeSearchName}
          />
          <button className="btn btn-outline-secondary" type="button" onClick={findByName}>
            {t('common:actions.search')}
          </button>
        </div>

        {/* Center: Tag Cloud Pills (compact, inline) */}
        {(isSignedIn ||
          Object.keys(allProviders).length > 0 ||
          Object.keys(allArchitectures).length > 0 ||
          Object.keys(allOs).length > 0) && (
          <div className="d-flex flex-wrap align-items-center gap-1 flex-grow-1">
            <small className="text-muted">{t('box.filter')}:</small>
            {isSignedIn && (
              <WatchedFilterPill
                active={watchedOnly}
                count={watchedBoxIds.size}
                onToggle={() => setWatchedOnly(!watchedOnly)}
              />
            )}
            <FilterPillGroup
              entries={allProviders}
              activeSet={activeProviders}
              activeClass="bg-primary"
              onToggle={toggleProviderFilter}
            />
            <FilterPillGroup
              entries={allArchitectures}
              activeSet={activeArchitectures}
              activeClass="bg-info"
              onToggle={toggleArchitectureFilter}
            />
            <FilterPillGroup
              entries={allOs}
              activeSet={activeOs}
              activeClass="bg-success"
              onToggle={toggleOsFilter}
            />
          </div>
        )}

        {/* Right: Action Buttons */}
        <div className="d-flex gap-2">
          {showOnlyPublic && (
            <Link to="/organizations/discover" className="btn btn-sm btn-outline-primary">
              {t('discovery.discoverButton')}
            </Link>
          )}
          {showJoinAsAdmin && (
            <button className="btn btn-sm btn-outline-warning" onClick={handleJoinAsAdmin}>
              {t('box.organization.buttons.joinAsAdmin')}
            </button>
          )}
          {!showOnlyPublic && canEditBoxes({ organization }) && (
            <BoxManageButtons
              showCreateForm={showCreateForm}
              onCreateBox={createBox}
              onCancelCreate={() => {
                setShowCreateForm(false);
                setNewBox({ name: '', description: '', isPublic: false });
                setValidationErrors({});
              }}
              createDisabled={!!validationErrors.name}
              canManage={isOrgManager(currentUser, organization)}
              onRemoveAll={handleDeleteClick}
              showRemoveModal={showModal}
              onCloseRemoveModal={handleCloseModal}
              onConfirmRemoveAll={handleConfirmDelete}
            />
          )}
          {!showOnlyPublic && (
            <button className="btn btn-sm btn-outline-primary" onClick={() => navigate('/')}>
              {t('actions.back')}
            </button>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="create-form mt-2 mb-3">
          <h4>{t('box.organization.headers.createNewBox')}</h4>
          <form>
            <div className="form-group">
              <label htmlFor="boxName">
                <strong>{t('box.name')}:</strong>
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
                    id="boxName"
                    name="name"
                    value={newBox.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              {validationErrors.name && <div className="text-danger">{validationErrors.name}</div>}
              <small className="form-text text-muted">{t('box.shortDescription')}</small>
            </div>
            <div className="form-group mt-2">
              <label htmlFor="description">
                <strong>{t('box.description')}:</strong>
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
                <strong>{t('box.visibility')}:</strong>
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
                    {t('box.organization.visibility.private')}
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
                    {t('box.organization.visibility.public')}
                  </label>
                </div>
              </div>
              <small className="form-text text-muted">{t('box.visibilityHint')}</small>
            </div>
          </form>
        </div>
      )}

      <div className="col-md-12">
        {groupedBoxes && groupedBoxes.length > 0 ? (
          groupedBoxes.map(([orgName, orgBoxes]) => (
            <OrgGroupSection
              key={orgName}
              orgName={orgName}
              logo={renderOrgLogo(orgBoxes[0])}
              count={orgBoxes.length}
            >
              <BoxesTable
                boxes={orgBoxes}
                renderRow={renderTableRow}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                showWatchColumn={isSignedIn}
              />
            </OrgGroupSection>
          ))
        ) : (
          <BoxesTable
            boxes={processedBoxes}
            renderRow={renderTableRow}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            showWatchColumn={isSignedIn}
          />
        )}
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
  const organization = routeOrganization || (currentUser ? currentUser.organization : null);
  const [activeTab, setActiveTab] = useState('boxes');

  const isMember = useMemo(
    () => isOrgMember(currentUser, organization),
    [currentUser, organization]
  );

  const canManage = useMemo(
    () => isOrgManager(currentUser, organization),
    [currentUser, organization]
  );

  return (
    <div className="list row">
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'boxes' ? 'active' : ''}`}
            onClick={() => setActiveTab('boxes')}
          >
            Boxes
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'isos' ? 'active' : ''}`}
            onClick={() => setActiveTab('isos')}
          >
            ISOs
          </button>
        </li>
      </ul>

      {activeTab === 'boxes' && <BoxesList showOnlyPublic={showOnlyPublic} theme={theme} />}
      {activeTab === 'isos' && (
        <IsoList
          key={organization || 'public'}
          organization={organization}
          isMember={isMember}
          canManage={canManage}
          showOnlyPublic={showOnlyPublic}
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
