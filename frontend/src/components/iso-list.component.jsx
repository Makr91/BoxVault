import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import { Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  FaTrash,
  FaDownload,
  FaPen,
  FaCheck,
  FaXmark,
  FaCopy,
  FaGlobe,
  FaLock,
  FaUpload,
} from 'react-icons/fa6';

import { useNavbarSearchBinding } from '../chrome';
import IsoService from '../services/iso.service';
import { formatFileSize } from '../utils/fileSize';
import { log } from '../utils/Logger';

import ConfirmationModal from './confirmation.component';

const HOVER_DWELL_MS = 400;
const PREFS_PREFIX = 'boxvault_iso_prefs_';

const emptyFilters = () => ({ visibility: new Set(), organizations: new Set() });

const readPrefs = key => {
  try {
    const saved = JSON.parse(localStorage.getItem(`${PREFS_PREFIX}${key}`) || 'null');
    return {
      visibility: new Set(saved?.visibility || []),
      organizations: new Set(saved?.organizations || []),
    };
  } catch {
    return emptyFilters();
  }
};

const writePrefs = (key, filters) => {
  localStorage.setItem(
    `${PREFS_PREFIX}${key}`,
    JSON.stringify({
      visibility: [...filters.visibility],
      organizations: [...filters.organizations],
    })
  );
};

const toggleIn = (set, value) => {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
};

const visibilityOf = iso => (iso.isPublic ? 'public' : 'private');
const orgOf = iso => iso.organization?.name || '';

const countBy = (isos, pick) => {
  const counts = {};
  isos.forEach(iso => {
    const value = pick(iso);
    if (value) {
      counts[value] = (counts[value] || 0) + 1;
    }
  });
  return counts;
};

const matchesFilters = (iso, filters) =>
  (filters.visibility.size === 0 || filters.visibility.has(visibilityOf(iso))) &&
  (filters.organizations.size === 0 || filters.organizations.has(orgOf(iso)));

const buildIsoGroups = ({ t, isos, showOnlyPublic, filters, updateFilters }) =>
  showOnlyPublic
    ? [
        {
          key: 'organization',
          label: t('table.organization'),
          entries: countBy(isos, orgOf),
          activeSet: filters.organizations,
          activeClass: 'bg-primary',
          onToggle: value =>
            updateFilters(current => ({
              ...current,
              organizations: toggleIn(current.organizations, value),
            })),
        },
      ]
    : [
        {
          key: 'visibility',
          label: t('table.visibility'),
          entries: countBy(isos, visibilityOf),
          activeSet: filters.visibility,
          activeClass: 'bg-info',
          labelFor: value => t(`box.organization.visibility.${value}`),
          onToggle: value =>
            updateFilters(current => ({
              ...current,
              visibility: toggleIn(current.visibility, value),
            })),
        },
      ];

const IsoUploadZone = ({ uploading, progress, onFile }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const dwell = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => () => clearTimeout(dwell.current), []);

  const startDwell = () => {
    clearTimeout(dwell.current);
    dwell.current = setTimeout(() => setOpen(true), HOVER_DWELL_MS);
  };

  const stopDwell = () => clearTimeout(dwell.current);

  const pick = file => {
    if (file) {
      onFile(file, isPublic);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-primary d-inline-flex align-items-center gap-2"
        onClick={() => setOpen(true)}
        onMouseEnter={startDwell}
        onMouseLeave={stopDwell}
      >
        <FaUpload />
        {t('buttons.upload')}
      </button>
    );
  }

  return (
    <div
      role="presentation"
      className={`upload-zone w-100${over ? ' over' : ''}`}
      onDragOver={event => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={event => {
        event.preventDefault();
        setOver(false);
        pick(event.dataTransfer.files[0]);
      }}
    >
      <button
        type="button"
        className="navbar-search-tool upload-zone-close"
        onClick={() => setOpen(false)}
        disabled={uploading}
        title={t('buttons.close')}
        aria-label={t('buttons.close')}
      >
        <FaXmark />
      </button>
      <button
        type="button"
        className="upload-zone-target"
        onClick={() => inputRef.current?.click()}
        onKeyDown={event => {
          if (event.key === 'Escape' && !uploading) {
            setOpen(false);
          }
        }}
        disabled={uploading}
      >
        <FaUpload className="upload-zone-icon" aria-hidden />
        <span>
          {uploading ? t('iso.upload.uploading', { percent: progress }) : t('iso.upload.drop')}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".iso"
        disabled={uploading}
        onChange={event => {
          pick(event.target.files[0]);
          event.target.value = '';
        }}
      />
      <div className="form-check form-switch mb-0">
        <input
          className="form-check-input"
          type="checkbox"
          role="switch"
          id="isoUploadPublic"
          checked={isPublic}
          disabled={uploading}
          onChange={event => setIsPublic(event.target.checked)}
        />
        <label
          className="form-check-label d-inline-flex align-items-center gap-2"
          htmlFor="isoUploadPublic"
        >
          {isPublic ? <FaGlobe /> : <FaLock />}
          {t(
            isPublic ? 'box.organization.visibility.public' : 'box.organization.visibility.private'
          )}
        </label>
      </div>
      {uploading ? (
        <div className="progress upload-zone-progress">
          <div
            className="progress-bar progress-bar-striped progress-bar-animated"
            role="progressbar"
            style={{ width: `${progress}%` }}
            aria-valuenow={progress}
            aria-valuemin="0"
            aria-valuemax="100"
          />
        </div>
      ) : null}
    </div>
  );
};

IsoUploadZone.propTypes = {
  uploading: PropTypes.bool.isRequired,
  progress: PropTypes.number.isRequired,
  onFile: PropTypes.func.isRequired,
};

const IsoList = ({ organization, isMember, canManage, showOnlyPublic }) => {
  const { t } = useTranslation();
  const [isos, setIsos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isoToDelete, setIsoToDelete] = useState(null);
  const [editingIsoId, setEditingIsoId] = useState(null);
  const [editName, setEditName] = useState('');
  const [copiedChecksum, setCopiedChecksum] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const prefsKey = showOnlyPublic ? 'home' : organization || 'home';
  const [filters, setFilters] = useState(() => readPrefs(prefsKey));

  useEffect(() => {
    writePrefs(prefsKey, filters);
  }, [prefsKey, filters]);

  useEffect(() => {
    let mounted = true;
    let fetchIsos;
    if (showOnlyPublic) {
      fetchIsos = IsoService.discoverAll();
    } else if (isMember) {
      fetchIsos = IsoService.getAll(organization);
    } else {
      fetchIsos = IsoService.getPublic(organization);
    }

    fetchIsos
      .then(response => {
        if (mounted) {
          setIsos(response.data);
          setLoading(false);
        }
      })
      .catch(error => {
        if (mounted) {
          log.api.error('Error loading ISOs', { error: error.message });
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [organization, showOnlyPublic, isMember]);

  const uploadFile = (file, isPublic) => {
    setUploading(true);
    setUploadProgress(0);
    setMessage('');

    IsoService.upload(organization, file, isPublic, progressEvent => {
      setUploadProgress(Math.round((100 * progressEvent.loaded) / progressEvent.total));
    })
      .then(response => {
        setMessage(t('messages.operationSuccessful'));
        setMessageType('success');
        setUploading(false);
        setIsos([response.data, ...isos]);
      })
      .catch(error => {
        log.api.error('Error uploading ISO', { error: error.message });
        setMessage(t('messages.uploadFailed'));
        setMessageType('danger');
        setUploading(false);
      });
  };

  const handleDeleteClick = iso => {
    setIsoToDelete(iso);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    if (isoToDelete) {
      IsoService.deleteISO(organization, isoToDelete.id)
        .then(() => {
          setMessage(t('messages.operationSuccessful'));
          setMessageType('success');
          setIsos(isos.filter(i => i.id !== isoToDelete.id));
          setShowDeleteModal(false);
        })
        .catch(error => {
          log.api.error('Error deleting ISO', { error: error.message });
          setMessage(t('messages.deleteFailed'));
          setMessageType('danger');
          setShowDeleteModal(false);
        });
    }
  };

  const handleDownloadClick = async (e, iso) => {
    e.preventDefault();
    try {
      const orgName = iso.organization?.name || organization;
      const response = await IsoService.getDownloadLink(orgName, iso.id);
      window.location.assign(response.data.downloadUrl);
    } catch (error) {
      log.api.error('Error getting download link', { error: error.message });
      setMessage(t('messages.operationFailed'));
      setMessageType('danger');
    }
  };

  const handleVisibilityToggle = iso => {
    if (!canManage) {
      return;
    }

    IsoService.update(organization, iso.id, { isPublic: !iso.isPublic })
      .then(response => {
        setIsos(isos.map(i => (i.id === iso.id ? response.data : i)));
      })
      .catch(error => {
        log.api.error('Error updating ISO visibility', {
          error: error.message,
        });
        setMessage(t('messages.operationFailed'));
        setMessageType('danger');
      });
  };

  const handleCopyChecksum = (checksum, isoId) => {
    navigator.clipboard
      .writeText(checksum)
      .then(() => {
        setCopiedChecksum(isoId);
        setTimeout(() => setCopiedChecksum(null), 2000);
      })
      .catch(err => {
        log.app.error('Failed to copy checksum', { error: err });
        setMessage(t('messages.copyFailed'));
        setMessageType('danger');
      });
  };

  const handleEditClick = iso => {
    setEditingIsoId(iso.id);
    setEditName(iso.name);
  };

  const handleCancelEdit = () => {
    setEditingIsoId(null);
    setEditName('');
  };

  const handleSaveEdit = iso => {
    if (!editName.trim()) {
      return;
    }

    IsoService.update(organization, iso.id, { name: editName })
      .then(response => {
        setIsos(isos.map(i => (i.id === iso.id ? response.data : i)));
        setEditingIsoId(null);
        setEditName('');
        setMessage(t('messages.operationSuccessful'));
        setMessageType('success');
      })
      .catch(error => {
        log.api.error('Error updating ISO name', { error: error.message });
        setMessage(t('messages.operationFailed'));
        setMessageType('danger');
      });
  };

  const filteredIsos = isos.filter(
    iso => iso.name.toLowerCase().includes(searchTerm.toLowerCase()) && matchesFilters(iso, filters)
  );

  useNavbarSearchBinding({
    query: searchTerm,
    onQueryChange: setSearchTerm,
    placeholder: t('search.isos'),
    matched: filteredIsos.length,
    total: isos.length,
    groups: buildIsoGroups({ t, isos, showOnlyPublic, filters, updateFilters: setFilters }),
    onClearFilters: () => setFilters(emptyFilters()),
  });

  const renderTableBody = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan="6" className="text-center">
            {t('status.loading')}
          </td>
        </tr>
      );
    }

    if (filteredIsos.length === 0) {
      return (
        <tr>
          <td colSpan="6" className="text-center">
            {t('messages.noResultsFound')}
          </td>
        </tr>
      );
    }

    return filteredIsos.map(iso => (
      <tr key={iso.id}>
        <td>
          {editingIsoId === iso.id ? (
            <input
              type="text"
              className="form-control form-control-sm"
              value={editName}
              onChange={e => setEditName(e.target.value)}
            />
          ) : (
            iso.name
          )}
        </td>
        {showOnlyPublic ? (
          <td>{iso.organization?.name || 'Unknown'}</td>
        ) : (
          <td>
            {canManage ? (
              <button
                type="button"
                className={`badge ${iso.isPublic ? 'bg-info' : 'bg-secondary'} border-0 cursor-pointer`}
                onClick={() => handleVisibilityToggle(iso)}
                title="Click to toggle visibility"
              >
                {iso.isPublic
                  ? t('box.organization.visibility.public')
                  : t('box.organization.visibility.private')}
              </button>
            ) : (
              <span className={`badge ${iso.isPublic ? 'bg-info' : 'bg-secondary'}`}>
                {iso.isPublic
                  ? t('box.organization.visibility.public')
                  : t('box.organization.visibility.private')}
              </span>
            )}
          </td>
        )}
        <td>{formatFileSize(iso.size)}</td>
        <td>
          <div className="d-flex align-items-center">
            <code title={iso.checksum}>{iso.checksum.substring(0, 12)}...</code>
            <button
              type="button"
              className="btn btn-sm btn-link text-secondary p-0 ms-2"
              onClick={() => handleCopyChecksum(iso.checksum, iso.id)}
              title={t('buttons.copy')}
            >
              {copiedChecksum === iso.id ? <FaCheck className="text-success" /> : <FaCopy />}
            </button>
          </div>
        </td>
        <td>{new Date(iso.createdAt).toLocaleDateString()}</td>
        <td>
          <div className="btn-group">
            {editingIsoId === iso.id ? (
              <>
                <button
                  className="btn btn-sm btn-success"
                  onClick={() => handleSaveEdit(iso)}
                  title={t('buttons.save')}
                >
                  <FaCheck />
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={handleCancelEdit}
                  title={t('buttons.cancel')}
                >
                  <FaXmark />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={e => handleDownloadClick(e, iso)}
                  className="btn btn-sm btn-outline-primary"
                >
                  <FaDownload />
                </button>
                {canManage && (
                  <>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => handleEditClick(iso)}
                      title={t('buttons.edit')}
                    >
                      <FaPen />
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDeleteClick(iso)}
                    >
                      <FaTrash />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    ));
  };

  return (
    <div className="list row">
      {canManage && (
        <div className="d-flex justify-content-end align-items-center mb-3 gap-2 flex-wrap">
          <IsoUploadZone uploading={uploading} progress={uploadProgress} onFile={uploadFile} />
        </div>
      )}

      {message && (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      )}

      <Table striped hover responsive>
        <thead>
          <tr>
            <th>{t('table.name')}</th>
            <th>{showOnlyPublic ? t('table.organization') : t('table.visibility')}</th>
            <th>{t('table.size')}</th>
            <th>{t('table.checksum')} (SHA256)</th>
            <th>{t('table.uploaded')}</th>
            <th>{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody>{renderTableBody()}</tbody>
      </Table>

      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={handleConfirmDelete}
        title="Delete ISO"
        message={`Are you sure you want to delete ${isoToDelete?.name}?`}
      />
    </div>
  );
};

IsoList.propTypes = {
  organization: PropTypes.string,
  isMember: PropTypes.bool.isRequired,
  canManage: PropTypes.bool.isRequired,
  showOnlyPublic: PropTypes.bool,
};

export default IsoList;
