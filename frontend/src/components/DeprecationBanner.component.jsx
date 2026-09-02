import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { readDeprecated, readDeprecationReason } from '../utils/versionFields';

const DeprecationBanner = ({ version, children }) => {
  const { t } = useTranslation();
  if (!version || !readDeprecated(version)) {
    return null;
  }
  const reason = readDeprecationReason(version);

  return (
    <div className="alert alert-danger d-flex align-items-center flex-wrap gap-2" role="alert">
      <span>
        <strong>{t('version.deprecatedBanner')}</strong>
        {reason ? ` — ${reason}` : ''}
      </span>
      {children && <span className="ms-auto">{children}</span>}
    </div>
  );
};

DeprecationBanner.propTypes = {
  version: PropTypes.object,
  children: PropTypes.node,
};

export default DeprecationBanner;
