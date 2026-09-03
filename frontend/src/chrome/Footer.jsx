import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { OverlayTrigger, Popover } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaCircle, FaGithub, FaHeartPulse } from 'react-icons/fa6';

const HEALTH_POLL_MS = 60000;

const statusColor = status => {
  const lower = String(status).toLowerCase();
  if (lower === 'good' || lower.startsWith('ok')) {
    return 'text-success';
  }
  if (lower.includes('warn')) {
    return 'text-warning';
  }
  if (lower.includes('error') || lower.includes('bad')) {
    return 'text-danger';
  }
  return 'text-success';
};

const OVERALL_COLORS = { ok: 'text-success', warning: 'text-warning', error: 'text-danger' };

const HealthIndicator = ({ fetchHealth }) => {
  const { t } = useTranslation();
  const [health, setHealth] = useState({ status: 'loading', services: {} });

  useEffect(() => {
    const load = () => {
      fetchHealth()
        .then(data => setHealth(data))
        .catch(() => setHealth({ status: 'error', services: {} }));
    };
    load();
    const interval = setInterval(load, HEALTH_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const overall = health.status || 'error';

  const popover = props => (
    <Popover id="health-popover" {...props}>
      <Popover.Header as="h3">{t('footer.health.status')}</Popover.Header>
      <Popover.Body>
        <div className="mb-2">
          <FaCircle className={`me-2 ${statusColor(overall)}`} />
          {t(`footer.health.${overall}`, { defaultValue: overall })}
        </div>
        {Object.entries(health.services || {}).map(([service, status]) => (
          <div key={service} className="mb-1">
            <FaCircle className={`me-2 ${statusColor(status)}`} />
            {t(`footer.health.${service}`, {
              defaultValue: service.charAt(0).toUpperCase() + service.slice(1),
            })}
            : {status}
          </div>
        ))}
      </Popover.Body>
    </Popover>
  );

  return (
    <OverlayTrigger placement="top" delay={{ show: 250, hide: 400 }} overlay={popover}>
      <div className="d-flex align-items-center cursor-pointer">
        <FaHeartPulse className={OVERALL_COLORS[health.status] || 'text-muted'} />
      </div>
    </OverlayTrigger>
  );
};

HealthIndicator.propTypes = {
  fetchHealth: PropTypes.func.isRequired,
};

const Footer = ({ appName, version, repoUrl, poweredBy, fetchHealth = null }) => {
  const { t } = useTranslation(['common', 'auth']);
  return (
    <footer className="footer mt-auto bg-body-tertiary border-top">
      <div className="container-fluid position-relative d-flex align-items-center">
        <div className="footer-edge-start">
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-decoration-none text-body-secondary"
          >
            <FaGithub className="me-1" />
            {appName} &copy; {new Date().getFullYear()} · v{version}
          </a>
        </div>
        <div className="mx-auto d-flex align-items-center">
          <span className="text-muted me-2">{t('auth:login.poweredBy')}</span>
          <a
            href={poweredBy.href}
            target="_blank"
            rel="noreferrer"
            className="text-decoration-none d-flex align-items-center"
          >
            <img
              src={poweredBy.logoSrc}
              alt={t('auth:login.poweredByCompany')}
              height="20"
              className="me-2"
              onError={event => {
                event.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-muted">{t('auth:login.poweredByCompany')}</span>
          </a>
        </div>
        <div className="footer-edge-end d-flex align-items-center">
          {fetchHealth ? <HealthIndicator fetchHealth={fetchHealth} /> : null}
        </div>
      </div>
    </footer>
  );
};

Footer.propTypes = {
  appName: PropTypes.string.isRequired,
  version: PropTypes.string.isRequired,
  repoUrl: PropTypes.string.isRequired,
  poweredBy: PropTypes.shape({
    href: PropTypes.string.isRequired,
    logoSrc: PropTypes.string.isRequired,
  }).isRequired,
  fetchHealth: PropTypes.func,
};

export default Footer;
