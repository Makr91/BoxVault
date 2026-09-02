import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

const StatusChips = ({ status = null, visibility = null, osLabel = null, deprecated = false }) => {
  const { t } = useTranslation();
  return (
    <>
      {status ? (
        <span className={`badge ${status === 'published' ? 'bg-success' : 'bg-warning'}`}>
          {t(status === 'published' ? 'pages.status.published' : 'pages.status.pending')}
        </span>
      ) : null}
      {visibility ? (
        <span className={`badge ${visibility === 'public' ? 'bg-info' : 'bg-secondary'}`}>
          {t(visibility === 'public' ? 'pages.status.public' : 'pages.status.private')}
        </span>
      ) : null}
      {osLabel ? <span className="badge badge-os">{osLabel}</span> : null}
      {deprecated ? <span className="badge bg-danger">{t('pages.status.deprecated')}</span> : null}
    </>
  );
};

StatusChips.propTypes = {
  status: PropTypes.oneOf(['published', 'pending']),
  visibility: PropTypes.oneOf(['public', 'private']),
  osLabel: PropTypes.string,
  deprecated: PropTypes.bool,
};

export default StatusChips;
