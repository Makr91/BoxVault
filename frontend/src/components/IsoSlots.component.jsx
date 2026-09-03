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
import { Link, useNavigate } from 'react-router-dom';

import { ConfirmModal } from '../pages';
import IsoService from '../services/iso.service';
import { log } from '../utils/Logger';
import { isOrgManager } from '../utils/permissions';

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
        className="btn btn-sm btn-outline-success"
        onClick={() => setOpen(true)}
        onMouseEnter={startDwell}
        onMouseLeave={stopDwell}
      >
        {t('pages.addNew')}
      </button>
    );
  }

  return (
    <div
      role="presentation"
      className={`upload-zone w-100 order-last${over ? ' over' : ''}`}
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

const RemoveAll = ({ org, reload, notify }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const removeAll = () => {
    IsoService.removeAll(org)
      .then(() => {
        notify('success', t('messages.operationSuccessful'));
        reload();
      })
      .catch(error => {
        log.api.error('Error removing all ISOs', { org, error: error.message });
        notify('danger', t('messages.deleteFailed'));
      });
  };
  return (
    <>
      <button type="button" className="btn btn-sm btn-danger" onClick={() => setShow(true)}>
        {t('pages.removeAll')}
      </button>
      <ConfirmModal show={show} handleClose={() => setShow(false)} handleConfirm={removeAll} />
    </>
  );
};

RemoveAll.propTypes = {
  org: PropTypes.string.isRequired,
  reload: PropTypes.func.isRequired,
  notify: PropTypes.func.isRequired,
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

  return (
    <>
      <UploadZone uploading={uploading} progress={progress} onFile={upload} />
      <RemoveAll org={org} reload={reload} notify={notify} />
    </>
  );
};

IsoListActions.propTypes = {
  ctx: PropTypes.shape({
    user: PropTypes.object,
    org: PropTypes.string.isRequired,
    reload: PropTypes.func.isRequired,
    notify: PropTypes.func.isRequired,
  }).isRequired,
};

const RenameControls = ({ iso, org, notify, onDone, onSaved }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(iso.name);
  const save = () => {
    const next = name.trim();
    if (!next) {
      return;
    }
    IsoService.update(org, iso.id, { name: next })
      .then(() => {
        notify('success', t('messages.operationSuccessful'));
        onSaved(next);
      })
      .catch(error => {
        log.api.error('Error updating ISO name', { error: error.message });
        notify('danger', t('messages.operationFailed'));
      });
  };
  return (
    <span className="d-inline-flex align-items-center gap-1 me-2">
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
  notify: PropTypes.func.isRequired,
  onDone: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

export const IsoItemActions = ({ item, ctx }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, org, reload, notify } = ctx;
  const iso = item.extras.raw;
  const manage = isOrgManager(user, org);
  const [renaming, setRenaming] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

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
      .then(() => notify('success', t('pages.provider.checksumCopied')))
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

  const togglePublished = () => {
    IsoService.update(org, iso.id, { published: !iso.published })
      .then(reload)
      .catch(error => {
        log.api.error('Error updating ISO release status', { error: error.message });
        notify('danger', t('messages.operationFailed'));
      });
  };

  const remove = () => {
    IsoService.deleteISO(org, iso.id)
      .then(() => navigate(`/${org}/isos`))
      .catch(error => {
        log.api.error('Error deleting ISO', { error: error.message });
        notify('danger', t('messages.deleteFailed'));
      });
  };

  const manageControls = () => {
    if (!manage) {
      return null;
    }
    if (renaming) {
      return (
        <RenameControls
          iso={iso}
          org={org}
          notify={notify}
          onDone={() => setRenaming(false)}
          onSaved={next => navigate(`/${org}/isos/${next}`)}
        />
      );
    }
    return (
      <>
        <button type="button" className="btn btn-outline-secondary me-2" onClick={toggleVisibility}>
          {iso.isPublic ? <FaLock className="me-2" /> : <FaGlobe className="me-2" />}
          {t(iso.isPublic ? 'iso.makePrivate' : 'iso.makePublic')}
        </button>
        <button
          type="button"
          className={`btn ${iso.published ? 'btn-warning' : 'btn-outline-primary'} me-2`}
          onClick={togglePublished}
        >
          {t(iso.published ? 'iso.unpublish' : 'iso.publish')}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary me-2"
          onClick={() => setRenaming(true)}
        >
          <FaPen className="me-2" />
          {t('buttons.rename')}
        </button>
        <button type="button" className="btn btn-danger me-2" onClick={() => setShowDelete(true)}>
          <FaTrash className="me-2" />
          {t('buttons.delete')}
        </button>
      </>
    );
  };

  return (
    <>
      <button type="button" className="btn btn-primary me-2" onClick={download}>
        <FaDownload className="me-2" />
        {t('buttons.download')}
      </button>
      <button type="button" className="btn btn-outline-secondary me-2" onClick={copyChecksum}>
        <FaCopy className="me-2" />
        {t('iso.copyChecksum')}
      </button>
      {manageControls()}
      <Link className="btn btn-dark me-2" to={`/${org}/isos`}>
        {t('buttons.back')}
      </Link>
      <ConfirmModal
        show={showDelete}
        handleClose={() => setShowDelete(false)}
        handleConfirm={remove}
        title={t('iso.deleteTitle')}
        message={t('iso.deleteMessage', { name: iso.name })}
      />
    </>
  );
};

IsoItemActions.propTypes = {
  item: PropTypes.shape({
    extras: PropTypes.shape({ raw: PropTypes.object.isRequired }).isRequired,
  }).isRequired,
  ctx: PropTypes.shape({
    user: PropTypes.object,
    org: PropTypes.string.isRequired,
    reload: PropTypes.func.isRequired,
    notify: PropTypes.func.isRequired,
  }).isRequired,
};
