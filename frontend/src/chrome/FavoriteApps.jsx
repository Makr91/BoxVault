import PropTypes from 'prop-types';
import { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaStar } from 'react-icons/fa6';

const AppIcon = ({ app }) => {
  const [failed, setFailed] = useState(false);
  let iconUrl = app.iconUrl || '';
  if (!iconUrl && app.homeUrl) {
    try {
      iconUrl = `${new URL(app.homeUrl).origin}/favicon.ico`;
    } catch {
      iconUrl = '';
    }
  }
  if (!iconUrl || failed) {
    return <FaStar className="text-warning logo-md icon-with-margin" />;
  }
  return (
    <img
      src={iconUrl}
      className="logo-md icon-with-margin"
      alt=""
      onError={() => setFailed(true)}
    />
  );
};

AppIcon.propTypes = {
  app: PropTypes.shape({
    iconUrl: PropTypes.string,
    homeUrl: PropTypes.string,
  }).isRequired,
};

const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

const FavoriteApps = ({ apps }) => {
  const { t } = useTranslation();
  if (apps.length === 0) {
    return null;
  }
  return (
    <>
      <Dropdown.Divider />
      <Dropdown.Header className="py-0">{t('navbar.favorites')}</Dropdown.Header>
      {[...apps].sort(byOrder).map(app => (
        <Dropdown.Item
          key={app.clientId}
          href={app.homeUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
        >
          <AppIcon app={app} />
          {app.customLabel || app.clientName || app.clientId}
        </Dropdown.Item>
      ))}
    </>
  );
};

FavoriteApps.propTypes = {
  apps: PropTypes.arrayOf(
    PropTypes.shape({
      clientId: PropTypes.string.isRequired,
      clientName: PropTypes.string,
      customLabel: PropTypes.string,
      iconUrl: PropTypes.string,
      homeUrl: PropTypes.string,
      order: PropTypes.number,
    })
  ).isRequired,
};

export default FavoriteApps;
