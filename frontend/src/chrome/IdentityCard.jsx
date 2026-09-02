import PropTypes from 'prop-types';
import { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaChevronRight, FaIdBadge, FaUser } from 'react-icons/fa6';

export const localProfileShape = PropTypes.shape({
  to: PropTypes.string.isRequired,
  LinkComponent: PropTypes.elementType.isRequired,
});

const CARD_CLASS = 'user-card d-flex align-items-center gap-3';

const IdentityCard = ({ displayName, email, avatar, issuerUrl = '', localProfile = null }) => {
  const { t } = useTranslation();
  const [useLocal, setUseLocal] = useState(false);
  const canToggle = Boolean(issuerUrl) && Boolean(localProfile);
  const external = Boolean(issuerUrl) && !(canToggle && useLocal);

  const flipTarget = event => {
    event.preventDefault();
    event.stopPropagation();
    setUseLocal(current => !current);
  };

  const flipTargetKey = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      flipTarget(event);
    }
  };

  const glyph = external ? <FaIdBadge /> : <FaUser />;

  const body = (
    <>
      {avatar}
      <span className="flex-grow-1">
        <span className="d-block fw-semibold">{displayName}</span>
        {email ? <small className="d-block text-body-secondary">{email}</small> : null}
      </span>
      <span className="user-card-actions">
        {canToggle ? (
          <span
            role="button"
            tabIndex={0}
            className="d-inline-flex text-body-secondary flex-shrink-0 cursor-pointer"
            onClick={flipTarget}
            onKeyDown={flipTargetKey}
            title={t('navbar.profileModeTitle')}
          >
            {glyph}
          </span>
        ) : (
          <span className="d-inline-flex text-body-secondary flex-shrink-0">{glyph}</span>
        )}
        <FaChevronRight className="text-body-secondary flex-shrink-0" />
      </span>
    </>
  );

  if (external) {
    return (
      <Dropdown.Item
        href={`${issuerUrl}/user/profile`}
        target="_blank"
        rel="noopener noreferrer"
        className={CARD_CLASS}
      >
        {body}
      </Dropdown.Item>
    );
  }
  if (localProfile) {
    return (
      <Dropdown.Item as={localProfile.LinkComponent} to={localProfile.to} className={CARD_CLASS}>
        {body}
      </Dropdown.Item>
    );
  }
  return <Dropdown.ItemText className={CARD_CLASS}>{body}</Dropdown.ItemText>;
};

IdentityCard.propTypes = {
  displayName: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  avatar: PropTypes.node.isRequired,
  issuerUrl: PropTypes.string,
  localProfile: localProfileShape,
};

export default IdentityCard;
