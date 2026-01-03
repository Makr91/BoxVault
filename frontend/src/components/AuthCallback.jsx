import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import EventBus from "../common/EventBus";
import { log } from "../utils/Logger";

/**
 * AuthCallback Component
 * Handles authentication callbacks from external providers (OIDC, etc.)
 */
const AuthCallback = () => {
  const { t } = useTranslation(["auth", "common"]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const error = searchParams.get("error");

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

    if (token) {
      try {
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
                const { provider: extractedProvider } = JSON.parse(
                  atob(base64)
                );
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
            const intendedUrl = localStorage.getItem("boxvault_intended_url");
            if (intendedUrl) {
              localStorage.removeItem("boxvault_intended_url");
              log.auth.info("Redirecting to intended URL", {
                url: intendedUrl,
              });
              navigate(intendedUrl, { replace: true });
            } else {
              navigate("/profile", { replace: true });
            }
          })
          .catch((userFetchError) => {
            log.auth.warn("Error fetching user data", {
              error: userFetchError.message,
            });

            // Navigate even if user data fetch fails
            const intendedUrl = localStorage.getItem("boxvault_intended_url");
            if (intendedUrl) {
              localStorage.removeItem("boxvault_intended_url");
              log.auth.info("Redirecting to intended URL after error", {
                url: intendedUrl,
              });
              navigate(intendedUrl, { replace: true });
            } else {
              navigate("/profile", { replace: true });
            }
          });
      } catch (callbackError) {
        log.auth.error("Error processing authentication callback", {
          error: callbackError.message,
          stack: callbackError.stack,
        });
        navigate("/login", {
          state: { error: t("errors.failedToProcess") },
          replace: true,
        });
      }
    } else {
      log.auth.error("Auth callback received with no token or error");
      navigate("/login", {
        state: { error: t("errors.invalidResponse") },
        replace: true,
      });
    }
  }, [searchParams, navigate, t]);

  return (
    <div className="min-vh-100-flex">
      <div className="text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3">{t("processingAuth")}</p>
      </div>
    </div>
  );
};

export default AuthCallback;
