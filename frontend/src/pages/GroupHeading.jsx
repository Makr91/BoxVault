import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { FaChevronDown, FaChevronRight } from 'react-icons/fa6';
import { Link } from 'react-router-dom';

import { OrgLogo } from '../chrome';

import { organizationShape } from './itemShape';

export const CollapseButton = ({ collapsed, onToggle }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="btn btn-link btn-sm p-0 text-body"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={t('pages.toggle')}
      title={t('pages.toggle')}
    >
      {collapsed ? <FaChevronRight /> : <FaChevronDown />}
    </button>
  );
};

CollapseButton.propTypes = {
  collapsed: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

export const groupShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  organization: organizationShape.isRequired,
  items: PropTypes.array.isRequired,
});

const GroupHeading = ({ group, collapsed, onToggle, countLabel, orgMark }) => (
  <div className="d-flex align-items-center gap-2">
    <CollapseButton collapsed={collapsed} onToggle={onToggle} />
    <OrgLogo
      org={group.organization}
      size={30}
      className="rounded-circle avatar-lg"
      fallback={orgMark}
    />
    <Link to={`/${group.organization.name}`} className="fw-semibold">
      {group.organization.name}
    </Link>
    <span className="badge bg-secondary bg-opacity-50">{countLabel}</span>
  </div>
);

GroupHeading.propTypes = {
  group: groupShape.isRequired,
  collapsed: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  countLabel: PropTypes.string.isRequired,
  orgMark: PropTypes.node,
};

export default GroupHeading;
