import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { Table } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { FaTrash, FaDownload, FaCompactDisc } from "react-icons/fa6";

import IsoService from "../services/iso.service";
import { log } from "../utils/Logger";

import ConfirmationModal from "./confirmation.component";

const IsoList = ({ organization, isAuthorized, showOnlyPublic }) => {
  const { t } = useTranslation();
  const [isos, setIsos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isoToDelete, setIsoToDelete] = useState(null);
  const [isPublicUpload, setIsPublicUpload] = useState(false);

  useEffect(() => {
    let mounted = true;
    let fetchIsos;
    if (showOnlyPublic) {
      fetchIsos = IsoService.discoverAll();
    } else if (isAuthorized) {
      fetchIsos = IsoService.getAll(organization);
    } else {
      fetchIsos = IsoService.getPublic(organization);
    }

    fetchIsos
      .then((response) => {
        if (mounted) {
          setIsos(response.data);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (mounted) {
          log.api.error("Error loading ISOs", { error: error.message });
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [organization, showOnlyPublic, isAuthorized]);

  const handleFileUpload = (event) => {
    const [file] = event.target.files;
    if (!file) {
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setMessage("");

    IsoService.upload(organization, file, isPublicUpload, (progressEvent) => {
      setUploadProgress(
        Math.round((100 * progressEvent.loaded) / progressEvent.total)
      );
    })
      .then((response) => {
        setMessage(t("messages.operationSuccessful"));
        setMessageType("success");
        setUploading(false);
        setIsos([response.data, ...isos]);
      })
      .catch((error) => {
        log.api.error("Error uploading ISO", { error: error.message });
        setMessage(t("messages.uploadFailed"));
        setMessageType("danger");
        setUploading(false);
      });
  };

  const handleDeleteClick = (iso) => {
    setIsoToDelete(iso);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    if (isoToDelete) {
      IsoService.deleteISO(organization, isoToDelete.id)
        .then(() => {
          setMessage(t("messages.operationSuccessful"));
          setMessageType("success");
          setIsos(isos.filter((i) => i.id !== isoToDelete.id));
          setShowDeleteModal(false);
        })
        .catch((error) => {
          log.api.error("Error deleting ISO", { error: error.message });
          setMessage(t("messages.deleteFailed"));
          setMessageType("danger");
          setShowDeleteModal(false);
        });
    }
  };

  const handleDownloadClick = async (e, iso) => {
    e.preventDefault();
    try {
      // If public, we can try direct download, but getting a link is safer/consistent
      const orgName = iso.organization?.name || organization;
      const response = await IsoService.getDownloadLink(orgName, iso.id);
      window.location.assign(response.data.downloadUrl);
    } catch (error) {
      log.api.error("Error getting download link", { error: error.message });
      setMessage(t("messages.operationFailed"));
      setMessageType("danger");
    }
  };

  const handleVisibilityToggle = (iso) => {
    if (!isAuthorized) {
      return;
    }

    IsoService.update(organization, iso.id, { isPublic: !iso.isPublic })
      .then((response) => {
        setIsos(isos.map((i) => (i.id === iso.id ? response.data : i)));
      })
      .catch((error) => {
        log.api.error("Error updating ISO visibility", {
          error: error.message,
        });
        setMessage(t("messages.operationFailed"));
        setMessageType("danger");
      });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) {
      return "0 Bytes";
    }
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  const renderTableBody = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan="6" className="text-center">
            {t("status.loading")}
          </td>
        </tr>
      );
    }

    if (isos.length === 0) {
      return (
        <tr>
          <td colSpan="6" className="text-center">
            {t("messages.noResultsFound")}
          </td>
        </tr>
      );
    }

    return isos.map((iso) => (
      <tr key={iso.id}>
        <td>{iso.name}</td>
        {showOnlyPublic ? (
          <td>{iso.organization?.name || "Unknown"}</td>
        ) : (
          <td>
            {isAuthorized ? (
              <button
                type="button"
                className={`badge ${iso.isPublic ? "bg-info" : "bg-secondary"} border-0 cursor-pointer`}
                onClick={() => handleVisibilityToggle(iso)}
                title="Click to toggle visibility"
              >
                {iso.isPublic
                  ? t("box.organization.visibility.public")
                  : t("box.organization.visibility.private")}
              </button>
            ) : (
              <span
                className={`badge ${iso.isPublic ? "bg-info" : "bg-secondary"}`}
              >
                {iso.isPublic
                  ? t("box.organization.visibility.public")
                  : t("box.organization.visibility.private")}
              </span>
            )}
          </td>
        )}
        <td>{formatFileSize(iso.size)}</td>
        <td>
          <code title={iso.checksum}>{iso.checksum.substring(0, 12)}...</code>
        </td>
        <td>{new Date(iso.createdAt).toLocaleDateString()}</td>
        <td>
          <div className="btn-group">
            <button
              type="button"
              onClick={(e) => handleDownloadClick(e, iso)}
              className="btn btn-sm btn-outline-primary"
            >
              <FaDownload />
            </button>
            {isAuthorized && (
              <button
                className="btn btn-sm btn-outline-danger"
                onClick={() => handleDeleteClick(iso)}
              >
                <FaTrash />
              </button>
            )}
          </div>
        </td>
      </tr>
    ));
  };

  return (
    <div className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>
          <FaCompactDisc className="me-2" />
          ISO Images
        </h4>
        {isAuthorized && (
          <div className="d-flex align-items-center gap-3">
            <div className="form-check mb-0">
              <input
                className="form-check-input"
                type="checkbox"
                id="publicUploadCheck"
                checked={isPublicUpload}
                onChange={(e) => setIsPublicUpload(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="publicUploadCheck">
                Public
              </label>
            </div>
            <label className={`btn btn-primary ${uploading ? "disabled" : ""}`}>
              {uploading ? `Uploading ${uploadProgress}%` : t("buttons.upload")}
              <input
                type="file"
                hidden
                onChange={handleFileUpload}
                disabled={uploading}
                accept=".iso"
              />
            </label>
          </div>
        )}
      </div>

      {message && (
        <div className={`alert alert-${messageType}`} role="alert">
          {message}
        </div>
      )}

      {uploading && (
        <div className="progress mb-3">
          <div
            className="progress-bar progress-bar-striped progress-bar-animated"
            role="progressbar"
            style={{ width: `${uploadProgress}%` }}
            aria-valuenow={uploadProgress}
            aria-valuemin="0"
            aria-valuemax="100"
          >
            {uploadProgress}%
          </div>
        </div>
      )}

      <Table striped hover responsive>
        <thead>
          <tr>
            <th>Name</th>
            <th>{showOnlyPublic ? "Organization" : "Visibility"}</th>
            <th>Size</th>
            <th>Checksum (SHA256)</th>
            <th>Uploaded</th>
            <th>Actions</th>
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
  isAuthorized: PropTypes.bool.isRequired,
  showOnlyPublic: PropTypes.bool,
};

export default IsoList;
