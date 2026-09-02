import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaCheck,
  FaCopy,
  FaDownload,
  FaGlobe,
  FaLock,
  FaPen,
  FaTrash,
  FaUpload,
  FaXmark,
} from 'react-icons/fa6';

import IsoService from '../services/iso.service';
import { log } from '../utils/Logger';
import { isOrgManager } from '../utils/permissions';

import ConfirmationModal from './confirmation.component';

const HOVER_DWELL_MS = 400;

const UploadZone = ({ uploading, progress, onFile }) => {
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
          {t(isPublic ? 'pages.status.public' : 'pages.status.private')}
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

UploadZone.propTypes = {
  uploading: PropTypes.bool.isRequired,
  progress: PropTypes.number.isRequired,
  onFile: PropTypes.func.isRequired,
};

export const IsoListActions = ({ ctx }) => {
  const { t } = useTranslation();
  const { user, org, reload, notify } = ctx;
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  if (!org || !isOrgManager(user, org)) {
    return null;
  }

  const upload = (file, isPublic) => {
    setUploading(true);
    setProgress(0);
    notify('', '');
    IsoService.upload(org, file, isPublic, event => {
      setProgress(Math.round((100 * event.loaded) / event.total));
    })
      .then(() => {
        notify('success', t('messages.operationSuccessful'));
        reload();
      })
      .catch(error => {
        log.api.error('Error uploading ISO', { error: error.message });
        notify('danger', t('messages.uploadFailed'));
      })
      .finally(() => setUploading(false));
  };

  return <UploadZone uploading={uploading} progress={progress} onFile={upload} />;
};

IsoListActions.propTypes = {
  ctx: PropTypes.shape({
    user: PropTypes.object,
    org: PropTypes.string.isRequired,
    reload: PropTypes.func.isRequired,
    notify: PropTypes.func.isRequired,
  }).isRequired,
};

const RenameControls = ({ iso, org, reload, notify, onDone }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(iso.name);
  const save = () => {
    if (!name.trim()) {
      return;
    }
    IsoService.update(org, iso.id, { name })
      .then(() => {
        notify('success', t('messages.operationSuccessful'));
        onDone();
        reload();
      })
      .catch(error => {
        log.api.error('Error updating ISO name', { error: error.message });
        notify('danger', t('messages.operationFailed'));
      });
  };
  return (
    <span className="d-inline-flex align-items-center gap-1">
      <input
        type="text"
        className="form-control form-control-sm w-auto"
        value={name}
        onChange={event => setName(event.target.value)}
        aria-label={t('buttons.rename')}
      />
      <button
        type="button"
        className="btn btn-sm btn-success"
        onClick={save}
        title={t('buttons.save')}
      >
        <FaCheck />
      </button>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={onDone}
        title={t('buttons.cancel')}
      >
        <FaXmark />
      </button>
    </span>
  );
};

RenameControls.propTypes = {
  iso: PropTypes.shape({ id: PropTypes.number.isRequired, name: PropTypes.string.isRequired })
    .isRequired,
  org: PropTypes.string.isRequired,
  reload: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
  onDone: PropTypes.func.isRequired,
};

export const IsoRowActions = ({ item, ctx }) => {
  const { t } = useTranslation();
  const { user, reload, notify } = ctx;
  const iso = item.extras.raw;
  const org = item.organization.name;
  const manage = isOrgManager(user, org);
  const [renaming, setRenaming] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const download = () => {
    IsoService.getDownloadLink(org, iso.id)
      .then(response => window.location.assign(response.data.downloadUrl))
      .catch(error => {
        log.api.error('Error getting download link', { error: error.message });
        notify('danger', t('messages.operationFailed'));
      });
  };

  const copyChecksum = () => {
    navigator.clipboard
      .writeText(iso.checksum)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => notify('danger', t('messages.copyFailed')));
  };

  const toggleVisibility = () => {
    IsoService.update(org, iso.id, { isPublic: !iso.isPublic })
      .then(reload)
      .catch(error => {
        log.api.error('Error updating ISO visibility', { error: error.message });
        notify('danger', t('messages.operationFailed'));
      });
  };

  const remove = () => {
    IsoService.deleteISO(org, iso.id)
      .then(() => {
        notify('success', t('messages.operationSuccessful'));
        reload();
      })
      .catch(error => {
        log.api.error('Error deleting ISO', { error: error.message });
        notify('danger', t('messages.deleteFailed'));
      });
  };

  if (renaming) {
    return (
      <RenameControls
        iso={iso}
        org={org}
        reload={reload}
        notify={notify}
        onDone={() => setRenaming(false)}
      />
    );
  }

  return (
    <div className="btn-group">
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        onClick={download}
        title={t('buttons.download')}
      >
        <FaDownload />
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={copyChecksum}
        title={t('buttons.copy')}
      >
        {copied ? <FaCheck className="text-success" /> : <FaCopy />}
      </button>
      {manage ? (
        <>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={toggleVisibility}
            title={t(iso.isPublic ? 'pages.status.public' : 'pages.status.private')}
          >
            {iso.isPublic ? <FaGlobe /> : <FaLock />}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setRenaming(true)}
            title={t('buttons.edit')}
          >
            <FaPen />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => setShowDelete(true)}
            title={t('buttons.delete')}
          >
            <FaTrash />
          </button>
          <ConfirmationModal
            show={showDelete}
            handleClose={() => setShowDelete(false)}
            handleConfirm={remove}
            title={t('iso.deleteTitle')}
            message={t('iso.deleteMessage', { name: iso.name })}
          />
        </>
      ) : null}
    </div>
  );
};

IsoRowActions.propTypes = {
  item: PropTypes.shape({
    organization: PropTypes.shape({ name: PropTypes.string.isRequired }).isRequired,
    extras: PropTypes.shape({ raw: PropTypes.object.isRequired }).isRequired,
  }).isRequired,
  ctx: PropTypes.shape({
    user: PropTypes.object,
    reload: PropTypes.func.isRequired,
    notify: PropTypes.func.isRequired,
  }).isRequired,
};
