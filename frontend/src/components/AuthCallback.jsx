import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import EventBus from "../common/EventBus";
import { log } from "../utils/Logger";

/**
 * AuthCallback Component
 * Handles authentication callbacks from external providers (OIDC, etc.).
 * The callback URL carries only a single-use login code — never the JWT.
 * The code is exchanged for the token via POST /api/auth/oidc/exchange.
 */
const AuthCallback = () => {
  const { t } = useTranslation(["auth", "common"]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Codes are single-use: never start a second exchange if the effect re-runs
  const exchangeStartedRef = useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    const navigateAfterLogin = () => {
      const intendedUrl = localStorage.getItem("boxvault_intended_url");
      if (intendedUrl) {
        localStorage.removeItem("boxvault_intended_url");
        log.auth.info("Redirecting to intended URL", { url: intendedUrl });
        navigate(intendedUrl, { replace: true });
      } else {
        navigate("/profile", { replace: true });
      }
    };

    const processToken = (token) => {
      // Store the token temporarily
      const userData = { accessToken: token };
      localStorage.setItem("user", JSON.stringify(userData));

      log.auth.info("Authentication successful, token stored");

      // Fetch full user data with the token
      fetch(`${window.location.origin}/api/user`, {
        headers: {
          "x-access-token": token,
          "Content-Type": "application/json",
        },
      })
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          log.auth.warn("Failed to fetch user data, using token only");
          return null;
        })
        .then((fullUserData) => {
          if (fullUserData) {
            // Decode JWT to extract provider field for RP-initiated logout
            let provider = null;
            try {
              const [, base64Url] = token.split(".");
              const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
              const { provider: extractedProvider } = JSON.parse(atob(base64));
              provider = extractedProvider;
            } catch (decodeError) {
              log.auth.warn("Failed to decode JWT for provider extraction", {
                error: decodeError.message,
              });
            }

            const completeUserData = {
              ...fullUserData,
              accessToken: token,
              tokenRefreshTime: Date.now(),
              provider,
            };
            localStorage.setItem("user", JSON.stringify(completeUserData));
            log.auth.info("Full user data fetched and stored", { provider });

            // Trigger login event to update navbar
            EventBus.dispatch("login", completeUserData);
          }

          // Navigate after user data is processed
          navigateAfterLogin();
        })
        .catch((userFetchError) => {
          log.auth.warn("Error fetching user data", {
            error: userFetchError.message,
          });

          // Navigate even if user data fetch fails
          navigateAfterLogin();
        });
    };

    if (error) {
      let errorMessage = t("errors.authenticationFailed");

      switch (error) {
        case "oidc_failed":
          errorMessage = t("errors.oidcFailed");
          break;
        case "access_denied":
          errorMessage = t("errors.accessDenied");
          break;
        case "token_generation_failed":
          errorMessage = t("errors.tokenGenerationFailed");
          break;
        case "no_provider":
          errorMessage = t("errors.noProvider");
          break;
        default:
          errorMessage = t("errors.authError", {
            error,
          });
      }

      log.auth.error("Authentication error", { error, errorMessage });
      navigate("/login", {
        state: { error: errorMessage },
        replace: true,
      });
      return;
    }

    if (!code) {
      log.auth.error("Auth callback received with no login code or error");
      navigate("/login", {
        state: { error: t("errors.invalidResponse") },
        replace: true,
      });
      return;
    }

    if (exchangeStartedRef.current) {
      return;
    }
    exchangeStartedRef.current = true;

    // Exchange the single-use login code for the session token
    fetch(`${window.location.origin}/api/auth/oidc/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Login code exchange failed (${response.status})`);
        }
        return response.json();
      })
      .then((data) => {
        if (!data?.token) {
          throw new Error("Login code exchange returned no token");
        }
        processToken(data.token);
      })
      .catch((exchangeError) => {
        log.auth.error("Error exchanging login code", {
          error: exchangeError.message,
        });
        navigate("/login", {
          state: { error: t("errors.failedToProcess") },
          replace: true,
        });
      });
  }, [searchParams, navigate, t]);

  return (
    <div className="min-vh-100-flex">
      <div className="text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3">{t("messages.processingAuth")}</p>
      </div>
    </div>
  );
};

export default AuthCallback;
