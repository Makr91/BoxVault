import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';

import { versionShape } from './itemShape';

const DeprecationBanner = ({ version, children = null }) => {
  const { t } = useTranslation();
  if (!version.deprecated) {
    return null;
  }
  return (
    <div className="alert alert-danger d-flex align-items-center flex-wrap gap-2" role="alert">
      <span>
        <strong>{t('pages.version.deprecatedBanner')}</strong>
        {version.deprecationReason ? ` — ${version.deprecationReason}` : ''}
      </span>
      {children ? <span className="ms-auto">{children}</span> : null}
    </div>
  );
};

DeprecationBanner.propTypes = {
  version: versionShape.isRequired,
  children: PropTypes.node,
};

export default DeprecationBanner;
