import PropTypes from "prop-types";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FaArrowUpRightFromSquare, FaBuilding } from "react-icons/fa6";

import EventBus from "../common/EventBus";
import AuthService from "../services/auth.service";
import InvitationService from "../services/invitation.service";
import OrganizationService from "../services/organization.service";
import RequestService from "../services/request.service";
import { log } from "../utils/Logger";
import { isOrgOwner } from "../utils/permissions";

import ConfirmationModal from "./confirmation.component";
import UserCard from "./UserCard.component";

const OrgConsoleTabs = ({
  activeTab,
  setActiveTab,
  isExternalOrg,
  orgAccessMode,
  joinRequestCount,
}) => {
  const { t } = useTranslation();
  // SSO orgs take join requests too when the IdP-managed access mode allows
  // them; approval then delegates an IdP invite instead of a local membership.
  const showJoinRequests =
    !isExternalOrg || orgAccessMode === "request_to_join";

  return (
    <ul className="nav nav-tabs">
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === "organization" ? "active" : ""}`}
          onClick={() => setActiveTab("organization")}
        >
          {t("orgConsole.tabs.organization")}
        </button>
      </li>
      {showJoinRequests && (
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "joinRequests" ? "active" : ""}`}
            onClick={() => setActiveTab("joinRequests")}
          >
            {t("orgConsole.tabs.joinRequests")}
            {joinRequestCount > 0 && (
              <span className="badge bg-warning ms-2">{joinRequestCount}</span>
            )}
          </button>
        </li>
      )}
      {/* Invitations stay available for SSO-managed orgs too: their invites
          are delegated to the identity provider's invite API. */}
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === "invitations" ? "active" : ""}`}
          onClick={() => setActiveTab("invitations")}
        >
          {t("orgConsole.tabs.invitations")}
        </button>
      </li>
    </ul>
  );
};

OrgConsoleTabs.propTypes = {
  activeTab: PropTypes.string.isRequired,
  setActiveTab: PropTypes.func.isRequired,
  isExternalOrg: PropTypes.bool.isRequired,
  orgAccessMode: PropTypes.string.isRequired,
  joinRequestCount: PropTypes.number.isRequired,
};

// address is an object of RFC 7643 §4.1.2 sub-attributes. Prefer the
// provider-formatted value; otherwise join the present sub-attributes.
// streetAddress may contain newlines — they are preserved for display.
const formatOrgAddress = (address) => {
  if (!address) {
    return "";
  }
  if (address.formatted) {
    return address.formatted;
  }
  return [
    address.streetAddress,
    address.locality,
    address.region,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
};

// One label/value row of the SSO profile display.
const OrgProfileRow = ({ row }) => {
  const { t } = useTranslation();

  return (
    <div className="row mb-1">
      <dt className="col-sm-3">{t(`orgConsole.organization.${row.key}`)}</dt>
      <dd
        className="col-sm-9 mb-1"
        style={row.multiline ? { whiteSpace: "pre-line" } : undefined}
      >
        {row.link ? (
          <a href={row.value} target="_blank" rel="noopener noreferrer">
            {row.value}
          </a>
        ) : (
          row.value
        )}
      </dd>
    </div>
  );
};

OrgProfileRow.propTypes = {
  row: PropTypes.shape({
    key: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
    link: PropTypes.bool,
    multiline: PropTypes.bool,
  }).isRequired,
};

const ACCESS_MODE_LABEL_KEYS = {
  private: "orgConsole.organization.accessModes.private",
  invite_only: "orgConsole.organization.accessModes.inviteOnly",
  request_to_join: "orgConsole.organization.accessModes.requestToJoin",
};

// SSO orgs render as a read-only profile: everything shown here is IdP-truth
// (synced via SCIM), and management happens at the provider via the deep link.
const OrgProfileDisplay = ({
  orgName,
  orgDisplayName,
  orgLogo,
  orgEmail,
  orgDescription,
  orgUrl,
  orgTelephone,
  orgLocale,
  orgTimezone,
  orgAddress,
  orgAccessMode,
  orgDefaultRole,
  orgIdpLink,
}) => {
  const { t } = useTranslation();
  const isUnlisted = orgAccessMode === "private";
  const rows = [
    { key: "email", value: orgEmail },
    { key: "url", value: orgUrl, link: true },
    { key: "telephone", value: orgTelephone },
    { key: "locale", value: orgLocale },
    { key: "timezone", value: orgTimezone },
    { key: "address", value: orgAddress, multiline: true },
    {
      key: "accessMode",
      value: t(ACCESS_MODE_LABEL_KEYS[orgAccessMode] || "unknown"),
    },
    { key: "defaultRole", value: t(`roles.${orgDefaultRole}`) },
  ].filter((row) => row.value);

  return (
    <div>
      <div className="d-flex align-items-center mb-3">
        {orgLogo ? (
          <img
            src={orgLogo}
            alt=""
            className="rounded-circle me-3"
            style={{ width: 64, height: 64, objectFit: "cover" }}
          />
        ) : (
          <div
            className="rounded-circle bg-secondary d-flex align-items-center justify-content-center me-3"
            style={{ width: 64, height: 64 }}
          >
            <FaBuilding className="text-white fs-3" />
          </div>
        )}
        <div>
          <h4 className="mb-0">{orgDisplayName || orgName}</h4>
          <small className="text-muted">/{orgName}</small>
          <div>
            <span
              className={`badge ${isUnlisted ? "bg-secondary" : "bg-success"} mt-1`}
            >
              {isUnlisted
                ? t("orgConsole.organization.unlisted")
                : t("orgConsole.organization.listed")}
            </span>
          </div>
        </div>
      </div>
      {orgDescription && <p>{orgDescription}</p>}
      {rows.length > 0 && (
        <dl className="mb-3">
          {rows.map((row) => (
            <OrgProfileRow key={row.key} row={row} />
          ))}
        </dl>
      )}
      {orgIdpLink && (
        <a
          href={orgIdpLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          <FaArrowUpRightFromSquare className="me-2" />
          {t("orgConsole.organization.manageAtIdp")}
        </a>
      )}
    </div>
  );
};

OrgProfileDisplay.propTypes = {
  orgName: PropTypes.string.isRequired,
  orgDisplayName: PropTypes.string.isRequired,
  orgLogo: PropTypes.string.isRequired,
  orgEmail: PropTypes.string.isRequired,
  orgDescription: PropTypes.string.isRequired,
  orgUrl: PropTypes.string.isRequired,
  orgTelephone: PropTypes.string.isRequired,
  orgLocale: PropTypes.string.isRequired,
  orgTimezone: PropTypes.string.isRequired,
  orgAddress: PropTypes.string.isRequired,
  orgAccessMode: PropTypes.string.isRequired,
  orgDefaultRole: PropTypes.string.isRequired,
  orgIdpLink: PropTypes.string.isRequired,
};

const OrgConsole = ({ currentOrganization }) => {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = t("orgConsole.pageTitle");
  }, [t]);

  const [users, setUsers] = useState([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [updateMessage, setUpdateMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [invitationMessage, setInvitationMessage] = useState("");
  const [activeInvitations, setActiveInvitations] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [orgEmail, setOrgEmail] = useState("");
  const [orgEmailHash, setOrgEmailHash] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [orgAccessMode, setOrgAccessMode] = useState("private");
  const [orgDefaultRole, setOrgDefaultRole] = useState("member");
  const [orgLogo, setOrgLogo] = useState("");
  const [orgUrl, setOrgUrl] = useState("");
  const [orgTelephone, setOrgTelephone] = useState("");
  const [orgLocale, setOrgLocale] = useState("");
  const [orgTimezone, setOrgTimezone] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [isExternalOrg, setIsExternalOrg] = useState(false);
  const [orgIdpLink, setOrgIdpLink] = useState("");
  const [orgDisplayName, setOrgDisplayName] = useState("");
  const [activeTab, setActiveTab] = useState("organization");
  const currentUser = AuthService.getCurrentUser();
  const canManageRoles = isOrgOwner(currentUser, currentOrganization);
  const [searchTerm, setSearchTerm] = useState("");
  // Access mode / default role as loaded, so save only calls the dedicated
  // endpoint when one of them actually changed.
  const loadedAccessRef = useRef({
    accessMode: "private",
    defaultRole: "member",
  });

  const validateOrgName = (orgName) => {
    const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
    return orgName && validCharsRegex.test(orgName);
  };

  const checkOrganizationExists = async (name) => {
    try {
      const response = await OrganizationService.getOrganizationByName(name);
      return !!response.data;
    } catch (error) {
      log.api.error("Error checking organization existence", {
        name,
        error: error.message,
      });
      return false;
    }
  };

  useEffect(() => {
    if (currentOrganization) {
      const loadData = async () => {
        // Each call settles independently so one failure cannot blank the
        // data loaded by the other three.
        const [
          orgUsersResult,
          invitationsResult,
          orgDetailsResult,
          joinRequestsResult,
        ] = await Promise.allSettled([
          OrganizationService.getOrganizationWithUsers(currentOrganization),
          InvitationService.getActiveInvitations(currentOrganization),
          OrganizationService.getOrganizationByName(currentOrganization),
          RequestService.getOrgJoinRequests(currentOrganization),
        ]);

        const failures = [
          { name: "orgUsers", result: orgUsersResult },
          { name: "invitations", result: invitationsResult },
          { name: "orgDetails", result: orgDetailsResult },
          { name: "joinRequests", result: joinRequestsResult },
        ].filter(({ result }) => result.status === "rejected");

        failures.forEach(({ name, result }) => {
          log.api.error("Error fetching org console data", {
            organization: currentOrganization,
            call: name,
            error: result.reason?.message,
          });
        });

        if (orgUsersResult.status === "fulfilled") {
          setUsers(orgUsersResult.value.data);
        }
        if (invitationsResult.status === "fulfilled") {
          setActiveInvitations(invitationsResult.value.data);
        }
        if (joinRequestsResult.status === "fulfilled") {
          setJoinRequests(joinRequestsResult.value.data || []);
        }
        if (orgDetailsResult.status === "fulfilled") {
          const orgDetails = orgDetailsResult.value.data;
          setNewOrgName(orgDetails.name);
          setIsExternalOrg(!!orgDetails.external_issuer);
          // Canonical IdP org-management deep link: the fragment scrolls the
          // provider's organizations page straight to this org's card.
          setOrgIdpLink(
            orgDetails.external_issuer && orgDetails.external_org_id
              ? `${orgDetails.external_issuer.replace(/\/+$/, "")}/user/organizations#${orgDetails.external_org_id}`
              : ""
          );
          setOrgDisplayName(orgDetails.display_name || "");
          setOrgEmail(orgDetails.email || "");
          setOrgEmailHash(orgDetails.emailHash || "");
          setOrgDescription(orgDetails.description || "");
          setOrgAccessMode(orgDetails.access_mode || "private");
          setOrgDefaultRole(orgDetails.default_role || "member");
          loadedAccessRef.current = {
            accessMode: orgDetails.access_mode || "private",
            defaultRole: orgDetails.default_role || "member",
          };
          setOrgLogo(orgDetails.logo || "");
          setOrgUrl(orgDetails.url || "");
          setOrgTelephone(orgDetails.telephone || "");
          setOrgLocale(orgDetails.locale || "");
          setOrgTimezone(orgDetails.timezone || "");
          setOrgAddress(formatOrgAddress(orgDetails.address));
        }

        const unauthorized = failures.some(
          ({ result }) => result.reason?.response?.status === 401
        );
        if (unauthorized) {
          EventBus.dispatch("logout");
        }

        setLoading(false);
      };

      loadData();
    }
  }, [currentOrganization]);

  const handleUpdateOrganization = async (e) => {
    e.preventDefault();
    // Validation
    if (!newOrgName.trim()) {
      setUpdateMessage(t("orgConsole.orgNameRequired"));
      return;
    }
    if (!validateOrgName(newOrgName)) {
      setUpdateMessage(t("orgConsole.invalidOrgName"));
      return;
    }
    if (!orgEmail.trim()) {
      setUpdateMessage(t("orgConsole.orgEmailRequired"));
      return;
    }

    if (newOrgName !== currentOrganization) {
      const organizationExists = await checkOrganizationExists(newOrgName);
      if (organizationExists) {
        setUpdateMessage(t("orgConsole.orgExists"));
        return;
      }
    }

    try {
      const response = await OrganizationService.updateOrganization(
        currentOrganization,
        {
          organization: newOrgName,
          email: orgEmail,
          description: orgDescription,
        }
      );

      if (response.status === 200) {
        // Update the user's organization in localStorage if name changed
        if (newOrgName !== currentOrganization) {
          if (currentUser) {
            const updatedUser = { ...currentUser, organization: newOrgName };
            localStorage.setItem("user", JSON.stringify(updatedUser));
          }

          // Force token refresh to update claims with new org name
          await AuthService.forceTokenRefresh();

          // Trigger an EventBus event to update App.jsx state
          EventBus.dispatch("organizationUpdated", {
            oldName: currentOrganization,
            newName: newOrgName,
          });
        }

        // Local orgs: persist access mode / default role through the
        // dedicated endpoint when either differs from what was loaded.
        // newOrgName is the org's current name even after a rename above.
        const accessChanged =
          orgAccessMode !== loadedAccessRef.current.accessMode ||
          orgDefaultRole !== loadedAccessRef.current.defaultRole;
        if (!isExternalOrg && accessChanged) {
          await OrganizationService.updateAccessMode(
            newOrgName,
            orgAccessMode,
            orgDefaultRole
          );
          loadedAccessRef.current = {
            accessMode: orgAccessMode,
            defaultRole: orgDefaultRole,
          };
        }
        setUpdateMessage(t("orgConsole.orgUpdateSuccess"));
      }
    } catch (error) {
      log.component.error("Error updating organization", {
        organization: currentOrganization,
        error: error.message,
      });
      setUpdateMessage(t("orgConsole.orgUpdateError"));
    }
  };

  const handleSetOrgRole = (userId, newRole) => {
    OrganizationService.updateUserOrgRole(currentOrganization, userId, newRole)
      .then(() => {
        setUsers((prevUsers) =>
          prevUsers.map((user) =>
            user.id === userId ? { ...user, orgRole: newRole } : user
          )
        );
        setUpdateMessage(t("messages.operationSuccessful"));
      })
      .catch((error) => {
        log.component.error("Error updating user org role", {
          userId,
          error: error.message,
        });
        setUpdateMessage(t("messages.operationFailed"));
      });
  };

  const handleRemoveUserFromOrg = (userId) => {
    setItemToDelete({ type: "user_remove", id: userId });
    setShowDeleteModal(true);
  };

  const handleSendInvitation = async (e) => {
    e.preventDefault();
    try {
      const response = await AuthService.sendInvitation(
        email,
        currentOrganization,
        inviteRole
      );
      const invitationDetails = `Invitation sent! 
        ${t("orgConsole.invitation.token")}: ${response.data.invitationToken}
        ${t("orgConsole.invitation.expires")}: ${new Date(response.data.invitationTokenExpires).toLocaleString()}
        ${t("orgConsole.invitation.orgId")}: ${response.data.organizationId}
        ${t("orgConsole.invitation.link")}: ${response.data.invitationLink}`;
      setInvitationMessage(invitationDetails);
      setEmail("");
    } catch (error) {
      log.component.error("Error sending invitation", {
        email,
        organization: currentOrganization,
        error: error.message,
      });
      // Prefer the server's own message (e.g. the identity provider's reason
      // for refusing a delegated invite) over the generic local warning.
      setInvitationMessage(
        error.response?.data?.message || t("orgConsole.invitation.sendWarning")
      );
    } finally {
      // Always refresh invitations list (even if email failed)
      try {
        const invitationsResponse =
          await InvitationService.getActiveInvitations(currentOrganization);
        setActiveInvitations(invitationsResponse.data);
      } catch (error) {
        log.component.error("Error refreshing invitations", {
          error: error.message,
        });
      }
    }
  };

  const handleDeleteClick = (invitation) => {
    setItemToDelete({ type: "invitation", id: invitation.id });
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete && itemToDelete.type === "invitation") {
      InvitationService.deleteInvitation(itemToDelete.id)
        .then(() => {
          setActiveInvitations((prevInvitations) =>
            prevInvitations.filter(
              (invitation) => invitation.id !== itemToDelete.id
            )
          );
          handleCloseDeleteModal();
        })
        .catch((error) => {
          log.component.error("Error deleting invitation", {
            invitationId: itemToDelete.id,
            error: error.message,
          });
          handleCloseDeleteModal();
        });
    }

    if (itemToDelete && itemToDelete.type === "user_remove") {
      OrganizationService.removeUserFromOrg(
        currentOrganization,
        itemToDelete.id
      )
        .then(() => {
          setUsers((prevUsers) =>
            prevUsers.filter((user) => user.id !== itemToDelete.id)
          );
          setUpdateMessage(t("orgConsole.users.removeSuccess"));
          handleCloseDeleteModal();
        })
        .catch((error) => {
          log.component.error("Error removing user from org", {
            userId: itemToDelete.id,
            organization: currentOrganization,
            error: error.message,
          });
          setUpdateMessage(t("orgConsole.users.removeError"));
          handleCloseDeleteModal();
        });
    }
  };

  const handleApproveJoinRequest = async (
    requestId,
    assignedRole = "member"
  ) => {
    try {
      await RequestService.approveJoinRequest(
        currentOrganization,
        requestId,
        assignedRole
      );
      setUpdateMessage(t("orgConsole.joinRequest.approved"));

      // Refresh join requests list
      const response =
        await RequestService.getOrgJoinRequests(currentOrganization);
      setJoinRequests(response.data || []);
    } catch (error) {
      log.component.error("Error approving join request", {
        requestId,
        error: error.message,
      });
      setUpdateMessage(
        t("orgConsole.joinRequest.approveError", { error: error.message })
      );
    }
  };

  const handleDenyJoinRequest = async (requestId) => {
    try {
      await RequestService.denyJoinRequest(currentOrganization, requestId);
      setUpdateMessage(t("orgConsole.joinRequest.denied"));

      // Refresh join requests list
      const response =
        await RequestService.getOrgJoinRequests(currentOrganization);
      setJoinRequests(response.data || []);
    } catch (error) {
      log.component.error("Error denying join request", {
        requestId,
        error: error.message,
      });
      setUpdateMessage(
        t("orgConsole.joinRequest.denyError", { error: error.message })
      );
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canManageMembership = canManageRoles && !isExternalOrg;

  return (
    <div className="list row">
      <header>
        <h3 className="text-center">{t("orgConsole.title")}</h3>
      </header>

      <OrgConsoleTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isExternalOrg={isExternalOrg}
        orgAccessMode={orgAccessMode}
        joinRequestCount={joinRequests.length}
      />

      {loading ? (
        <p>{t("loading")}</p>
      ) : (
        <div className="tab-content mt-3">
          {activeTab === "organization" && (
            <div className="row">
              <div className="col-md-12 mb-4">
                <div className="card mt-2 mb-2">
                  <div className="card-header">
                    <h4>
                      {t("orgConsole.organization.title")}
                      {isExternalOrg && (
                        <span
                          className="badge bg-info ms-2"
                          title={t("orgUserManager.ssoManagedHint")}
                        >
                          {t("orgUserManager.ssoManaged")}
                        </span>
                      )}
                    </h4>
                  </div>
                  <div className="card-body">
                    {isExternalOrg && (
                      <>
                        <div className="alert alert-info">
                          {t("orgUserManager.ssoManagedHint")}
                        </div>
                        <OrgProfileDisplay
                          orgName={newOrgName}
                          orgDisplayName={orgDisplayName}
                          orgLogo={orgLogo}
                          orgEmail={orgEmail}
                          orgDescription={orgDescription}
                          orgUrl={orgUrl}
                          orgTelephone={orgTelephone}
                          orgLocale={orgLocale}
                          orgTimezone={orgTimezone}
                          orgAddress={orgAddress}
                          orgAccessMode={orgAccessMode}
                          orgDefaultRole={orgDefaultRole}
                          orgIdpLink={orgIdpLink}
                        />
                      </>
                    )}
                    {!isExternalOrg && (
                      <form onSubmit={handleUpdateOrganization}>
                        <div className="form-group">
                          <label htmlFor="orgName">
                            {t("orgConsole.organization.name")}
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            id="orgName"
                            value={newOrgName}
                            onChange={(e) => setNewOrgName(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="orgEmail">
                            {t("orgConsole.organization.email")}
                          </label>
                          <input
                            type="email"
                            className="form-control"
                            id="orgEmail"
                            value={orgEmail}
                            onChange={(e) => setOrgEmail(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="orgEmailHash">
                            {t("orgConsole.organization.emailHash")}
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            id="orgEmailHash"
                            value={orgEmailHash}
                            readOnly
                          />
                          <small className="form-text text-muted">
                            {t("orgConsole.organization.emailHashHint")}
                          </small>
                        </div>
                        <div className="form-group">
                          <label htmlFor="orgDescription">
                            {t("orgConsole.organization.description")}
                          </label>
                          <textarea
                            className="form-control"
                            id="orgDescription"
                            value={orgDescription}
                            onChange={(e) => setOrgDescription(e.target.value)}
                          />
                        </div>

                        <div className="row">
                          <div className="col-md-6">
                            <div className="form-group">
                              <label htmlFor="orgAccessMode">
                                {t("orgConsole.organization.accessMode")}
                              </label>
                              <select
                                className="form-control"
                                id="orgAccessMode"
                                value={orgAccessMode}
                                onChange={(e) =>
                                  setOrgAccessMode(e.target.value)
                                }
                              >
                                <option value="private">
                                  {t(
                                    "orgConsole.organization.accessModes.private"
                                  )}
                                </option>
                                <option value="invite_only">
                                  {t(
                                    "orgConsole.organization.accessModes.inviteOnly"
                                  )}
                                </option>
                                <option value="request_to_join">
                                  {t(
                                    "orgConsole.organization.accessModes.requestToJoin"
                                  )}
                                </option>
                              </select>
                              <small className="form-text text-muted">
                                {t("orgConsole.organization.accessModeHint")}
                              </small>
                            </div>
                          </div>
                          <div className="col-md-6">
                            <div className="form-group">
                              <label htmlFor="orgDefaultRole">
                                {t("orgConsole.organization.defaultRole")}
                              </label>
                              <select
                                className="form-control"
                                id="orgDefaultRole"
                                value={orgDefaultRole}
                                onChange={(e) =>
                                  setOrgDefaultRole(e.target.value)
                                }
                              >
                                <option value="member">
                                  {t("roles.member")}
                                </option>
                                <option value="admin">
                                  {t("roles.admin")}
                                </option>
                              </select>
                              <small className="form-text text-muted">
                                {t("orgConsole.organization.defaultRoleHint")}
                              </small>
                            </div>
                          </div>
                        </div>

                        <button type="submit" className="btn btn-primary mt-2">
                          {t("orgConsole.organization.updateButton")}
                        </button>
                      </form>
                    )}
                    {updateMessage && (
                      <div className="alert alert-info mt-3">
                        {updateMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-md-12 mb-4">
                <div className="card mt-2 mb-2">
                  <div className="card-header">
                    <h4>
                      {t("orgConsole.users.title", {
                        organization: currentOrganization,
                      })}
                    </h4>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <input
                        type="text"
                        className="form-control"
                        placeholder={t("common:actions.search")}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="row">
                      {filteredUsers.map((user) => (
                        <UserCard
                          key={user.id}
                          user={user}
                          currentUser={currentUser}
                          orgRole={user.orgRole}
                          onChangeRole={
                            canManageMembership
                              ? (newRole) => handleSetOrgRole(user.id, newRole)
                              : undefined
                          }
                          onRemoveFromOrg={
                            canManageMembership
                              ? () => handleRemoveUserFromOrg(user.id)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "joinRequests" && (
            <div className="card">
              <div className="card-header">
                <h4>{t("orgConsole.joinRequest.title")}</h4>
              </div>
              <div className="card-body">
                {joinRequests.length === 0 ? (
                  <div className="alert alert-info">
                    {t("orgConsole.joinRequest.noRequests")}
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>{t("orgConsole.joinRequest.email")}</th>
                          <th>{t("orgConsole.joinRequest.message")}</th>
                          <th>{t("orgConsole.joinRequest.requested")}</th>
                          <th>{t("orgConsole.joinRequest.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {joinRequests.map((request) => (
                          <tr key={request.id}>
                            <td>
                              <strong>{request.user.username}</strong>
                            </td>
                            <td>{request.user.email}</td>
                            <td>
                              {request.message ||
                                t("orgConsole.joinRequest.noMessage")}
                            </td>
                            <td>
                              {new Date(
                                request.created_at
                              ).toLocaleDateString()}
                            </td>
                            <td>
                              <div className="btn-group" role="group">
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() =>
                                    handleApproveJoinRequest(
                                      request.id,
                                      "member"
                                    )
                                  }
                                >
                                  {t("orgConsole.joinRequest.approveAsMember")}
                                </button>
                                <button
                                  className="btn btn-warning btn-sm"
                                  onClick={() =>
                                    handleApproveJoinRequest(
                                      request.id,
                                      "admin"
                                    )
                                  }
                                >
                                  {t("orgConsole.joinRequest.approveAsAdmin")}
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() =>
                                    handleDenyJoinRequest(request.id)
                                  }
                                >
                                  {t("orgConsole.joinRequest.deny")}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "invitations" && (
            <div className="card">
              <div className="card-header">
                <div className="d-flex justify-content-between align-items-center">
                  <h4>{t("orgConsole.invitation.manageTitle")}</h4>
                </div>
              </div>
              <div className="card-body">
                <div className="mb-4">
                  <h5>{t("orgConsole.invitation.sendTitle")}</h5>
                  <form onSubmit={handleSendInvitation}>
                    <div className="row">
                      <div className="col-md-8">
                        <div className="form-group">
                          <label htmlFor="email">
                            {t("orgConsole.invitation.email")}
                          </label>
                          <input
                            type="email"
                            className="form-control"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="form-group">
                          <label htmlFor="inviteRole">
                            {t("orgConsole.invitation.assignRole")}
                          </label>
                          <select
                            className="form-control"
                            id="inviteRole"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                          >
                            <option value="member">{t("roles.member")}</option>
                            {canManageRoles && (
                              <option value="admin">{t("roles.admin")}</option>
                            )}
                          </select>
                        </div>
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary mt-2">
                      {t("orgConsole.invitation.sendButton")}
                    </button>
                  </form>
                  {invitationMessage && (
                    <div className="alert alert-info mt-3">
                      <pre>{invitationMessage}</pre>
                    </div>
                  )}
                </div>

                <h5>{t("orgConsole.invitation.activeTitle")}</h5>
                {activeInvitations.length === 0 ? (
                  <div className="alert alert-info">
                    {t("orgConsole.invitation.noActive")}
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t("orgConsole.invitation.email")}</th>
                          <th>{t("orgConsole.invitation.expires")}</th>
                          <th>{t("orgConsole.invitation.accepted")}</th>
                          <th>{t("orgConsole.invitation.expired")}</th>
                          <th>{t("orgConsole.invitation.link")}</th>
                          <th>{t("orgConsole.invitation.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeInvitations.map((invitation) => (
                          <tr key={invitation.id}>
                            <td>{invitation.email}</td>
                            <td>
                              {new Date(invitation.expires).toLocaleString()}
                            </td>
                            <td>
                              {invitation.accepted ? t("yes") : t("no")}
                              {invitation.accepted &&
                                invitation.accepted_at && (
                                  <small className="text-muted d-block">
                                    {new Date(
                                      invitation.accepted_at
                                    ).toLocaleString()}
                                  </small>
                                )}
                            </td>
                            <td>{invitation.expired ? t("yes") : t("no")}</td>
                            <td>
                              <a
                                href={`${window.location.origin}/invite/${encodeURIComponent(invitation.token)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {t("orgConsole.invitation.linkText")}
                              </a>
                            </td>
                            <td>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteClick(invitation)}
                              >
                                {t("buttons.delete")}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmationModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={handleConfirmDelete}
        title={
          itemToDelete?.type === "user_remove"
            ? t("buttons.removeFromOrg")
            : undefined
        }
        message={
          itemToDelete?.type === "user_remove"
            ? t("confirmation.message", { keyword: t("deleteKeyword") })
            : undefined
        }
      />
    </div>
  );
};

OrgConsole.propTypes = {
  currentOrganization: PropTypes.string.isRequired,
};

export default OrgConsole;
