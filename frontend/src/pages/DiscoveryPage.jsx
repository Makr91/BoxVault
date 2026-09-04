import PropTypes from 'prop-types';
import { useState, useEffect, useCallback } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { useTranslation, Trans } from 'react-i18next';
import { FaBuilding, FaUsers, FaBox } from 'react-icons/fa6';
import { Link, useNavigate } from 'react-router-dom';

import { log, useNavbarSearchBinding, useNotify } from '../chrome';

import { returnToShape } from './auth';
import { responseMessage } from './itemShape';
import { organizationsShape } from './organizations';

const NO_FILTERS = [];
const clearNothing = () => undefined;

const ACCESS_MODE_KEYS = {
  invite_only: 'discovery.buttons.inviteOnly',
  request_to_join: 'discovery.buttons.requestToJoin',
};

const ACCESS_MODE_CLASSES = {
  invite_only: 'bg-warning',
  request_to_join: 'bg-success',
};

const matchesQuery = (org, term) =>
  org.name.toLowerCase().includes(term) ||
  (org.display_name || '').toLowerCase().includes(term) ||
  org.description.toLowerCase().includes(term);

const OrgIcon = ({ org, gravatarUrl, orgMark }) => {
  const iconUrl = org.logo || gravatarUrl;
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="rounded-circle me-2" width="24" height="24" />;
  }
  return orgMark;
};

OrgIcon.propTypes = {
  org: PropTypes.shape({ logo: PropTypes.string }).isRequired,
  gravatarUrl: PropTypes.string,
  orgMark: PropTypes.node.isRequired,
};

const JoinButton = ({ org, onRequest }) => {
  const { t } = useTranslation();
  if (org.accessMode === 'invite_only') {
    return (
      <button type="button" className="btn btn-outline-secondary w-100" disabled>
        {t('discovery.buttons.inviteOnly')}
      </button>
    );
  }
  if (org.accessMode === 'request_to_join') {
    return (
      <button type="button" className="btn btn-primary w-100" onClick={() => onRequest(org)}>
        {t('discovery.buttons.requestToJoin')}
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-outline-secondary w-100" disabled>
      {t('discovery.buttons.private')}
    </button>
  );
};

JoinButton.propTypes = {
  org: PropTypes.shape({ accessMode: PropTypes.string }).isRequired,
  onRequest: PropTypes.func.isRequired,
};

const OrgCard = ({ org, gravatarUrl, orgMark, onRequest }) => {
  const { t } = useTranslation();
  return (
    <div className="col-md-6 col-lg-4 mb-4">
      <div className="card h-100">
        <div className="card-header">
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">
              <OrgIcon org={org} gravatarUrl={gravatarUrl} orgMark={orgMark} />
              {org.display_name || org.name}
            </h5>
            <span className={`badge ${ACCESS_MODE_CLASSES[org.accessMode] || 'bg-secondary'}`}>
              {t(ACCESS_MODE_KEYS[org.accessMode] || 'discovery.buttons.private')}
            </span>
          </div>
        </div>
        <div className="card-body">
          <p className="card-text">{org.description || t('discovery.noDescription')}</p>
          <div className="d-flex justify-content-between text-muted small">
            <span>
              <FaUsers className="me-1" />
              {org.memberCount} {t('discovery.members')}
            </span>
            <div className="d-flex flex-column align-items-end">
              <span>
                <FaBox className="me-1" />
                <Link to={`/${org.name}`} className="text-decoration-none">
                  {org.publicBoxCount} {t('discovery.public')}
                </Link>
              </span>
              {org.totalBoxCount > org.publicBoxCount && (
                <span className="text-muted">
                  {org.totalBoxCount - org.publicBoxCount} {t('discovery.private')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="card-footer">
          <JoinButton org={org} onRequest={onRequest} />
        </div>
      </div>
    </div>
  );
};

OrgCard.propTypes = {
  org: PropTypes.object.isRequired,
  gravatarUrl: PropTypes.string,
  orgMark: PropTypes.node.isRequired,
  onRequest: PropTypes.func.isRequired,
};

/**
 * The public page that lists the organizations open to discovery, each
 * with its logo (stored, else Gravatar through `organizations.gravatarProfile`,
 * else the app's mark), its access mode, member and box counts, and a
 * request-to-join dialog; a visitor is sent to sign in first, the intended
 * organization kept under `joinIntentKey` for the return.
 */
const DiscoveryPage = ({ session, returnTo, organizations, orgMark, joinIntentKey }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [joinRequestMessage, setJoinRequestMessage] = useState('');
  const [requestingOrg, setRequestingOrg] = useState(null);
  const [orgGravatars, setOrgGravatars] = useState({});

  const fetchOrgGravatars = useCallback(
    async orgList => {
      const results = await Promise.all(
        orgList
          .filter(org => org.emailHash)
          .map(async org => {
            const profile = await organizations.gravatarProfile(org.emailHash);
            return { name: org.name, url: profile?.avatar_url };
          })
      );
      const gravatars = {};
      results.forEach(result => {
        if (result.url) {
          gravatars[result.name] = result.url;
        }
      });
      setOrgGravatars(gravatars);
    },
    [organizations]
  );

  useEffect(() => {
    document.title = t('discovery.title');

    let cancelled = false;

    const loadDiscoverableOrganizations = async () => {
      try {
        const orgs = (await organizations.discover()) || [];
        if (cancelled) {
          return;
        }
        setRows(orgs);

        const savedJoinOrg = localStorage.getItem(joinIntentKey);
        if (savedJoinOrg) {
          const intendedOrg = orgs.find(o => o.name === savedJoinOrg);
          if (intendedOrg) {
            setRequestingOrg(intendedOrg);
            localStorage.removeItem(joinIntentKey);
          }
        }

        await fetchOrgGravatars(orgs);
      } catch (error) {
        if (!cancelled) {
          log.api.error('Error loading discoverable organizations', {
            error: error.message,
          });
          notify('danger', t('discovery.errors.load'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDiscoverableOrganizations();

    return () => {
      cancelled = true;
    };
  }, [fetchOrgGravatars, joinIntentKey, notify, organizations, t]);

  const closeRequest = () => {
    setRequestingOrg(null);
    setJoinRequestMessage('');
  };

  const handleJoinRequest = async orgName => {
    if (!joinRequestMessage.trim()) {
      notify('warning', t('discovery.errors.emptyMessage'));
      return;
    }

    try {
      await organizations.join(orgName, joinRequestMessage);
      notify('success', t('discovery.messages.requestSent', { orgName }));
      closeRequest();
    } catch (error) {
      log.api.error('Error creating join request', {
        orgName,
        error: error.message,
      });
      notify('danger', responseMessage(error, t('discovery.errors.requestFailed', { orgName })));
    }
  };

  const requestToJoin = org => {
    if (!session.restore()) {
      localStorage.setItem(joinIntentKey, org.name);
      navigate(returnTo.signInTo('/organizations/discover'));
    } else {
      setRequestingOrg(org);
    }
  };

  const term = searchTerm.toLowerCase();
  const filteredOrganizations = rows.filter(org => matchesQuery(org, term));

  useNavbarSearchBinding({
    query: searchTerm,
    onQueryChange: setSearchTerm,
    placeholder: t('discovery.searchPlaceholder'),
    matched: filteredOrganizations.length,
    total: rows.length,
    groups: NO_FILTERS,
    onClearFilters: clearNothing,
  });

  const requestingName = requestingOrg ? requestingOrg.display_name || requestingOrg.name : '';

  return (
    <div className="container mt-4">
      <div className="row">
        <div className="col-12">
          <h2 className="mb-4">
            <FaBuilding className="me-2" />
            {t('discovery.title')}
          </h2>
          <p className="text-muted">{t('discovery.description')}</p>

          {loading && (
            <div className="text-center">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">{t('loading')}</span>
              </div>
            </div>
          )}

          {!loading && filteredOrganizations.length === 0 && (
            <div className="alert alert-info">
              <h5>{t('discovery.noOrgsFoundTitle')}</h5>
              <p className="mb-0">
                {searchTerm ? t('discovery.noOrgsFoundSearch') : t('discovery.noOrgsFoundPublic')}
              </p>
            </div>
          )}

          {!loading && filteredOrganizations.length > 0 && (
            <div className="row">
              {filteredOrganizations.map(org => (
                <OrgCard
                  key={org.id}
                  org={org}
                  gravatarUrl={orgGravatars[org.name]}
                  orgMark={orgMark}
                  onRequest={requestToJoin}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal show={Boolean(requestingOrg)} onHide={closeRequest}>
        <Modal.Header closeButton>
          <Modal.Title as="h5">
            {t('discovery.modal.title', { orgName: requestingName })}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            <Trans
              i18nKey="discovery.modal.description"
              values={{ orgName: requestingName }}
              components={{ strong: <strong /> }}
            />
          </p>
          <textarea
            className="form-control"
            rows="4"
            value={joinRequestMessage}
            onChange={e => setJoinRequestMessage(e.target.value)}
            placeholder={t('discovery.modal.placeholder')}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeRequest}>
            {t('pages.confirm.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => handleJoinRequest(requestingOrg.name)}
            disabled={!joinRequestMessage.trim()}
          >
            {t('discovery.buttons.sendRequest')}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

DiscoveryPage.propTypes = {
  session: PropTypes.object.isRequired,
  returnTo: returnToShape.isRequired,
  organizations: organizationsShape.isRequired,
  orgMark: PropTypes.node.isRequired,
  joinIntentKey: PropTypes.string.isRequired,
};

export default DiscoveryPage;
