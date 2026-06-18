import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import AuthService from "../services/auth.service";
import { isOrgMember } from "../utils/permissions";

/**
 * InviteAccept - landing page for organization invitation links (/invite/:token).
 * Works for existing accounts (local or OIDC) joining an additional organization,
 * which the register/signup flow cannot do.
 */
const InviteAccept = () => {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();

  const currentUser = AuthService.getCurrentUser();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    document.title = t("inviteAccept.title");
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    const validate = async () => {
      try {
        const response = await AuthService.validateInvitationToken(token);
        if (!cancelled) {
          setInvitation(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || t("inviteAccept.invalid"));
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
  }, [token, t]);

  const handleAccept = async () => {
    setAccepting(true);
    setMessage("");
    try {
      const response = await AuthService.acceptInvitation(token);
      const org = response.data.organization;
      // Refresh the JWT so the new membership appears in the org switcher/claims.
      await AuthService.forceTokenRefresh();
      localStorage.setItem("activeOrganization", org);
      window.location.href = `/${org}`;
    } catch (err) {
      setAccepting(false);
      setMessage(err.response?.data?.message || t("inviteAccept.error"));
    }
  };

  const handleSignIn = () => {
    const target = `/invite/${token}`;
    // Honored by both the local login (returnTo) and the OIDC callback (intended url).
    localStorage.setItem("boxvault_intended_url", target);
    navigate(`/login?returnTo=${encodeURIComponent(target)}`);
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">{t("loading")}</span>
          </div>
          <p className="mt-3">{t("inviteAccept.validating")}</p>
        </div>
      );
    }

    if (error || !invitation) {
      return (
        <div className="alert alert-danger" role="alert">
          {error || t("inviteAccept.invalid")}
        </div>
      );
    }

    const orgName = invitation.organizationName;
    const roleLabel = t(`roles.${invitation.invitedRole || "user"}`);

    // Not signed in -> sign in (existing account) or register (new account) to accept.
    if (!currentUser) {
      return (
        <>
          <p>{t("inviteAccept.signInPrompt", { organization: orgName })}</p>
          <div className="d-grid gap-2 col-8 mx-auto">
            <button className="btn btn-primary" onClick={handleSignIn}>
              {t("inviteAccept.signIn")}
            </button>
          </div>
          <p className="text-center mt-3 text-muted">
            {t("inviteAccept.registerPrompt")}{" "}
            <Link to={`/register?token=${encodeURIComponent(token)}`}>
              {t("inviteAccept.register")}
            </Link>
          </p>
        </>
      );
    }

    // Signed in as a different account than the invitation was addressed to.
    const emailMatches =
      currentUser.email &&
      invitation.email &&
      currentUser.email.toLowerCase() === invitation.email.toLowerCase();

    if (!emailMatches) {
      return (
        <>
          <div className="alert alert-warning" role="alert">
            {t("inviteAccept.emailMismatch", {
              email: invitation.email,
              current: currentUser.email,
            })}
          </div>
          <div className="d-grid gap-2 col-8 mx-auto">
            <button className="btn btn-outline-primary" onClick={handleSignIn}>
              {t("inviteAccept.signIn")}
            </button>
          </div>
        </>
      );
    }

    // Already a member of this organization.
    if (isOrgMember(currentUser, orgName)) {
      return (
        <>
          <div className="alert alert-info" role="alert">
            {t("inviteAccept.alreadyMember", { organization: orgName })}
          </div>
          <div className="d-grid gap-2 col-8 mx-auto">
            <Link to={`/${orgName}`} className="btn btn-primary">
              {t("inviteAccept.goToOrg", { organization: orgName })}
            </Link>
          </div>
        </>
      );
    }

    // Ready to accept.
    return (
      <>
        <p>
          {t("inviteAccept.invitedAs", {
            organization: orgName,
            role: roleLabel,
          })}
        </p>
        {message && (
          <div className="alert alert-danger" role="alert">
            {message}
          </div>
        )}
        <div className="d-grid gap-2 col-8 mx-auto">
          <button
            className="btn btn-primary"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting && (
              <span className="spinner-border spinner-border-sm me-2" />
            )}
            {accepting ? t("inviteAccept.accepting") : t("inviteAccept.accept")}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="col-md-12">
      <div className="container col-md-4">
        <h2 className="fs-2 text-center mt-5 mb-4">
          {t("inviteAccept.title")}
        </h2>
        {renderBody()}
      </div>
    </div>
  );
};

export default InviteAccept;
