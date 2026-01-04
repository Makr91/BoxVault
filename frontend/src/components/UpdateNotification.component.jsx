import PropTypes from "prop-types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaDownload, FaCopy, FaCheck } from "react-icons/fa6";

const UpdateNotification = ({ updateInfo }) => {
  const { t } = useTranslation(["common"]);
  const [copied, setCopied] = useState(false);
  const updateCommand = `sudo apt update && sudo apt install boxvault`;

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(updateCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="alert alert-info" role="alert">
      <h4 className="alert-heading">
        <FaDownload className="me-2" />
        {t("update.available.title")}
      </h4>
      <p>
        {t("update.available.message", {
          latestVersion: updateInfo.latestVersion,
          currentVersion: updateInfo.currentVersion,
        })}
      </p>
      <hr />
      <p className="mb-1">{t("update.available.instructions")}</p>
      <div className="input-group">
        <input
          type="text"
          className="form-control"
          value={updateCommand}
          readOnly
        />
        <button
          className="btn btn-outline-secondary"
          type="button"
          onClick={handleCopyCommand}
          title={t("buttons.copy")}
        >
          {copied ? <FaCheck className="text-success" /> : <FaCopy />}
        </button>
      </div>
    </div>
  );
};

UpdateNotification.propTypes = {
  updateInfo: PropTypes.object.isRequired,
};

export default UpdateNotification;
