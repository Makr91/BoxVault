import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FaHardDrive, FaCompactDisc } from 'react-icons/fa6';

import { log, useNotify } from '../chrome';

import { formatFileSize, responseMessage } from './itemShape';

const progressClass = percent => {
  if (percent > 90) {
    return 'bg-danger';
  }
  if (percent > 75) {
    return 'bg-warning';
  }
  return 'bg-primary';
};

const StorageBar = ({ usage, label, icon }) => {
  const { t } = useTranslation();
  if (!usage) {
    return (
      <div className="alert alert-warning" role="alert">
        {t('admin.storage.pathNotConfigured', { path: label })}
      </div>
    );
  }

  const usedPercent = usage.total > 0 ? (usage.used / usage.total) * 100 : 0;

  return (
    <div className="mb-4">
      <h5 className="d-flex align-items-center">
        {icon}
        <span className="ms-2">{label}</span>
      </h5>
      <small className="text-muted d-block mb-2">{usage.path}</small>
      <div className="progress progress-lg">
        <div
          className={`progress-bar ${progressClass(usedPercent)}`}
          role="progressbar"
          style={{ width: `${usedPercent}%` }}
          aria-valuenow={usedPercent}
          aria-valuemin="0"
          aria-valuemax="100"
        >
          {formatFileSize(usage.used)}
        </div>
      </div>
      <div className="d-flex justify-content-between mt-1 text-muted small">
        <span>{t('admin.storage.used', { percent: usedPercent.toFixed(1) })}</span>
        <span>{t('admin.storage.free', { space: formatFileSize(usage.free) })}</span>
        <span>{t('admin.storage.total', { space: formatFileSize(usage.total) })}</span>
      </div>
    </div>
  );
};

StorageBar.propTypes = {
  usage: PropTypes.shape({
    path: PropTypes.string,
    total: PropTypes.number,
    free: PropTypes.number,
    used: PropTypes.number,
  }),
  label: PropTypes.string.isRequired,
  icon: PropTypes.element.isRequired,
};

/**
 * The System tab of the admin page: one usage bar per storage path the
 * app's `storage` call answers, boxes and ISOs.
 */
const AdminStorage = ({ storage }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const [storageInfo, setStorageInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storage()
      .then(setStorageInfo)
      .catch(err => {
        log.api.error('Failed to fetch storage info', { error: err.message });
        notify('danger', responseMessage(err, t('admin.storage.fetchError')));
      })
      .finally(() => setLoading(false));
  }, [notify, storage, t]);

  if (loading) {
    return (
      <div className="text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">{t('loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4>{t('admin.storage.title')}</h4>
      </div>
      <div className="card-body">
        {storageInfo?.boxes && (
          <StorageBar
            usage={storageInfo.boxes}
            label={t('admin.storage.boxStorage')}
            icon={<FaHardDrive />}
          />
        )}
        {storageInfo?.isos && (
          <StorageBar
            usage={storageInfo.isos}
            label={t('admin.storage.isoStorage')}
            icon={<FaCompactDisc />}
          />
        )}
      </div>
    </div>
  );
};

AdminStorage.propTypes = {
  storage: PropTypes.func.isRequired,
};

export default AdminStorage;
