import PropTypes from 'prop-types';
import { Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBuilding, FaCheck, FaCrown } from 'react-icons/fa6';

const ROLE_CLASSES = {
  OWNER: 'bg-danger',
  ADMIN: 'bg-warning',
  MEMBER: 'bg-secondary',
};

export const organizationShape = PropTypes.shape({
  uuid: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  roles: PropTypes.arrayOf(PropTypes.string),
  primary: PropTypes.bool,
  personal: PropTypes.bool,
  logo: PropTypes.string,
});

export const OrgLogo = ({ org, size = 20, className = 'rounded-circle me-2', fallback = null }) =>
  org.logo ? (
    <img
      src={org.logo}
      alt=""
      width={size}
      height={size}
      className={className}
      onError={event => {
        event.currentTarget.style.display = 'none';
      }}
    />
  ) : (
    fallback || <FaBuilding className="logo-md icon-with-margin" aria-hidden />
  );

OrgLogo.propTypes = {
  org: PropTypes.shape({ logo: PropTypes.string }).isRequired,
  size: PropTypes.number,
  className: PropTypes.string,
  fallback: PropTypes.node,
};

export const byPersonalLastThenName = (a, b) =>
  Number(Boolean(a.personal)) - Number(Boolean(b.personal)) ||
  (a.name || '').localeCompare(b.name || '');

const OrgRow = ({ org, active, orgMark, onPick }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
        active ? 'border-primary border-2' : ''
      }`}
      onClick={() => onPick(org.uuid)}
    >
      <div>
        <div className="d-flex align-items-center">
          <OrgLogo org={org} fallback={orgMark} />
          <div>
            <div className="fw-bold">{org.name}</div>
            {org.description ? <small className="text-muted">{org.description}</small> : null}
          </div>
        </div>
      </div>
      <div className="d-flex align-items-center">
        {(org.roles || []).map(role => (
          <span key={role} className={`badge ${ROLE_CLASSES[role] || 'bg-secondary'} me-2`}>
            {t(`roles.${role.toLowerCase()}`, { defaultValue: role })}
          </span>
        ))}
        {org.primary ? (
          <FaCrown
            className="text-warning me-2"
            title={t('orgSwitcher.primaryOrg')}
            aria-label={t('orgSwitcher.primaryOrg')}
          />
        ) : null}
        {active ? <FaCheck className="text-success" /> : null}
      </div>
    </button>
  );
};

OrgRow.propTypes = {
  org: organizationShape.isRequired,
  active: PropTypes.bool.isRequired,
  orgMark: PropTypes.node,
  onPick: PropTypes.func.isRequired,
};

export const OrgSwitcherModal = ({
  show,
  onHide,
  organizations,
  activeUuid = '',
  onPick,
  loading = false,
  loadFailed = false,
  orgMark = null,
}) => {
  const { t } = useTranslation();
  const rows = [...organizations].sort(byPersonalLastThenName);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5">
          <FaBuilding className="me-2" />
          {t('orgSwitcher.title')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="text-center">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">{t('loading')}</span>
            </div>
          </div>
        ) : null}
        {!loading && loadFailed ? (
          <div className="alert alert-danger" role="alert">
            {t('orgSwitcher.loadError')}
          </div>
        ) : null}
        {!loading && !loadFailed && rows.length === 0 ? (
          <div className="alert alert-info">{t('orgSwitcher.noOrgsFound')}</div>
        ) : null}
        {!loading && rows.length > 0 ? (
          <div className="list-group">
            {rows.map(org => (
              <OrgRow
                key={org.uuid}
                org={org}
                active={org.uuid === activeUuid}
                orgMark={orgMark}
                onPick={onPick}
              />
            ))}
          </div>
        ) : null}
      </Modal.Body>
    </Modal>
  );
};

OrgSwitcherModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
  organizations: PropTypes.arrayOf(organizationShape).isRequired,
  activeUuid: PropTypes.string,
  onPick: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  loadFailed: PropTypes.bool,
  orgMark: PropTypes.node,
};
