import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaUser,
  FaUserShield,
  FaUserGear,
  FaBan,
  FaTrash,
  FaUserMinus,
  FaCheck,
  FaBox,
} from 'react-icons/fa6';

import { userDisplayName, userSecondaryLine } from '../chrome';

const UserCardActions = ({
  user,
  currentUser,
  orgRole,
  onChangeRole,
  onSuspend,
  onResume,
  onRemoveFromOrg,
  onDelete,
}) => {
  const { t } = useTranslation();
  const isSelf = currentUser && currentUser.id === user.id;

  return (
    <div className="d-flex flex-wrap gap-2 justify-content-end align-items-center">
      {onChangeRole && (
        <select
          className="form-select form-select-sm w-auto"
          value={orgRole || 'member'}
          onChange={e => onChangeRole(e.target.value)}
          aria-label={t('orgConsole.users.roles')}
        >
          <option value="member">{t('roles.member')}</option>
          <option value="admin">{t('roles.admin')}</option>
          <option value="owner">{t('roles.owner')}</option>
        </select>
      )}
      {onSuspend && !user.suspended && !isSelf && (
        <button
          type="button"
          className="btn btn-sm btn-outline-warning"
          onClick={onSuspend}
          title={t('orgConsole.buttons.suspend')}
        >
          <FaBan />
        </button>
      )}
      {onResume && user.suspended && (
        <button
          type="button"
          className="btn btn-sm btn-outline-success"
          onClick={onResume}
          title={t('orgConsole.buttons.resume')}
        >
          <FaCheck />
        </button>
      )}
      {onRemoveFromOrg && !isSelf && (
        <button
          type="button"
          className="btn btn-sm btn-outline-danger"
          onClick={onRemoveFromOrg}
          title={t('orgConsole.buttons.removeFromOrg')}
        >
          <FaUserMinus />
        </button>
      )}
      {onDelete && !isSelf && (
        <button
          type="button"
          className="btn btn-sm btn-danger"
          onClick={onDelete}
          title={t('orgConsole.buttons.deleteUser')}
        >
          <FaTrash />
        </button>
      )}
    </div>
  );
};

UserCardActions.propTypes = {
  user: PropTypes.object.isRequired,
  currentUser: PropTypes.object,
  orgRole: PropTypes.string,
  onChangeRole: PropTypes.func,
  onSuspend: PropTypes.func,
  onResume: PropTypes.func,
  onRemoveFromOrg: PropTypes.func,
  onDelete: PropTypes.func,
};

const roleNamesOf = user =>
  user.roles ? user.roles.map(role => (typeof role === 'string' ? role : role.name)) : [];

/**
 * One member of an organization as a card: avatar (the stored URL, else a
 * Gravatar fetched through `gravatarProfile`), name, email, the role badge
 * (the organization role when the card manages one, else the global role),
 * a suspended badge, the box count, and the actions the caller wires:
 * change role, suspend, resume, remove from the organization, delete.
 */
const UserCard = ({
  user,
  currentUser,
  orgRole,
  columnClass = 'col-md-6 col-xl-4',
  gravatarProfile,
  onChangeRole,
  onSuspend,
  onResume,
  onRemoveFromOrg,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [gravatarUrl, setGravatarUrl] = useState(null);

  useEffect(() => {
    let mounted = true;
    if (!user.avatar_url && user.emailHash) {
      gravatarProfile(user.emailHash).then(profile => {
        if (mounted && profile?.avatar_url) {
          setGravatarUrl(`${profile.avatar_url}?s=50`);
        }
      });
    }
    return () => {
      mounted = false;
    };
  }, [gravatarProfile, user.avatar_url, user.emailHash]);

  const avatarUrl = user.avatar_url || gravatarUrl;
  const globalIsAdmin = roleNamesOf(user).includes('admin');

  const resolveBadgeRole = () => {
    if (orgRole || onChangeRole) {
      return orgRole || 'member';
    }
    return globalIsAdmin ? 'admin' : 'user';
  };
  const badgeRole = resolveBadgeRole();

  const getRoleBadge = () => {
    if (badgeRole === 'owner') {
      return (
        <span className="badge bg-danger me-1">
          <FaUserGear className="me-1" /> {t('roles.owner')}
        </span>
      );
    }
    if (badgeRole === 'admin') {
      return (
        <span className="badge bg-warning text-dark me-1">
          <FaUserShield className="me-1" /> {t('roles.admin')}
        </span>
      );
    }
    if (badgeRole === 'member') {
      return (
        <span className="badge bg-secondary me-1">
          <FaUser className="me-1" /> {t('roles.member')}
        </span>
      );
    }
    return (
      <span className="badge bg-secondary me-1">
        <FaUser className="me-1" /> {t('roles.user')}
      </span>
    );
  };

  const displayName = userDisplayName(user);
  const secondaryLine = userSecondaryLine(user);

  return (
    <div className={`${columnClass} mb-3`}>
      <div className={`card h-100 ${user.suspended ? 'border-danger' : ''}`}>
        <div className="card-body">
          <div className="d-flex align-items-center mb-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="rounded-circle flex-shrink-0 me-3"
                style={{ width: 50, height: 50, objectFit: 'cover' }}
              />
            ) : (
              <div
                className="rounded-circle bg-secondary d-flex align-items-center justify-content-center flex-shrink-0 me-3"
                style={{ width: 50, height: 50 }}
              >
                <FaUser className="text-white fs-4" />
              </div>
            )}
            <div className="overflow-hidden">
              <h6 className="card-title mb-0 text-truncate" title={displayName}>
                {displayName}
              </h6>
              {secondaryLine && (
                <small className="text-body-secondary text-truncate d-block" title={secondaryLine}>
                  {secondaryLine}
                </small>
              )}
            </div>
          </div>

          <div className="mb-3">
            {getRoleBadge()}
            {user.suspended && (
              <span className="badge bg-danger">
                <FaBan className="me-1" /> {t('orgConsole.users.suspended')}
              </span>
            )}
          </div>

          <div className="d-flex align-items-center text-muted small">
            <FaBox className="me-2" />
            {t('orgConsole.users.boxes')}: <strong>{user.totalBoxes || 0}</strong>
          </div>
        </div>

        <div className="card-footer bg-transparent border-top-0 pt-0 pb-3">
          <UserCardActions
            user={user}
            currentUser={currentUser}
            orgRole={orgRole}
            onChangeRole={onChangeRole}
            onSuspend={onSuspend}
            onResume={onResume}
            onRemoveFromOrg={onRemoveFromOrg}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
};

UserCard.propTypes = {
  user: PropTypes.object.isRequired,
  currentUser: PropTypes.object,
  orgRole: PropTypes.string,
  columnClass: PropTypes.string,
  gravatarProfile: PropTypes.func.isRequired,
  onChangeRole: PropTypes.func,
  onSuspend: PropTypes.func,
  onResume: PropTypes.func,
  onRemoveFromOrg: PropTypes.func,
  onDelete: PropTypes.func,
};

export default UserCard;
