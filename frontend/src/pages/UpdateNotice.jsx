import PropTypes from 'prop-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaDownload, FaCopy, FaCheck } from 'react-icons/fa6';

/**
 * The notice the admin page shows when a newer version is available: the
 * two versions and the app's own update command with a copy button.
 */
const UpdateNotice = ({ updateInfo, command }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="alert alert-info" role="status">
      <h4 className="alert-heading">
        <FaDownload className="me-2" />
        {t('admin.update.title')}
      </h4>
      <p>
        {t('admin.update.message', {
          latestVersion: updateInfo.latestVersion,
          currentVersion: updateInfo.currentVersion,
        })}
      </p>
      <hr />
      <p className="mb-1">{t('admin.update.instructions')}</p>
      <div className="input-group">
        <input type="text" className="form-control" value={command} readOnly />
        <button
          className="btn btn-outline-secondary"
          type="button"
          onClick={handleCopyCommand}
          title={t('admin.buttons.copy')}
        >
          {copied ? <FaCheck className="text-success" /> : <FaCopy />}
        </button>
      </div>
    </div>
  );
};

UpdateNotice.propTypes = {
  updateInfo: PropTypes.shape({
    latestVersion: PropTypes.string,
    currentVersion: PropTypes.string,
  }).isRequired,
  command: PropTypes.string.isRequired,
};

export default UpdateNotice;
