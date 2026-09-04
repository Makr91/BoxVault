import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FaArrowUpRightFromSquare, FaBuilding } from 'react-icons/fa6';

import { log, useNavbarSearchBinding, useNotify } from '../chrome';
import { ACTIVE_ORG_KEY, session } from '../chromeProps';
import { ConfirmModal, responseMessage } from '../pages';
import { api } from '../services/api';
import { isOrgOwner } from '../utils/permissions';

import UserCard from './UserCard.component';

const NO_FILTERS = [];
const clearNothing = () => undefined;

const MembersSearch = ({ query, onQueryChange, matched, total }) => {
  const { t } = useTranslation();
  useNavbarSearchBinding({
    query,
    onQueryChange,
    placeholder: t('common:actions.search'),
    matched,
    total,
    groups: NO_FILTERS,
    onClearFilters: clearNothing,
  });
  return null;
};

MembersSearch.propTypes = {
  query: PropTypes.string.isRequired,
  onQueryChange: PropTypes.func.isRequired,
  matched: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
};

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
  const showJoinRequests = !isExternalOrg || orgAccessMode === 'request_to_join';

  return (
    <ul className="nav nav-tabs">
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'organization' ? 'active' : ''}`}
          onClick={() => setActiveTab('organization')}
        >
          {t('orgConsole.tabs.organization')}
        </button>
      </li>
      {showJoinRequests && (
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'joinRequests' ? 'active' : ''}`}
            onClick={() => setActiveTab('joinRequests')}
          >
            {t('orgConsole.tabs.joinRequests')}
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
          className={`nav-link ${activeTab === 'invitations' ? 'active' : ''}`}
          onClick={() => setActiveTab('invitations')}
        >
          {t('orgConsole.tabs.invitations')}
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
const formatOrgAddress = address => {
  if (!address) {
    return '';
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
    .join(', ');
};

// Normalized console state from a fetched org-details payload — all the
// defaulting lives here so the loader stays simple.
const extractOrgDetailsState = orgDetails => ({
  name: orgDetails.name,
  isExternalOrg: !!orgDetails.external_issuer,
  // Canonical IdP org-management deep link: the fragment scrolls the
  // provider's organizations page straight to this org's card.
  idpLink:
    orgDetails.external_issuer && orgDetails.external_org_id
      ? `${orgDetails.external_issuer.replace(/\/+$/, '')}/user/organizations#${orgDetails.external_org_id}`
      : '',
  displayName: orgDetails.display_name || '',
  email: orgDetails.email || '',
  emailHash: orgDetails.emailHash || '',
  description: orgDetails.description || '',
  accessMode: orgDetails.access_mode || 'private',
  defaultRole: orgDetails.default_role || 'member',
  logo: orgDetails.logo || '',
  url: orgDetails.url || '',
  telephone: orgDetails.telephone || '',
  locale: orgDetails.locale || '',
  timezone: orgDetails.timezone || '',
  address: formatOrgAddress(orgDetails.address),
});

// One label/value row of the SSO profile display.
const OrgProfileRow = ({ row }) => {
  const { t } = useTranslation();

  return (
    <div className="row mb-1">
      <dt className="col-sm-3">{t(`orgConsole.organization.${row.key}`)}</dt>
      <dd className="col-sm-9 mb-1" style={row.multiline ? { whiteSpace: 'pre-line' } : undefined}>
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
  private: 'orgConsole.organization.accessModes.private',
  invite_only: 'orgConsole.organization.accessModes.inviteOnly',
  request_to_join: 'orgConsole.organization.accessModes.requestToJoin',
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
  const isUnlisted = orgAccessMode === 'private';
  const rows = [
    { key: 'email', value: orgEmail },
    { key: 'url', value: orgUrl, link: true },
    { key: 'telephone', value: orgTelephone },
    { key: 'locale', value: orgLocale },
    { key: 'timezone', value: orgTimezone },
    { key: 'address', value: orgAddress, multiline: true },
    {
      key: 'accessMode',
      value: t(ACCESS_MODE_LABEL_KEYS[orgAccessMode] || 'unknown'),
    },
    { key: 'defaultRole', value: t(`roles.${orgDefaultRole}`) },
  ].filter(row => row.value);

  return (
    <div>
      <div className="d-flex align-items-center mb-3">
        {orgLogo ? (
          <img
            src={orgLogo}
            alt=""
            className="rounded-circle me-3"
            style={{ width: 64, height: 64, objectFit: 'cover' }}
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
            <span className={`badge ${isUnlisted ? 'bg-secondary' : 'bg-success'} mt-1`}>
              {isUnlisted
                ? t('orgConsole.organization.unlisted')
                : t('orgConsole.organization.listed')}
            </span>
          </div>
        </div>
      </div>
      {orgDescription && <p>{orgDescription}</p>}
      {rows.length > 0 && (
        <dl className="mb-3">
          {rows.map(row => (
            <OrgProfileRow key={row.key} row={row} />
          ))}
        </dl>
      )}
      {orgIdpLink && (
        <a href={orgIdpLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
          <FaArrowUpRightFromSquare className="me-2" />
          {t('orgConsole.organization.manageAtIdp')}
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

// The accept URL IS the invitation credential, so the identity provider never
// returns it for the orgs it manages — a console that displayed it would turn a
// single-recipient email into a shared one. Those rows link to the provider
// instead, and fall back to plain text when the org carries no provider link.
const InvitationLinkCell = ({ invitation, orgIdpLink }) => {
  const { t } = useTranslation();

  if (invitation.token) {
    return (
      <a
        href={`${window.location.origin}/invite/${encodeURIComponent(invitation.token)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('orgConsole.invitation.linkText')}
      </a>
    );
  }

  if (orgIdpLink) {
    return (
      <a href={orgIdpLink} target="_blank" rel="noopener noreferrer">
        {t('orgConsole.organization.manageAtIdp')}
      </a>
    );
  }

  return <small className="text-body-secondary">{t('orgConsole.invitation.managedByIdp')}</small>;
};

InvitationLinkCell.propTypes = {
  invitation: PropTypes.shape({
    token: PropTypes.string,
  }).isRequired,
  orgIdpLink: PropTypes.string,
};

const JoinRequestsTab = ({ joinRequests, onApprove, onDeny }) => {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="card-header">
        <h4>{t('orgConsole.joinRequest.title')}</h4>
      </div>
      <div className="card-body">
        {joinRequests.length === 0 ? (
          <div className="alert alert-info">{t('orgConsole.joinRequest.noRequests')}</div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('orgConsole.joinRequest.user')}</th>
                  <th>{t('orgConsole.joinRequest.email')}</th>
                  <th>{t('orgConsole.joinRequest.message')}</th>
                  <th>{t('orgConsole.joinRequest.requested')}</th>
                  <th>{t('orgConsole.joinRequest.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {joinRequests.map(request => (
                  <tr key={request.id}>
                    <td>
                      <strong>{request.user.username}</strong>
                    </td>
                    <td>{request.user.email}</td>
                    <td>{request.message || t('orgConsole.joinRequest.noMessage')}</td>
                    <td>{new Date(request.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="btn-group" role="group">
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => onApprove(request.id, 'member')}
                        >
                          {t('orgConsole.joinRequest.approveAsMember')}
                        </button>
                        <button
                          className="btn btn-warning btn-sm"
                          onClick={() => onApprove(request.id, 'admin')}
                        >
                          {t('orgConsole.joinRequest.approveAsAdmin')}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => onDeny(request.id)}
                        >
                          {t('orgConsole.joinRequest.deny')}
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
  );
};

JoinRequestsTab.propTypes = {
  joinRequests: PropTypes.array.isRequired,
  onApprove: PropTypes.func.isRequired,
  onDeny: PropTypes.func.isRequired,
};

const InvitationsTable = ({ invitations, orgIdpLink, onDelete }) => {
  const { t } = useTranslation();

  if (invitations.length === 0) {
    return <div className="alert alert-info">{t('orgConsole.invitation.noActive')}</div>;
  }

  return (
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>{t('orgConsole.invitation.email')}</th>
            <th>{t('orgConsole.invitation.expires')}</th>
            <th>{t('orgConsole.invitation.accepted')}</th>
            <th>{t('orgConsole.invitation.expired')}</th>
            <th>{t('orgConsole.invitation.link')}</th>
            <th>{t('orgConsole.invitation.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map(invitation => (
            <tr key={invitation.id}>
              <td>{invitation.email}</td>
              <td>{new Date(invitation.expires).toLocaleString()}</td>
              <td>
                {invitation.accepted ? t('yes') : t('no')}
                {invitation.accepted_at && (
                  <small className="text-body-secondary d-block">
                    {new Date(invitation.accepted_at).toLocaleString()}
                  </small>
                )}
              </td>
              <td>{invitation.expired ? t('yes') : t('no')}</td>
              <td>
                <InvitationLinkCell invitation={invitation} orgIdpLink={orgIdpLink} />
              </td>
              <td>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(invitation)}>
                  {t('buttons.delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

InvitationsTable.propTypes = {
  invitations: PropTypes.array.isRequired,
  orgIdpLink: PropTypes.string,
  onDelete: PropTypes.func.isRequired,
};

const OrgConsole = ({ currentOrganization }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  useEffect(() => {
    document.title = t('orgConsole.pageTitle');
  }, [t]);

  const [users, setUsers] = useState([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [loadedOrganization, setLoadedOrganization] = useState(null);
  const [email, setEmail] = useState('');
  const [activeInvitations, setActiveInvitations] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [orgEmail, setOrgEmail] = useState('');
  const [orgEmailHash, setOrgEmailHash] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [orgAccessMode, setOrgAccessMode] = useState('private');
  const [orgDefaultRole, setOrgDefaultRole] = useState('member');
  const [orgLogo, setOrgLogo] = useState('');
  const [orgUrl, setOrgUrl] = useState('');
  const [orgTelephone, setOrgTelephone] = useState('');
  const [orgLocale, setOrgLocale] = useState('');
  const [orgTimezone, setOrgTimezone] = useState('');
  const [orgAddress, setOrgAddress] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [isExternalOrg, setIsExternalOrg] = useState(false);
  const [orgIdpLink, setOrgIdpLink] = useState('');
  const [orgDisplayName, setOrgDisplayName] = useState('');
  const [activeTab, setActiveTab] = useState('organization');
  const currentUser = session.current();
  const canManageRoles = isOrgOwner(currentUser, currentOrganization);
  const [searchTerm, setSearchTerm] = useState('');
  // Access mode / default role as loaded, so save only calls the dedicated
  // endpoint when one of them actually changed.
  const loadedAccessRef = useRef({
    accessMode: 'private',
    defaultRole: 'member',
  });

  const validateOrgName = orgName => {
    const validCharsRegex = /^[0-9a-zA-Z-._]+$/;
    return orgName && validCharsRegex.test(orgName);
  };

  const checkOrganizationExists = async name => {
    try {
      return Boolean(await api.organizations.get(name));
    } catch (error) {
      log.api.error('Error checking organization existence', {
        name,
        error: error.message,
      });
      return false;
    }
  };

  // Derived rather than state: an effect that flips a loading flag has to write
  // state synchronously on mount, and switching organizations has to flip it
  // back. Comparing the loaded organization to the requested one expresses the
  // same thing without either write.
  const loading = Boolean(currentOrganization) && loadedOrganization !== currentOrganization;

  useEffect(() => {
    if (!currentOrganization) {
      return;
    }

    const loadData = async () => {
      // Each call settles independently so one failure cannot blank the
      // data loaded by the other three.
      const [orgUsersResult, invitationsResult, orgDetailsResult, joinRequestsResult] =
        await Promise.allSettled([
          api.organizations.users(currentOrganization),
          api.invitations.active(currentOrganization),
          api.organizations.get(currentOrganization),
          api.requests.forOrg(currentOrganization),
        ]);

      const failures = [
        { name: 'orgUsers', result: orgUsersResult },
        { name: 'invitations', result: invitationsResult },
        { name: 'orgDetails', result: orgDetailsResult },
        { name: 'joinRequests', result: joinRequestsResult },
      ].filter(({ result }) => result.status === 'rejected');

      failures.forEach(({ name, result }) => {
        log.api.error('Error fetching org console data', {
          organization: currentOrganization,
          call: name,
          error: result.reason?.message,
        });
      });

      if (orgUsersResult.status === 'fulfilled') {
        setUsers(orgUsersResult.value);
      }
      if (invitationsResult.status === 'fulfilled') {
        setActiveInvitations(invitationsResult.value);
      }
      if (joinRequestsResult.status === 'fulfilled') {
        setJoinRequests(joinRequestsResult.value || []);
      }
      if (orgDetailsResult.status === 'fulfilled') {
        const details = extractOrgDetailsState(orgDetailsResult.value);
        setNewOrgName(details.name);
        setIsExternalOrg(details.isExternalOrg);
        setOrgIdpLink(details.idpLink);
        setOrgDisplayName(details.displayName);
        setOrgEmail(details.email);
        setOrgEmailHash(details.emailHash);
        setOrgDescription(details.description);
        setOrgAccessMode(details.accessMode);
        setOrgDefaultRole(details.defaultRole);
        loadedAccessRef.current = {
          accessMode: details.accessMode,
          defaultRole: details.defaultRole,
        };
        setOrgLogo(details.logo);
        setOrgUrl(details.url);
        setOrgTelephone(details.telephone);
        setOrgLocale(details.locale);
        setOrgTimezone(details.timezone);
        setOrgAddress(details.address);
      }

      setLoadedOrganization(currentOrganization);
    };

    loadData();
  }, [currentOrganization]);

  const handleUpdateOrganization = async e => {
    e.preventDefault();
    // Validation
    if (!newOrgName.trim()) {
      notify('danger', t('orgConsole.orgNameRequired'));
      return;
    }
    if (!validateOrgName(newOrgName)) {
      notify('danger', t('orgConsole.invalidOrgName'));
      return;
    }
    if (!orgEmail.trim()) {
      notify('danger', t('orgConsole.orgEmailRequired'));
      return;
    }

    if (newOrgName !== currentOrganization) {
      const organizationExists = await checkOrganizationExists(newOrgName);
      if (organizationExists) {
        notify('danger', t('orgConsole.orgExists'));
        return;
      }
    }

    try {
      await api.organizations.update(currentOrganization, {
        organization: newOrgName,
        email: orgEmail,
        description: orgDescription,
      });

      if (newOrgName !== currentOrganization) {
        localStorage.setItem(ACTIVE_ORG_KEY, newOrgName);
        await session.refresh();
      }

      // Local orgs: persist access mode / default role through the
      // dedicated endpoint when either differs from what was loaded.
      // newOrgName is the org's current name even after a rename above.
      const accessChanged =
        orgAccessMode !== loadedAccessRef.current.accessMode ||
        orgDefaultRole !== loadedAccessRef.current.defaultRole;
      if (!isExternalOrg && accessChanged) {
        await api.organizations.accessMode(newOrgName, orgAccessMode, orgDefaultRole);
        loadedAccessRef.current = {
          accessMode: orgAccessMode,
          defaultRole: orgDefaultRole,
        };
      }
      notify('success', t('orgConsole.orgUpdateSuccess'));
    } catch (error) {
      log.component.error('Error updating organization', {
        organization: currentOrganization,
        error: error.message,
      });
      notify('danger', t('orgConsole.orgUpdateError'));
    }
  };

  const handleSetOrgRole = (userId, newRole) => {
    api.organizations
      .memberRole(currentOrganization, userId, newRole)
      .then(() => {
        setUsers(prevUsers =>
          prevUsers.map(user => (user.id === userId ? { ...user, orgRole: newRole } : user))
        );
        notify('success', t('messages.operationSuccessful'));
      })
      .catch(error => {
        log.component.error('Error updating user org role', {
          userId,
          error: error.message,
        });
        notify('danger', t('messages.operationFailed'));
      });
  };

  const handleRemoveUserFromOrg = userId => {
    setItemToDelete({ type: 'user_remove', id: userId });
    setShowDeleteModal(true);
  };

  const handleSendInvitation = async e => {
    e.preventDefault();
    try {
      const sent = await api.auth.invite({
        email,
        organizationName: currentOrganization,
        inviteRole,
      });
      const invitationDetails = `${t('orgConsole.invitation.sent')}
        ${t('orgConsole.invitation.token')}: ${sent.invitationToken}
        ${t('orgConsole.invitation.expires')}: ${new Date(sent.invitationTokenExpires).toLocaleString()}
        ${t('orgConsole.invitation.orgId')}: ${sent.organizationId}
        ${t('orgConsole.invitation.link')}: ${sent.invitationLink}`;
      notify('success', <pre className="mb-0 small">{invitationDetails}</pre>, { sticky: true });
      setEmail('');
    } catch (error) {
      log.component.error('Error sending invitation', {
        email,
        organization: currentOrganization,
        error: error.message,
      });
      // Prefer the server's own message (e.g. the identity provider's reason
      // for refusing a delegated invite) over the generic local warning.
      notify('danger', responseMessage(error, t('orgConsole.invitation.sendWarning')));
    } finally {
      // Always refresh invitations list (even if email failed)
      try {
        setActiveInvitations(await api.invitations.active(currentOrganization));
      } catch (error) {
        log.component.error('Error refreshing invitations', {
          error: error.message,
        });
      }
    }
  };

  const handleDeleteClick = invitation => {
    setItemToDelete({ type: 'invitation', id: invitation.id });
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete && itemToDelete.type === 'invitation') {
      api.invitations
        .remove(itemToDelete.id)
        .then(() => {
          setActiveInvitations(prevInvitations =>
            prevInvitations.filter(invitation => invitation.id !== itemToDelete.id)
          );
          handleCloseDeleteModal();
        })
        .catch(error => {
          log.component.error('Error deleting invitation', {
            invitationId: itemToDelete.id,
            error: error.message,
          });
          notify('danger', t('messages.deleteFailed'));
          handleCloseDeleteModal();
        });
    }

    if (itemToDelete && itemToDelete.type === 'user_remove') {
      api.organizations
        .removeMember(currentOrganization, itemToDelete.id)
        .then(() => {
          setUsers(prevUsers => prevUsers.filter(user => user.id !== itemToDelete.id));
          notify('success', t('orgConsole.users.removeSuccess'));
          handleCloseDeleteModal();
        })
        .catch(error => {
          log.component.error('Error removing user from org', {
            userId: itemToDelete.id,
            organization: currentOrganization,
            error: error.message,
          });
          notify('danger', t('orgConsole.users.removeError'));
          handleCloseDeleteModal();
        });
    }
  };

  const handleApproveJoinRequest = async (requestId, assignedRole = 'member') => {
    try {
      await api.requests.approve(currentOrganization, requestId, assignedRole);
      notify('success', t('orgConsole.joinRequest.approved'));

      // Refresh join requests list
      setJoinRequests((await api.requests.forOrg(currentOrganization)) || []);
    } catch (error) {
      log.component.error('Error approving join request', {
        requestId,
        error: error.message,
      });
      notify('danger', t('orgConsole.joinRequest.approveError', { error: error.message }));
    }
  };

  const handleDenyJoinRequest = async requestId => {
    try {
      await api.requests.deny(currentOrganization, requestId);
      notify('success', t('orgConsole.joinRequest.denied'));

      // Refresh join requests list
      setJoinRequests((await api.requests.forOrg(currentOrganization)) || []);
    } catch (error) {
      log.component.error('Error denying join request', {
        requestId,
        error: error.message,
      });
      notify('danger', t('orgConsole.joinRequest.denyError', { error: error.message }));
    }
  };

  const filteredUsers = users.filter(user => {
    const term = searchTerm.toLowerCase();
    return [user.name, user.username, user.email].some(
      field => typeof field === 'string' && field.toLowerCase().includes(term)
    );
  });

  const canManageMembership = canManageRoles && !isExternalOrg;

  return (
    <div className="list row">
      <header>
        <h3 className="text-center">{t('orgConsole.title')}</h3>
      </header>

      <OrgConsoleTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isExternalOrg={isExternalOrg}
        orgAccessMode={orgAccessMode}
        joinRequestCount={joinRequests.length}
      />

      {!loading && !currentOrganization && (
        <div className="alert alert-warning mt-3" role="alert">
          {t('orgConsole.noActiveOrganization')}
        </div>
      )}

      {loading ? (
        <p>{t('loading')}</p>
      ) : (
        <div className="tab-content mt-3">
          {activeTab === 'organization' && (
            <div className="row">
              <div className="col-md-12 mb-4">
                <div className="card mt-2 mb-2">
                  <div className="card-header">
                    <h4>
                      {t('orgConsole.organization.title')}
                      {isExternalOrg && (
                        <span
                          className="badge bg-info ms-2"
                          title={t('orgUserManager.ssoManagedHint')}
                        >
                          {t('orgUserManager.ssoManaged')}
                        </span>
                      )}
                    </h4>
                  </div>
                  <div className="card-body">
                    {isExternalOrg && (
                      <>
                        <div className="alert alert-info" role="status">
                          {t('orgUserManager.ssoManagedHint')}
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
                          <label htmlFor="orgName">{t('orgConsole.organization.name')}</label>
                          <input
                            type="text"
                            className="form-control"
                            id="orgName"
                            value={newOrgName}
                            onChange={e => setNewOrgName(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="orgEmail">{t('orgConsole.organization.email')}</label>
                          <input
                            type="email"
                            className="form-control"
                            id="orgEmail"
                            value={orgEmail}
                            onChange={e => setOrgEmail(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="orgEmailHash">
                            {t('orgConsole.organization.emailHash')}
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            id="orgEmailHash"
                            value={orgEmailHash}
                            readOnly
                          />
                          <small className="form-text text-muted">
                            {t('orgConsole.organization.emailHashHint')}
                          </small>
                        </div>
                        <div className="form-group">
                          <label htmlFor="orgDescription">
                            {t('orgConsole.organization.description')}
                          </label>
                          <textarea
                            className="form-control"
                            id="orgDescription"
                            value={orgDescription}
                            onChange={e => setOrgDescription(e.target.value)}
                          />
                        </div>

                        <div className="row">
                          <div className="col-md-6">
                            <div className="form-group">
                              <label htmlFor="orgAccessMode">
                                {t('orgConsole.organization.accessMode')}
                              </label>
                              <select
                                className="form-control"
                                id="orgAccessMode"
                                value={orgAccessMode}
                                onChange={e => setOrgAccessMode(e.target.value)}
                              >
                                <option value="private">
                                  {t('orgConsole.organization.accessModes.private')}
                                </option>
                                <option value="invite_only">
                                  {t('orgConsole.organization.accessModes.inviteOnly')}
                                </option>
                                <option value="request_to_join">
                                  {t('orgConsole.organization.accessModes.requestToJoin')}
                                </option>
                              </select>
                              <small className="form-text text-muted">
                                {t('orgConsole.organization.accessModeHint')}
                              </small>
                            </div>
                          </div>
                          <div className="col-md-6">
                            <div className="form-group">
                              <label htmlFor="orgDefaultRole">
                                {t('orgConsole.organization.defaultRole')}
                              </label>
                              <select
                                className="form-control"
                                id="orgDefaultRole"
                                value={orgDefaultRole}
                                onChange={e => setOrgDefaultRole(e.target.value)}
                              >
                                <option value="member">{t('roles.member')}</option>
                                <option value="admin">{t('roles.admin')}</option>
                              </select>
                              <small className="form-text text-muted">
                                {t('orgConsole.organization.defaultRoleHint')}
                              </small>
                            </div>
                          </div>
                        </div>

                        <button type="submit" className="btn btn-primary mt-2">
                          {t('orgConsole.organization.updateButton')}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-md-12 mb-4">
                <div className="card mt-2 mb-2">
                  <div className="card-header">
                    <h4>
                      {t('orgConsole.users.title', {
                        organization: currentOrganization,
                      })}
                    </h4>
                  </div>
                  <div className="card-body">
                    <MembersSearch
                      query={searchTerm}
                      onQueryChange={setSearchTerm}
                      matched={filteredUsers.length}
                      total={users.length}
                    />
                    <div className="row">
                      {filteredUsers.map(user => (
                        <UserCard
                          key={user.id}
                          user={user}
                          currentUser={currentUser}
                          orgRole={user.orgRole}
                          onChangeRole={
                            canManageMembership
                              ? newRole => handleSetOrgRole(user.id, newRole)
                              : undefined
                          }
                          onRemoveFromOrg={
                            canManageMembership ? () => handleRemoveUserFromOrg(user.id) : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'joinRequests' && (
            <JoinRequestsTab
              joinRequests={joinRequests}
              onApprove={handleApproveJoinRequest}
              onDeny={handleDenyJoinRequest}
            />
          )}

          {activeTab === 'invitations' && (
            <div className="card">
              <div className="card-header">
                <div className="d-flex justify-content-between align-items-center">
                  <h4>{t('orgConsole.invitation.manageTitle')}</h4>
                </div>
              </div>
              <div className="card-body">
                <div className="mb-4">
                  <h5>{t('orgConsole.invitation.sendTitle')}</h5>
                  <form onSubmit={handleSendInvitation}>
                    <div className="row">
                      <div className="col-md-8">
                        <div className="form-group">
                          <label htmlFor="email">{t('orgConsole.invitation.email')}</label>
                          <input
                            type="email"
                            className="form-control"
                            id="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="form-group">
                          <label htmlFor="inviteRole">
                            {t('orgConsole.invitation.assignRole')}
                          </label>
                          <select
                            className="form-control"
                            id="inviteRole"
                            value={inviteRole}
                            onChange={e => setInviteRole(e.target.value)}
                          >
                            <option value="member">{t('roles.member')}</option>
                            {canManageRoles && <option value="admin">{t('roles.admin')}</option>}
                          </select>
                        </div>
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary mt-2">
                      {t('orgConsole.invitation.sendButton')}
                    </button>
                  </form>
                </div>

                <h5>{t('orgConsole.invitation.activeTitle')}</h5>
                <InvitationsTable
                  invitations={activeInvitations}
                  orgIdpLink={orgIdpLink}
                  onDelete={handleDeleteClick}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={handleConfirmDelete}
        title={itemToDelete?.type === 'user_remove' ? t('buttons.removeFromOrg') : undefined}
        message={
          itemToDelete?.type === 'user_remove'
            ? t('pages.confirm.message', { keyword: t('pages.confirm.keyword') })
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
