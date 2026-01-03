import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";
import { useTranslation, Trans } from "react-i18next";
import { FaBuilding, FaUsers, FaBox } from "react-icons/fa6";
import { Link, useNavigate } from "react-router-dom";

import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import AuthService from "../services/auth.service";
import OrganizationService from "../services/organization.service";
import RequestService from "../services/request.service";
import { log } from "../utils/Logger";

/**
 * OrganizationDiscovery - Public page for discovering and joining organizations
 */
const OrganizationDiscovery = ({ theme }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [joinRequestMessage, setJoinRequestMessage] = useState("");
  const [requestingOrg, setRequestingOrg] = useState(null);
  const [orgGravatars, setOrgGravatars] = useState({});

  const fetchOrgGravatars = useCallback(async (orgList) => {
    const gravatarPromises = orgList
      .filter((org) => org.emailHash)
      .map(async (org) => {
        try {
          const profile = await AuthService.getGravatarProfile(org.emailHash);
          return { name: org.name, url: profile?.avatar_url };
        } catch (error) {
          log.api.error("Error fetching org gravatar", {
            orgName: org.name,
            error: error.message,
          });
          return { name: org.name, url: null };
        }
      });

    const results = await Promise.all(gravatarPromises);
    const gravatars = {};
    results.forEach((result) => {
      if (result.url) {
        gravatars[result.name] = result.url;
      }
    });
    setOrgGravatars(gravatars);
  }, []);

  const loadDiscoverableOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await OrganizationService.getDiscoverableOrganizations();
      const orgs = response.data || [];
      setOrganizations(orgs);
      await fetchOrgGravatars(orgs);
    } catch (error) {
      log.api.error("Error loading discoverable organizations", {
        error: error.message,
      });
      setMessage(t("discovery.errors.load"));
      setMessageType("danger");
    } finally {
      setLoading(false);
    }
  }, [fetchOrgGravatars, t]);

  useEffect(() => {
    document.title = t("discovery.title");
    loadDiscoverableOrganizations();
  }, [loadDiscoverableOrganizations, t]);

  // Separate effect for checking join intent after organizations load
  useEffect(() => {
    if (organizations.length > 0) {
      const savedJoinOrg = localStorage.getItem("boxvault_join_org");
      if (savedJoinOrg) {
        const org = organizations.find((o) => o.name === savedJoinOrg);
        if (org) {
          setRequestingOrg(org);
          localStorage.removeItem("boxvault_join_org");
        }
      }
    }
  }, [organizations]);

  const handleJoinRequest = async (orgName) => {
    if (!joinRequestMessage.trim()) {
      setMessage(t("discovery.errors.emptyMessage"));
      setMessageType("warning");
      return;
    }

    try {
      await RequestService.createJoinRequest(orgName, joinRequestMessage);
      setMessage(t("discovery.messages.requestSent", { orgName }));
      setMessageType("success");
      setJoinRequestMessage("");
      setRequestingOrg(null);
    } catch (error) {
      log.api.error("Error creating join request", {
        orgName,
        error: error.message,
      });
      setMessage(
        error.response?.data?.message ||
          t("discovery.errors.requestFailed", { orgName })
      );
      setMessageType("danger");
    }
  };

  const getAccessModeDisplay = (accessMode) => {
    switch (accessMode) {
      case "invite_only":
        return t("discovery.buttons.inviteOnly");
      case "request_to_join":
        return t("discovery.buttons.requestToJoin");
      default:
        return t("discovery.buttons.private");
    }
  };

  const getAccessModeClass = (accessMode) => {
    switch (accessMode) {
      case "invite_only":
        return "bg-warning";
      case "request_to_join":
        return "bg-success";
      default:
        return "bg-secondary";
    }
  };

  const renderOrgIcon = (org) => {
    if (orgGravatars[org.name]) {
      return (
        <img
          src={orgGravatars[org.name]}
          alt={`${org.name} icon`}
          className="rounded-circle me-2"
          width="24"
          height="24"
        />
      );
    }
    const LogoComponent = theme === "light" ? BoxVaultLight : BoxVaultDark;
    return <LogoComponent className="logo-lg icon-with-margin" />;
  };

  const filteredOrganizations = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      org.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mt-4">
      <div className="row">
        <div className="col-12">
          <h2 className="mb-4">
            <FaBuilding className="me-2" />
            {t("discovery.title")}
          </h2>
          <p className="text-muted">{t("discovery.description")}</p>

          {message && (
            <div
              className={`alert alert-${messageType} alert-dismissible fade show`}
              role="alert"
            >
              {message}
              <button
                type="button"
                className="btn-close"
                onClick={() => setMessage("")}
                aria-label="Close"
              />
            </div>
          )}

          {/* Search */}
          <div className="card mb-4">
            <div className="card-body">
              <div className="input-group">
                <span className="input-group-text">🔍</span>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t("discovery.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {loading && (
            <div className="text-center">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          )}

          {!loading && filteredOrganizations.length === 0 && (
            <div className="alert alert-info">
              <h5>{t("discovery.noOrgsFoundTitle")}</h5>
              <p className="mb-0">
                {searchTerm
                  ? t("discovery.noOrgsFoundSearch")
                  : t("discovery.noOrgsFoundPublic")}
              </p>
            </div>
          )}

          {!loading && filteredOrganizations.length > 0 && (
            <div className="row">
              {filteredOrganizations.map((org) => (
                <div key={org.id} className="col-md-6 col-lg-4 mb-4">
                  <div className="card h-100">
                    <div className="card-header">
                      <div className="d-flex justify-content-between align-items-center">
                        <h5 className="mb-0">
                          {renderOrgIcon(org)}
                          {org.name}
                        </h5>
                        <span
                          className={`badge ${getAccessModeClass(org.accessMode)}`}
                        >
                          {getAccessModeDisplay(org.accessMode)}
                        </span>
                      </div>
                    </div>
                    <div className="card-body">
                      <p className="card-text">
                        {org.description || t("discovery.noDescription")}
                      </p>
                      <div className="d-flex justify-content-between text-muted small">
                        <span>
                          <FaUsers className="me-1" />
                          {org.memberCount} {t("discovery.members")}
                        </span>
                        <div className="d-flex flex-column align-items-end">
                          <span>
                            <FaBox className="me-1" />
                            <Link
                              to={`/${org.name}`}
                              className="text-decoration-none"
                            >
                              {org.publicBoxCount} {t("discovery.public")}
                            </Link>
                          </span>
                          {org.totalBoxCount > org.publicBoxCount && (
                            <span className="text-muted">
                              {org.totalBoxCount - org.publicBoxCount}{" "}
                              {t("discovery.private")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="card-footer">
                      {org.accessMode === "invite_only" && (
                        <button
                          className="btn btn-outline-secondary w-100"
                          disabled
                        >
                          {t("discovery.buttons.inviteOnly")}
                        </button>
                      )}
                      {org.accessMode === "request_to_join" && (
                        <button
                          className="btn btn-primary w-100"
                          onClick={() => {
                            const currentUser = AuthService.getCurrentUser();
                            if (!currentUser) {
                              localStorage.setItem(
                                "boxvault_join_org",
                                org.name
                              );
                              navigate("/login");
                            } else {
                              setRequestingOrg(org);
                            }
                          }}
                        >
                          {t("discovery.buttons.requestToJoin")}
                        </button>
                      )}
                      {org.accessMode !== "invite_only" &&
                        org.accessMode !== "request_to_join" && (
                          <button
                            className="btn btn-outline-secondary w-100"
                            disabled
                          >
                            {t("discovery.buttons.private")}
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Join Request Modal */}
      {requestingOrg && (
        <div className="modal show d-block modal-backdrop-custom" tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {t("discovery.modal.title", { orgName: requestingOrg.name })}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setRequestingOrg(null);
                    setJoinRequestMessage("");
                  }}
                />
              </div>
              <div className="modal-body">
                <p>
                  <Trans
                    i18nKey="discovery.modal.description"
                    values={{ orgName: requestingOrg.name }}
                    components={{ strong: <strong /> }}
                  />
                </p>
                <textarea
                  className="form-control"
                  rows="4"
                  value={joinRequestMessage}
                  onChange={(e) => setJoinRequestMessage(e.target.value)}
                  placeholder={t("discovery.modal.placeholder")}
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRequestingOrg(null)}
                >
                  {t("buttons.cancel")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleJoinRequest(requestingOrg.name)}
                  disabled={!joinRequestMessage.trim()}
                >
                  {t("discovery.buttons.sendRequest")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

OrganizationDiscovery.propTypes = {
  theme: PropTypes.string.isRequired,
};

export default OrganizationDiscovery;
