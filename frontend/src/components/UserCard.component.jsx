import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FaUser,
  FaUserShield,
  FaUserGear,
  FaBan,
  FaTrash,
  FaUserMinus,
  FaCheck,
  FaBox,
} from "react-icons/fa6";

import AuthService from "../services/auth.service";
import { log } from "../utils/Logger";

const UserCardActions = ({
  user,
  currentUser,
  onPromote,
  onDemote,
  onSuspend,
  onResume,
  onRemoveFromOrg,
  onDelete,
}) => {
  const { t } = useTranslation();
  const roles = user.roles
    ? user.roles.map((r) => (typeof r === "string" ? r : r.name))
    : [];
  const isModerator = roles.includes("moderator");
  const isAdmin = roles.includes("admin");
  const isSelf = currentUser && currentUser.id === user.id;

  return (
    <div className="d-flex flex-wrap gap-2 justify-content-end">
      {onPromote && !isModerator && !isAdmin && (
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={onPromote}
          title={t("buttons.promote")}
        >
          <FaUserShield />
        </button>
      )}
      {onDemote && isModerator && (
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={onDemote}
          title={t("buttons.demote")}
        >
          <FaUser />
        </button>
      )}
      {onSuspend && !user.suspended && !isSelf && (
        <button
          className="btn btn-sm btn-outline-warning"
          onClick={onSuspend}
          title={t("buttons.suspend")}
        >
          <FaBan />
        </button>
      )}
      {onResume && user.suspended && (
        <button
          className="btn btn-sm btn-outline-success"
          onClick={onResume}
          title={t("buttons.resume")}
        >
          <FaCheck />
        </button>
      )}
      {onRemoveFromOrg && !isSelf && (
        <button
          className="btn btn-sm btn-outline-danger"
          onClick={onRemoveFromOrg}
          title={t("buttons.removeFromOrg")}
        >
          <FaUserMinus />
        </button>
      )}
      {onDelete && !isSelf && (
        <button
          className="btn btn-sm btn-danger"
          onClick={onDelete}
          title={t("buttons.deleteUser")}
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
  onPromote: PropTypes.func,
  onDemote: PropTypes.func,
  onSuspend: PropTypes.func,
  onResume: PropTypes.func,
  onRemoveFromOrg: PropTypes.func,
  onDelete: PropTypes.func,
};

const UserCard = ({
  user,
  currentUser,
  onPromote,
  onDemote,
  onSuspend,
  onResume,
  onRemoveFromOrg,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [gravatarUrl, setGravatarUrl] = useState(null);

  useEffect(() => {
    let mounted = true;
    if (user.emailHash) {
      AuthService.getGravatarProfile(user.emailHash)
        .then((profile) => {
          if (mounted && profile?.thumbnailUrl) {
            // Request a 50px image for consistency with the placeholder
            setGravatarUrl(`${profile.thumbnailUrl}?s=50`);
          }
        })
        .catch((err) => {
          log.component.debug("Failed to load gravatar", {
            error: err.message,
          });
        });
    }
    return () => {
      mounted = false;
    };
  }, [user.emailHash]);

  // Normalize roles to array of strings
  const roles = user.roles
    ? user.roles.map((r) => (typeof r === "string" ? r : r.name))
    : [];
  const isModerator = roles.includes("moderator");
  const isAdmin = roles.includes("admin");

  const getRoleBadge = () => {
    if (isAdmin) {
      return (
        <span className="badge bg-danger me-1">
          <FaUserGear className="me-1" /> {t("roles.admin")}
        </span>
      );
    }
    if (isModerator) {
      return (
        <span className="badge bg-warning text-dark me-1">
          <FaUserShield className="me-1" /> {t("roles.moderator")}
        </span>
      );
    }
    return (
      <span className="badge bg-secondary me-1">
        <FaUser className="me-1" /> {t("roles.user")}
      </span>
    );
  };

  return (
    <div className="col-md-6 col-xl-4 mb-3">
      <div className={`card h-100 ${user.suspended ? "border-danger" : ""}`}>
        <div className="card-body">
          <div className="d-flex align-items-center mb-3">
            {gravatarUrl ? (
              <img
                src={gravatarUrl}
                alt={user.username}
                className="rounded-circle me-3"
                style={{ width: 50, height: 50, objectFit: "cover" }}
              />
            ) : (
              <div
                className="rounded-circle bg-secondary d-flex align-items-center justify-content-center me-3"
                style={{ width: 50, height: 50 }}
              >
                <FaUser className="text-white fs-4" />
              </div>
            )}
            <div className="overflow-hidden">
              <h5
                className="card-title mb-0 text-truncate"
                title={user.username}
              >
                {user.username}
              </h5>
              <small
                className="text-muted text-truncate d-block"
                title={user.email}
              >
                {user.email}
              </small>
            </div>
          </div>

          <div className="mb-3">
            {getRoleBadge()}
            {user.suspended && (
              <span className="badge bg-danger">
                <FaBan className="me-1" /> {t("status.suspended")}
              </span>
            )}
          </div>

          <div className="d-flex align-items-center text-muted small">
            <FaBox className="me-2" />
            {t("moderator.users.boxes")}:{" "}
            <strong>{user.totalBoxes || 0}</strong>
          </div>
        </div>

        <div className="card-footer bg-transparent border-top-0 pt-0 pb-3">
          <UserCardActions
            user={user}
            currentUser={currentUser}
            onPromote={onPromote}
            onDemote={onDemote}
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
  onPromote: PropTypes.func,
  onDemote: PropTypes.func,
  onSuspend: PropTypes.func,
  onResume: PropTypes.func,
  onRemoveFromOrg: PropTypes.func,
  onDelete: PropTypes.func,
};

export default UserCard;
