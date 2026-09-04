import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useNotify } from '../chrome';

import { authShape, returnToShape } from './auth';
import { responseMessage } from './itemShape';
import { isMember } from './membership';

/**
 * The landing page of an organization invitation link, `/invite/:token`:
 * validates the token through `auth.validateInvitation`, sends a visitor
 * to sign in or register, refuses an account the invitation was not
 * addressed to, and accepts through `auth.acceptInvitation`, making the
 * organization active and refreshing the session.
 */
const InvitePage = ({ session, returnTo, auth, activeOrgKey }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const { token } = useParams();
  const navigate = useNavigate();

  const current = session.restore();
  const currentUser = current?.user || null;

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    document.title = t('inviteAccept.title');
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      try {
        const data = await auth.validateInvitation(token);
        if (!cancelled) {
          setInvitation(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(responseMessage(err, t('inviteAccept.invalid')));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    validate();

    return () => {
      cancelled = true;
    };
  }, [auth, token, t]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const { organization: org } = await auth.acceptInvitation(token);
      localStorage.setItem(activeOrgKey, org);
      await session.refresh();
      window.location.href = `/${org}`;
    } catch (err) {
      setAccepting(false);
      notify('danger', responseMessage(err, t('inviteAccept.error')));
    }
  };

  const handleSignIn = () => {
    const target = `/invite/${token}`;
    returnTo.remember(target);
    navigate(returnTo.signInTo(target));
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">{t('loading')}</span>
          </div>
          <p className="mt-3">{t('inviteAccept.validating')}</p>
        </div>
      );
    }

    if (error || !invitation) {
      return (
        <div className="alert alert-danger" role="alert">
          {error || t('inviteAccept.invalid')}
        </div>
      );
    }

    const orgName = invitation.organizationName;
    const roleLabel = t(`roles.${invitation.invitedRole || 'member'}`);

    if (!currentUser) {
      return (
        <>
          <p>{t('inviteAccept.signInPrompt', { organization: orgName })}</p>
          <div className="d-grid gap-2 col-8 mx-auto">
            <button type="button" className="btn btn-primary" onClick={handleSignIn}>
              {t('inviteAccept.signIn')}
            </button>
          </div>
          <p className="text-center mt-3 text-muted">
            {t('inviteAccept.registerPrompt')}{' '}
            <Link to={`/register?token=${encodeURIComponent(token)}`}>
              {t('inviteAccept.register')}
            </Link>
          </p>
        </>
      );
    }

    const emailMatches =
      currentUser.email &&
      invitation.email &&
      currentUser.email.toLowerCase() === invitation.email.toLowerCase();

    if (!emailMatches) {
      return (
        <>
          <div className="alert alert-warning" role="alert">
            {t('inviteAccept.emailMismatch', {
              email: invitation.email,
              current: currentUser.email,
            })}
          </div>
          <div className="d-grid gap-2 col-8 mx-auto">
            <button type="button" className="btn btn-outline-primary" onClick={handleSignIn}>
              {t('inviteAccept.signIn')}
            </button>
          </div>
        </>
      );
    }

    if (isMember(current.organizations, orgName)) {
      return (
        <>
          <div className="alert alert-info" role="status">
            {t('inviteAccept.alreadyMember', { organization: orgName })}
          </div>
          <div className="d-grid gap-2 col-8 mx-auto">
            <Link to={`/${orgName}`} className="btn btn-primary">
              {t('inviteAccept.goToOrg', { organization: orgName })}
            </Link>
          </div>
        </>
      );
    }

    return (
      <>
        <p>
          {t('inviteAccept.invitedAs', {
            organization: orgName,
            role: roleLabel,
          })}
        </p>
        <div className="d-grid gap-2 col-8 mx-auto">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting && <span className="spinner-border spinner-border-sm me-2" />}
            {accepting ? t('inviteAccept.accepting') : t('inviteAccept.accept')}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="col-md-12">
      <div className="container col-md-4">
        <h2 className="fs-2 text-center mt-5 mb-4">{t('inviteAccept.title')}</h2>
        {renderBody()}
      </div>
    </div>
  );
};

InvitePage.propTypes = {
  session: PropTypes.object.isRequired,
  returnTo: returnToShape.isRequired,
  auth: authShape.isRequired,
  activeOrgKey: PropTypes.string.isRequired,
};

export default InvitePage;
