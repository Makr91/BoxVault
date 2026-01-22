import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FaBuilding, FaCheck } from "react-icons/fa6";

import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import AuthService from "../services/auth.service";
import UserService from "../services/user.service";
import { log } from "../utils/Logger";

/**
 * OrganizationSwitcher - Modal component for switching active organization
 * Similar pattern to language switcher in navbar
 */
const OrganizationSwitcher = ({
  currentUser,
  activeOrganization,
  onOrganizationSwitch,
  showModal,
  setShowModal,
  theme,
}) => {
  const { t } = useTranslation();
  const [userOrganizations, setUserOrganizations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orgGravatars, setOrgGravatars] = useState({});

  const loadUserOrganizations = async () => {
    setLoading(true);
    try {
      const response = await UserService.getUserOrganizations();
      const orgs = response.data || [];
      setUserOrganizations(orgs);

      // Fetch gravatars for all orgs in parallel
      const gravatarPromises = orgs
        .filter((org) => org.emailHash || org.organization?.emailHash)
        .map(async (org) => {
          try {
            const emailHash = org.emailHash || org.organization?.emailHash;
            const name = org.name || org.organization?.name;
            const profile = await AuthService.getGravatarProfile(emailHash);
            return { name, url: profile?.avatar_url };
          } catch (error) {
            const name = org.name || org.organization?.name;
            log.api.error("Error fetching org gravatar", {
              orgName: name,
              error: error.message,
            });
            return { name, url: null };
          }
        });

      const gravatarResults = await Promise.all(gravatarPromises);
      const gravatars = {};
      gravatarResults.forEach((result) => {
        if (result.url) {
          gravatars[result.name] = result.url;
        }
      });
      setOrgGravatars(gravatars);
    } catch (error) {
      log.api.error("Error loading user organizations", {
        error: error.message,
      });
      setUserOrganizations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showModal && currentUser) {
      loadUserOrganizations();
    }
  }, [showModal, currentUser]);

  const handleOrganizationClick = (orgName) => {
    onOrganizationSwitch(orgName);
    setShowModal(false);
  };

  const handleModalClose = () => {
    setShowModal(false);
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case "admin":
        return "bg-danger";
      case "moderator":
        return "bg-warning";
      case "user":
      default:
        return "bg-secondary";
    }
  };

  const renderOrgIcon = (orgName) => {
    if (orgGravatars[orgName]) {
      return (
        <img
          src={orgGravatars[orgName]}
          alt={`${orgName} icon`}
          className="rounded-circle me-2"
          width="20"
          height="20"
        />
      );
    }
    const LogoComponent = theme === "light" ? BoxVaultLight : BoxVaultDark;
    return <LogoComponent className="logo-md icon-with-margin" />;
  };

  if (!showModal) {
    return null;
  }

  return (
    <div className="modal show d-block modal-backdrop-custom" tabIndex="-1">
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <FaBuilding className="me-2" />
              {t("orgSwitcher.title")}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={handleModalClose}
              aria-label="Close"
            />
          </div>
          <div className="modal-body">
            {loading && (
              <div className="text-center">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">{t("loading")}</span>
                </div>
              </div>
            )}
            {!loading && userOrganizations.length === 0 && (
              <div className="alert alert-info">
                {t("orgSwitcher.noOrgsFound")}
              </div>
            )}
            {!loading && userOrganizations.length > 0 && (
              <div className="list-group">
                {userOrganizations.map((org) => {
                  const orgName = org.name || org.organization?.name;
                  const orgDesc =
                    org.description || org.organization?.description;
                  const isPrimary = !!org.isPrimary;

                  return (
                    <button
                      key={orgName}
                      type="button"
                      className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                        activeOrganization === orgName
                          ? "border-primary border-2"
                          : ""
                      }`}
                      onClick={() => handleOrganizationClick(orgName)}
                    >
                      <div>
                        <div className="d-flex align-items-center">
                          {renderOrgIcon(orgName)}
                          <div>
                            <div className="fw-bold">{orgName}</div>
                            {orgDesc && (
                              <small className="text-muted">{orgDesc}</small>
                            )}
                            {isPrimary && (
                              <small className="text-primary d-block">
                                {t("orgSwitcher.primaryOrg")}
                              </small>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="d-flex align-items-center">
                        <span
                          className={`badge ${getRoleBadgeClass(org.role)} me-2`}
                        >
                          {t(`roles.${org.role}`)}
                        </span>
                        {activeOrganization === orgName && (
                          <FaCheck className="text-success" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleModalClose}
            >
              {t("buttons.cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

OrganizationSwitcher.propTypes = {
  currentUser: PropTypes.shape({
    username: PropTypes.string,
    id: PropTypes.number,
  }),
  activeOrganization: PropTypes.string,
  onOrganizationSwitch: PropTypes.func.isRequired,
  showModal: PropTypes.bool.isRequired,
  setShowModal: PropTypes.func.isRequired,
  theme: PropTypes.string.isRequired,
};

export default OrganizationSwitcher;
