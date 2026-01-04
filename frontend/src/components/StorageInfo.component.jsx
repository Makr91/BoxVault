import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FaHardDrive, FaCompactDisc } from "react-icons/fa6";

import SystemService from "../services/system.service";
import { log } from "../utils/Logger";

const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) {
    return "0 Bytes";
  }
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

const StorageBar = ({ usage, label, icon }) => {
  const { t } = useTranslation();
  if (!usage) {
    return (
      <div className="alert alert-warning">
        {t("admin.storage.pathNotConfigured", { path: label })}
      </div>
    );
  }

  const usedPercent = usage.total > 0 ? (usage.used / usage.total) * 100 : 0;

  const getProgressBarClass = (percent) => {
    if (percent > 90) {
      return "bg-danger";
    }
    if (percent > 75) {
      return "bg-warning";
    }
    return "bg-primary";
  };

  return (
    <div className="mb-4">
      <h5 className="d-flex align-items-center">
        {icon}
        <span className="ms-2">{label}</span>
      </h5>
      <small className="text-muted d-block mb-2">{usage.path}</small>
      <div className="progress" style={{ height: "25px" }}>
        <div
          className={`progress-bar ${getProgressBarClass(usedPercent)}`}
          role="progressbar"
          style={{ width: `${usedPercent}%` }}
          aria-valuenow={usedPercent}
          aria-valuemin="0"
          aria-valuemax="100"
        >
          {formatBytes(usage.used)}
        </div>
      </div>
      <div className="d-flex justify-content-between mt-1 text-muted small">
        <span>
          {t("admin.storage.used", { percent: usedPercent.toFixed(1) })}
        </span>
        <span>
          {t("admin.storage.free", { space: formatBytes(usage.free) })}
        </span>
        <span>
          {t("admin.storage.total", { space: formatBytes(usage.total) })}
        </span>
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

const StorageInfo = () => {
  const { t } = useTranslation();
  const [storageInfo, setStorageInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    SystemService.getStorageInfo()
      .then((response) => setStorageInfo(response.data))
      .catch((err) => {
        log.api.error("Failed to fetch storage info", { error: err.message });
        setError(err.response?.data?.message || t("admin.storage.fetchError"));
      })
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return (
      <div className="text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">{t("loading")}</span>
        </div>
      </div>
    );
  }
  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4>{t("admin.storage.title")}</h4>
      </div>
      <div className="card-body">
        {storageInfo?.boxes && (
          <StorageBar
            usage={storageInfo.boxes}
            label={t("admin.storage.boxStorage")}
            icon={<FaHardDrive />}
          />
        )}
        {storageInfo?.isos && (
          <StorageBar
            usage={storageInfo.isos}
            label={t("admin.storage.isoStorage")}
            icon={<FaCompactDisc />}
          />
        )}
      </div>
    </div>
  );
};

export default StorageInfo;
