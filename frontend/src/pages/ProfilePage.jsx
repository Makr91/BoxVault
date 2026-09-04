import PropTypes from 'prop-types';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { Avatar, log, useNotify } from '../chrome';

import { returnToShape } from './auth';
import ConfirmModal from './ConfirmModal';
import { responseMessage } from './itemShape';

/**
 * The app's side of the shared profile page: the calls behind the display
 * name, password, email, verification, memberships, join requests and
 * service accounts of the signed-in account.
 */
export const accountShape = PropTypes.shape({
  gravatarProfile: PropTypes.func.isRequired,
  changePassword: PropTypes.func.isRequired,
  changeEmail: PropTypes.func.isRequired,
  changeName: PropTypes.func.isRequired,
  remove: PropTypes.func.isRequired,
  verifyMail: PropTypes.func.isRequired,
  resendVerification: PropTypes.func.isRequired,
  organizations: PropTypes.func.isRequired,
  leave: PropTypes.func.isRequired,
  setPrimary: PropTypes.func.isRequired,
  requests: PropTypes.func.isRequired,
  cancelRequest: PropTypes.func.isRequired,
  serviceAccounts: PropTypes.shape({
    list: PropTypes.func.isRequired,
    organizations: PropTypes.func.isRequired,
    create: PropTypes.func.isRequired,
    remove: PropTypes.func.isRequired,
  }).isRequired,
});

const isAbort = error => error?.name?.includes('Cancel') || error?.name?.includes('Abort');

const ROLE_CLASSES = { owner: 'bg-danger', admin: 'bg-warning' };

const isValidEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const userOf = current => current?.user || null;

const nameOf = user => user?.name || '';

const groupByOrganization = (accounts, unknownLabel) => {
  const groups = new Map();
  accounts.forEach(entry => {
    const name = entry.organization?.name || unknownLabel;
    if (!groups.has(name)) {
      groups.set(name, { name, accounts: [] });
    }
    groups.get(name).accounts.push(entry);
  });
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * The profile page every estate app with accounts of its own draws the same
 * way: the avatar card with the verification notice, then Profile (display
 * name and the Gravatar facts), Organizations (memberships, make primary,
 * leave, pending join requests), Security (password, email, delete account)
 * and Service accounts (create, the one-time token, select and delete),
 * every call through the app's `account` adapter and the session's own
 * `reload` and `signOutEverywhere`.
 */
const ProfilePage = ({ session, events, returnTo, account, activeOrgUuid }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  useEffect(() => {
    document.title = t('profile.pageTitle');
  }, [t]);

  const [current, setCurrent] = useState(() => session.restore());
  const currentUser = userOf(current);
  const oidc = Boolean(current?.oidc);
  const [gravatarProfile, setGravatarProfile] = useState({});
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [displayName, setDisplayName] = useState(() => nameOf(currentUser));
  const [activeTab, setActiveTab] = useState('profile');
  const [passwordErrors, setPasswordErrors] = useState({});
  const [emailErrors, setEmailErrors] = useState({});
  const [serviceAccounts, setServiceAccounts] = useState([]);
  const [serviceAccountOrgs, setServiceAccountOrgs] = useState([]);
  const [newServiceAccountOrg, setNewServiceAccountOrg] = useState(activeOrgUuid);
  const [newServiceAccountDescription, setNewServiceAccountDescription] = useState('');
  const [newServiceAccountExpiration, setNewServiceAccountExpiration] = useState(30);
  const [newServiceAccountToken, setNewServiceAccountToken] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [userOrganizations, setUserOrganizations] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const handleLeaveOrganization = async orgName => {
    try {
      await account.leave(orgName);
      notify('success', t('profile.messages.leftOrganization', { orgName }));
      setUserOrganizations((await account.organizations()) || []);
    } catch (error) {
      log.api.error('Error leaving organization', {
        orgName,
        error: error.message,
      });
      notify('danger', t('profile.errors.leaveOrganization', { error: error.message }));
    }
  };

  const handleCancelJoinRequest = async requestId => {
    try {
      await account.cancelRequest(requestId);
      notify('success', t('profile.messages.requestCancelled'));
      setJoinRequests((await account.requests()) || []);
    } catch (error) {
      log.api.error('Error cancelling join request', {
        requestId,
        error: error.message,
      });
      notify('danger', t('profile.messages.cancelRequestError', { error: error.message }));
    }
  };

  const validatePasswordForm = () => {
    const errors = {};
    if (!newPassword) {
      errors.newPassword = t('errors.fieldRequired', { ns: 'auth' });
    } else if (newPassword.length < 6 || newPassword.length > 40) {
      errors.newPassword = t('errors.passwordLength', { ns: 'auth' });
    }
    if (!confirmPassword) {
      errors.confirmPassword = t('errors.fieldRequired', { ns: 'auth' });
    } else if (confirmPassword !== newPassword) {
      errors.confirmPassword = t('profile.errors.passwordsDoNotMatch');
    }
    return errors;
  };

  const validateEmailForm = () => {
    const errors = {};
    if (!newEmail) {
      errors.newEmail = t('errors.fieldRequired', { ns: 'auth' });
    } else if (!isValidEmail(newEmail)) {
      errors.newEmail = t('errors.invalidEmail', { ns: 'auth' });
    }
    return errors;
  };

  const resetFormStates = useCallback(() => {
    setPasswordErrors({});
    setEmailErrors({});
    setNewPassword('');
    setConfirmPassword('');
    setNewEmail('');
  }, []);

  const resetServiceAccountStates = useCallback(() => {
    setNewServiceAccountToken(null);
    setNewServiceAccountDescription('');
    setNewServiceAccountExpiration(30);
  }, []);

  const handleTabChange = useCallback(
    tab => {
      if (tab === 'serviceAccounts') {
        resetServiceAccountStates();
      } else {
        resetFormStates();
      }
      setActiveTab(tab);
    },
    [resetFormStates, resetServiceAccountStates]
  );

  const handleDeleteAccount = async () => {
    try {
      await account.remove(currentUser.id);
      await session.signOutEverywhere();
    } catch (error) {
      log.auth.error('Error deleting account', {
        userId: currentUser.id,
        error: error.message,
      });
      notify('danger', responseMessage(error, t('profile.errors.deleteAccountFailed')));
    }
  };

  const openDeleteModal = () => setShowDeleteModal(true);
  const closeDeleteModal = () => setShowDeleteModal(false);

  const refreshUserData = useCallback(
    () =>
      session.reload().then(next => {
        if (next) {
          setCurrent(next);
          events.emit('login');
        }
      }),
    [events, session]
  );

  const handleSetPrimaryOrganization = async orgName => {
    try {
      await account.setPrimary(orgName);
      notify('success', t('profile.messages.primaryOrganizationSet', { orgName }));
      setUserOrganizations((await account.organizations()) || []);
      refreshUserData();
    } catch (error) {
      log.api.error('Error setting primary organization', {
        orgName,
        error: error.message,
      });
      notify('danger', t('profile.errors.setPrimaryOrganization', { error: error.message }));
    }
  };

  const checkEmailVerification = useCallback(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get('token');

    if (token) {
      account
        .verifyMail(token)
        .then(data => {
          notify('success', data.message);
          refreshUserData();
        })
        .catch(error => {
          notify('danger', responseMessage(error, t('profile.errors.verificationFailed')));
        })
        .finally(() => {
          navigate('/profile', { replace: true });
        });
    }
  }, [account, location.search, navigate, notify, refreshUserData, t]);

  useEffect(() => {
    checkEmailVerification();
  }, [checkEmailVerification]);

  const loadGravatarProfile = useCallback(
    async (emailHash, signal) => {
      try {
        const profile = await account.gravatarProfile(emailHash, signal);
        if (profile) {
          setGravatarProfile(profile);
        }
      } catch (error) {
        if (!isAbort(error)) {
          log.api.error('Error loading Gravatar profile', {
            emailHash,
            error: error.message,
          });
        }
      }
    },
    [account]
  );

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const loadUserData = async () => {
      if (currentUser) {
        const { emailHash } = currentUser;
        if (emailHash && mounted) {
          await loadGravatarProfile(emailHash, controller.signal);
        }
      } else {
        navigate(returnTo.signInTo('/profile'));
      }
    };

    loadUserData();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [currentUser, navigate, loadGravatarProfile, returnTo]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const loadData = async () => {
      if (activeTab === 'serviceAccounts') {
        try {
          const [accounts, orgs] = await Promise.all([
            account.serviceAccounts.list(controller.signal),
            account.serviceAccounts.organizations(),
          ]);
          if (mounted) {
            setServiceAccounts(accounts);
            setServiceAccountOrgs(orgs || []);
          }
        } catch (error) {
          if (mounted && !isAbort(error)) {
            log.api.error('Error loading service accounts', {
              error: error.message,
            });
          }
        }
      } else if (activeTab === 'organizations') {
        setOrganizationsLoading(true);
        try {
          const [organizations, requests] = await Promise.all([
            account.organizations(),
            account.requests(),
          ]);
          if (mounted) {
            setUserOrganizations(organizations || []);
            setJoinRequests(requests || []);
          }
        } catch (error) {
          if (mounted && !isAbort(error)) {
            log.api.error('Error loading organizations', {
              error: error.message,
            });
          }
        } finally {
          if (mounted) {
            setOrganizationsLoading(false);
          }
        }
      }
    };

    if (activeTab === 'serviceAccounts' || activeTab === 'organizations') {
      loadData();
    }

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [account, activeTab]);

  const loadServiceAccounts = async signal => {
    try {
      setServiceAccounts(await account.serviceAccounts.list(signal));
    } catch (error) {
      if (!isAbort(error)) {
        log.api.error('Error loading service accounts', {
          error: error.message,
        });
      }
    }
  };

  const handleCreateServiceAccount = async e => {
    e.preventDefault();
    const controller = new AbortController();
    try {
      const targetOrg = serviceAccountOrgs.find(org => org.name === newServiceAccountOrg);

      if (!targetOrg) {
        notify('danger', t('profile.errors.activeOrgNotFound'));
        return;
      }

      const created = await account.serviceAccounts.create(
        newServiceAccountDescription,
        newServiceAccountExpiration,
        targetOrg.id
      );
      await loadServiceAccounts(controller.signal);
      setNewServiceAccountDescription('');
      setNewServiceAccountExpiration(30);
      setNewServiceAccountToken(created?.token || null);
      notify('success', t('profile.messages.serviceAccountCreated'));
    } catch (error) {
      if (!isAbort(error)) {
        log.api.error('Error creating service account', {
          error: error.message,
        });
        notify(
          'danger',
          t('profile.errors.createServiceAccountFailed', {
            error: responseMessage(error, error.message),
          })
        );
      }
    }
    controller.abort();
  };

  const handleDeleteServiceAccount = async id => {
    const controller = new AbortController();
    try {
      await account.serviceAccounts.remove(id);
      await loadServiceAccounts(controller.signal);
    } catch (error) {
      if (!isAbort(error)) {
        log.api.error('Error deleting service account', {
          serviceAccountId: id,
          error: error.message,
        });
        notify(
          'danger',
          t('profile.errors.deleteServiceAccountsFailed', {
            error: responseMessage(error, error.message),
          })
        );
      }
    }
    controller.abort();
  };

  const selectedAccounts = serviceAccounts.filter(entry => selectedIds.has(entry.id));
  const allServiceAccountsSelected =
    serviceAccounts.length > 0 && selectedAccounts.length === serviceAccounts.length;

  const selectServiceAccount = (id, checked) => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const selectAllServiceAccounts = checked => {
    setSelectedIds(new Set(checked ? serviceAccounts.map(entry => entry.id) : []));
  };

  const handleDeleteSelectedServiceAccounts = async () => {
    const ids = selectedAccounts.map(entry => entry.id);
    const controller = new AbortController();
    try {
      await Promise.all(ids.map(id => account.serviceAccounts.remove(id)));
      notify('success', t('profile.messages.serviceAccountsDeleted'));
    } catch (error) {
      log.api.error('Error deleting service accounts', {
        serviceAccountIds: ids,
        error: error.message,
      });
      notify(
        'danger',
        t('profile.errors.deleteServiceAccountsFailed', {
          error: responseMessage(error, error.message),
        })
      );
    }
    setSelectedIds(new Set());
    await loadServiceAccounts(controller.signal);
    controller.abort();
  };

  const openDeleteSelectedModal = () => setShowDeleteSelectedModal(true);
  const closeDeleteSelectedModal = () => setShowDeleteSelectedModal(false);

  const handleResendVerificationMail = async () => {
    const controller = new AbortController();
    try {
      const data = await account.resendVerification(controller.signal);
      notify('success', data.message);
      await refreshUserData();
    } catch (error) {
      if (!isAbort(error)) {
        notify('danger', t('profile.errors.resendVerificationFailed', { error: error.message }));
      }
    }
    controller.abort();
  };

  const handlePasswordChange = async e => {
    e.preventDefault();
    const controller = new AbortController();
    const errors = validatePasswordForm();
    setPasswordErrors(errors);
    if (Object.keys(errors).length === 0) {
      try {
        await account.changePassword(currentUser.id, newPassword, controller.signal);
        notify('success', t('profile.messages.passwordChanged'));
      } catch (error) {
        if (!isAbort(error)) {
          notify('danger', t('profile.errors.changePasswordFailed', { error: error.message }));
        }
      }
    }
    controller.abort();
  };

  const handleEmailChange = async e => {
    e.preventDefault();
    const controller = new AbortController();
    const errors = validateEmailForm();
    setEmailErrors(errors);
    if (Object.keys(errors).length === 0) {
      try {
        await account.changeEmail(currentUser.id, newEmail, controller.signal);
        notify('success', t('profile.messages.emailChanged'));
        await refreshUserData();
      } catch (error) {
        if (!isAbort(error)) {
          notify('danger', t('profile.errors.changeEmailFailed', { error: error.message }));
        }
      }
    }
    controller.abort();
  };

  const handleDisplayNameChange = async e => {
    e.preventDefault();
    const controller = new AbortController();
    try {
      await account.changeName(currentUser.id, displayName, controller.signal);
      notify('success', t('profile.messages.nameChanged'));
      await refreshUserData();
    } catch (error) {
      if (!isAbort(error)) {
        notify(
          'danger',
          responseMessage(error, t('profile.errors.changeNameFailed', { error: error.message }))
        );
      }
    }
    controller.abort();
  };

  const renderProfileTab = () => (
    <div className="tab-pane fade show active">
      <form onSubmit={handleDisplayNameChange} className="mb-4">
        <label htmlFor="displayName" className="form-label">
          <strong>{t('profile.fields.displayName')}</strong>
        </label>
        <div className="col-md-4">
          <input
            type="text"
            id="displayName"
            className="form-control mb-2"
            maxLength={255}
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            placeholder={currentUser.username}
          />
          <small className="form-text text-body-secondary d-block mb-2">
            {t('profile.fields.displayNameHint')}
          </small>
          <button className="btn btn-primary" type="submit">
            {t('profile.buttons.save')}
          </button>
        </div>
      </form>
      <p>
        <strong>{t('profile.fields.fullName')}:</strong> {gravatarProfile.first_name}{' '}
        {gravatarProfile.last_name}
      </p>
      <p>
        <strong>{t('profile.fields.location')}:</strong>{' '}
        {gravatarProfile.location || t('profile.noLocation')}
      </p>
      <p>
        <strong>{t('profile.fields.email')}:</strong> {currentUser.email}
      </p>
      <p>
        <strong>{t('profile.fields.organization')}:</strong> {currentUser.organization}
      </p>
      <p>
        <strong>{t('profile.fields.roles')}:</strong>{' '}
        {currentUser.roles ? currentUser.roles.join(', ') : t('profile.noRoles')}
      </p>
      <p>
        <strong>{t('profile.fields.profileUrl')}:</strong>{' '}
        <a href={gravatarProfile.profile_url} target="_blank" rel="noopener noreferrer">
          {gravatarProfile.profile_url}
        </a>
      </p>
      <p>
        <strong>{t('profile.fields.verifiedAccounts')}:</strong>{' '}
        {gravatarProfile.number_verified_accounts}
      </p>
      <p>
        <strong>{t('profile.fields.registrationDate')}:</strong>{' '}
        {new Date(gravatarProfile.registration_date).toLocaleDateString()}
      </p>
      <p>
        <strong>{t('profile.fields.emailHash')}:</strong> {currentUser.emailHash}
      </p>
      <p>
        <strong>{t('profile.fields.userId')}:</strong> {currentUser.id}
      </p>
      {currentUser.accessToken ? (
        <p>
          <strong>{t('profile.fields.accessToken')}:</strong>{' '}
          {currentUser.accessToken.substring(0, 20)}...
        </p>
      ) : null}
    </div>
  );

  const renderSecurityTab = () => (
    <div className="tab-pane fade show active">
      <form onSubmit={handlePasswordChange}>
        <h5>{t('profile.security.changePassword.title')}</h5>
        <div className="form-group col-md-3 mb-3">
          <input
            type="password"
            className="form-control"
            placeholder={t('profile.security.changePassword.newPasswordPlaceholder')}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
          {passwordErrors.newPassword && (
            <div className="text-danger small">{passwordErrors.newPassword}</div>
          )}
        </div>
        <div className="form-group col-md-3 mb-3">
          <input
            type="password"
            className="form-control"
            placeholder={t('profile.security.changePassword.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />
          {passwordErrors.confirmPassword && (
            <div className="text-danger small">{passwordErrors.confirmPassword}</div>
          )}
        </div>
        <button className="btn btn-primary mb-3" type="submit">
          {t('profile.security.changePassword.button')}
        </button>
      </form>
      <form onSubmit={handleEmailChange} noValidate>
        <h5>{t('profile.security.changeEmail.title')}</h5>
        <div className="form-group col-md-3 mb-3">
          <input
            type="email"
            className="form-control"
            placeholder={t('profile.security.changeEmail.newEmailPlaceholder')}
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
          />
          {emailErrors.newEmail && <div className="text-danger small">{emailErrors.newEmail}</div>}
        </div>
        <button className="btn btn-primary mb-3" type="submit">
          {t('profile.security.changeEmail.button')}
        </button>
      </form>
      <div className="mt-3">
        <h4>{t('profile.security.deleteAccount.title')}</h4>
        <p>{t('profile.security.deleteAccount.warning')}</p>
        <button type="button" className="btn btn-danger" onClick={openDeleteModal}>
          {t('profile.security.deleteAccount.button')}
        </button>
      </div>
    </div>
  );

  const renderOrganizationsTab = () => (
    <div className="tab-pane fade show active">
      <h3>{t('profile.organizations.title')}</h3>

      {organizationsLoading ? (
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">{t('loading')}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="card mb-4">
            <div className="card-header">
              <h5>{t('profile.organizations.belongToTitle')}</h5>
            </div>
            <div className="card-body">
              {userOrganizations.length === 0 ? (
                <div className="alert alert-info">{t('profile.organizations.noOrgs')}</div>
              ) : (
                <ul className="list-group">
                  {userOrganizations.map(org => {
                    const orgName = org.name || org.organization?.name;
                    const orgDesc = org.description || org.organization?.description;
                    const isPrimary = !!org.isPrimary;
                    const orgId = org.id || org.organization?.id;

                    return (
                      <li key={orgId} className="list-group-item">
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <div className="d-flex align-items-center">
                              <div>
                                <strong>{orgName}</strong>
                                {isPrimary && (
                                  <span className="badge bg-primary ms-2">
                                    {t('profile.organizations.primary')}
                                  </span>
                                )}
                                <br />
                                {orgDesc && <small className="text-muted">{orgDesc}</small>}
                                <br />
                                <small className="text-muted">
                                  {t('profile.organizations.joined')}:{' '}
                                  {new Date(org.joinedAt).toLocaleDateString()}
                                </small>
                              </div>
                            </div>
                          </div>
                          <div className="d-flex align-items-center">
                            <span
                              className={`badge ${ROLE_CLASSES[org.role] || 'bg-secondary'} me-3`}
                            >
                              {t(`roles.${org.role}`)}
                            </span>
                            {!isPrimary && !oidc && (
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm me-2"
                                onClick={() => handleSetPrimaryOrganization(orgName)}
                              >
                                {t('profile.organizations.makePrimary')}
                              </button>
                            )}
                            {userOrganizations.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm"
                                onClick={() => handleLeaveOrganization(orgName)}
                              >
                                {t('profile.buttons.leave')}
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {joinRequests.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h5>{t('profile.organizations.pendingRequestsTitle')}</h5>
              </div>
              <div className="card-body">
                <ul className="list-group">
                  {joinRequests.map(request => (
                    <li key={request.id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <strong>{request.organization.name}</strong>
                          <br />
                          {request.organization.description && (
                            <small className="text-muted">{request.organization.description}</small>
                          )}
                          <br />
                          <small className="text-muted">
                            {t('profile.organizations.requested')}:{' '}
                            {new Date(request.created_at).toLocaleDateString()}
                          </small>
                        </div>
                        <div>
                          <span className="badge bg-warning me-3">{t('pages.status.pending')}</span>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => handleCancelJoinRequest(request.id)}
                          >
                            {t('profile.buttons.cancel')}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderServiceAccountsTab = () => (
    <div className="tab-pane fade show active">
      <h3>{t('profile.serviceAccounts.title')}</h3>
      <form onSubmit={handleCreateServiceAccount}>
        <div className="form-group col-md-3 mb-3">
          <select
            className="form-control"
            value={newServiceAccountOrg}
            onChange={e => setNewServiceAccountOrg(e.target.value)}
            aria-label={t('profile.serviceAccounts.organization')}
          >
            {serviceAccountOrgs.map(org => (
              <option key={org.id} value={org.name}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group col-md-3 mb-3">
          <input
            type="text"
            className="form-control"
            placeholder={t('profile.serviceAccounts.descriptionPlaceholder')}
            value={newServiceAccountDescription}
            onChange={e => setNewServiceAccountDescription(e.target.value)}
            required
          />
        </div>
        <div className="form-group col-md-3 mb-3">
          <select
            className="form-control"
            value={newServiceAccountExpiration}
            onChange={e => setNewServiceAccountExpiration(Number(e.target.value))}
          >
            <option value={30}>{t('profile.serviceAccounts.expiration.30')}</option>
            <option value={60}>{t('profile.serviceAccounts.expiration.60')}</option>
            <option value={90}>{t('profile.serviceAccounts.expiration.90')}</option>
            <option value={365}>{t('profile.serviceAccounts.expiration.365')}</option>
          </select>
        </div>
        <button className="btn btn-primary mb-3" type="submit">
          {t('profile.serviceAccounts.createButton')}
        </button>
      </form>
      {newServiceAccountToken && (
        <div className="alert alert-warning" role="alert">
          <strong>{t('profile.serviceAccounts.token')}:</strong>{' '}
          <code>{newServiceAccountToken}</code>
          <br />
          <small>{t('profile.serviceAccounts.tokenShownOnce')}</small>
        </div>
      )}
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div className="form-check">
          <input
            type="checkbox"
            className="form-check-input"
            id="selectAllServiceAccounts"
            checked={allServiceAccountsSelected}
            onChange={event => selectAllServiceAccounts(event.target.checked)}
          />
          <label className="form-check-label" htmlFor="selectAllServiceAccounts">
            {t('profile.serviceAccounts.selectAll')}
          </label>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={selectedAccounts.length === 0}
          onClick={openDeleteSelectedModal}
        >
          {t('profile.serviceAccounts.deleteSelected', { count: selectedAccounts.length })}
        </button>
      </div>
      {groupByOrganization(serviceAccounts, t('profile.unknown')).map(group => (
        <div key={group.name} className="card mb-3">
          <div className="card-header d-flex align-items-center gap-2">
            <h5 className="mb-0">{group.name}</h5>
            <span className="badge bg-secondary bg-opacity-50">{group.accounts.length}</span>
          </div>
          <ul className="list-group list-group-flush">
            {group.accounts.map(entry => (
              <li key={entry.id} className="list-group-item">
                <div className="d-flex justify-content-between align-items-center">
                  <input
                    type="checkbox"
                    className="form-check-input me-3"
                    checked={selectedIds.has(entry.id)}
                    onChange={event => selectServiceAccount(entry.id, event.target.checked)}
                    aria-label={entry.username}
                  />
                  <div className="flex-grow-1">
                    <strong>{entry.username}</strong> - {entry.description}
                    <br />
                    <small>
                      {t('profile.serviceAccounts.expires')}:{' '}
                      {new Date(entry.expiresAt).toLocaleDateString()}
                    </small>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteServiceAccount(entry.id)}
                    >
                      {t('profile.buttons.delete')}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <div className="list row">
      {currentUser && (
        <div className="card mt-2 mb-2">
          <div className="card-header text-center">
            <Avatar
              picture={currentUser.avatarUrl || gravatarProfile.avatar_url || ''}
              size={100}
            />
            <h3 className="mt-3">{gravatarProfile.display_name || currentUser.username}</h3>
            <p className="text-muted">{gravatarProfile.job_title || t('profile.noJobTitle')}</p>
          </div>
          <div className="card-body">
            {!currentUser.verified && (
              <div className="alert alert-warning" role="alert">
                {t('profile.messages.emailNotVerified')}
                <button
                  type="button"
                  className="btn btn-link"
                  onClick={handleResendVerificationMail}
                >
                  {t('profile.buttons.resendVerification')}
                </button>
              </div>
            )}
            <ul className="nav nav-tabs">
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === 'profile' ? 'active' : ''}`}
                  onClick={() => handleTabChange('profile')}
                >
                  {t('profile.tabs.profile')}
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === 'organizations' ? 'active' : ''}`}
                  onClick={() => handleTabChange('organizations')}
                >
                  {t('profile.tabs.organizations')}
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === 'security' ? 'active' : ''}`}
                  onClick={() => handleTabChange('security')}
                >
                  {t('profile.tabs.security')}
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === 'serviceAccounts' ? 'active' : ''}`}
                  onClick={() => handleTabChange('serviceAccounts')}
                >
                  {t('profile.tabs.serviceAccounts')}
                </button>
              </li>
            </ul>
            <div className="tab-content mt-3">
              {activeTab === 'profile' && renderProfileTab()}
              {activeTab === 'organizations' && renderOrganizationsTab()}
              {activeTab === 'security' && renderSecurityTab()}
              {activeTab === 'serviceAccounts' && renderServiceAccountsTab()}
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        show={showDeleteModal}
        handleClose={closeDeleteModal}
        handleConfirm={handleDeleteAccount}
        title={t('profile.deleteModal.title')}
        message={t('profile.deleteModal.message')}
      />
      <ConfirmModal
        show={showDeleteSelectedModal}
        handleClose={closeDeleteSelectedModal}
        handleConfirm={handleDeleteSelectedServiceAccounts}
        title={t('profile.serviceAccounts.deleteSelectedModal.title')}
        message={t('profile.serviceAccounts.deleteSelectedModal.message')}
      />
    </div>
  );
};

ProfilePage.propTypes = {
  session: PropTypes.object.isRequired,
  events: PropTypes.shape({ emit: PropTypes.func.isRequired }).isRequired,
  returnTo: returnToShape.isRequired,
  account: accountShape.isRequired,
  activeOrgUuid: PropTypes.string.isRequired,
};

export default ProfilePage;
