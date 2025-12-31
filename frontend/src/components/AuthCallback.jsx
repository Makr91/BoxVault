import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import EventBus from "../common/EventBus";

/**
 * AuthCallback Component
 * Handles authentication callbacks from external providers (OIDC, etc.)
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const error = searchParams.get("error");

    if (error) {
      let errorMessage = "Authentication failed";

      switch (error) {
        case "oidc_failed":
          errorMessage = "OIDC authentication failed";
          break;
        case "access_denied":
          errorMessage =
            "Access denied - you may not have permission to access this system";
          break;
        case "token_generation_failed":
          errorMessage = "Failed to generate authentication token";
          break;
        case "no_provider":
          errorMessage = "No authentication provider specified";
          break;
        default:
          errorMessage = `Authentication error: ${error}`;
      }

      console.error("Authentication error:", error);
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

        console.log("Authentication successful, token stored");

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
            console.warn("Failed to fetch user data, using token only");
            return null;
          })
          .then((fullUserData) => {
            if (fullUserData) {
              // Decode JWT to extract provider field for RP-initiated logout
              let provider = null;
              try {
                const base64Url = token.split(".")[1];
                const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                const decoded = JSON.parse(atob(base64));
                provider = decoded.provider;
              } catch (decodeError) {
                console.warn(
                  "Failed to decode JWT for provider extraction:",
                  decodeError
                );
              }

              const completeUserData = {
                ...fullUserData,
                accessToken: token,
                tokenRefreshTime: Date.now(),
                provider,
              };
              localStorage.setItem("user", JSON.stringify(completeUserData));
              console.log("Full user data fetched and stored", { provider });

              // Trigger login event to update navbar
              EventBus.dispatch("login", completeUserData);
            }

            // Navigate after user data is processed
            const intendedUrl = localStorage.getItem("boxvault_intended_url");
            if (intendedUrl) {
              localStorage.removeItem("boxvault_intended_url");
              console.log("Redirecting to intended URL:", intendedUrl);
              navigate(intendedUrl, { replace: true });
            } else {
              navigate("/profile", { replace: true });
            }
          })
          .catch((fetchError) => {
            console.warn("Error fetching user data:", fetchError);

            // Navigate even if user data fetch fails
            const intendedUrl = localStorage.getItem("boxvault_intended_url");
            if (intendedUrl) {
              localStorage.removeItem("boxvault_intended_url");
              console.log("Redirecting to intended URL:", intendedUrl);
              navigate(intendedUrl, { replace: true });
            } else {
              navigate("/profile", { replace: true });
            }
          });
      } catch (error) {
        console.error("Error processing authentication callback:", error);
        navigate("/login", {
          state: { error: "Failed to process authentication" },
          replace: true,
        });
      }
    } else {
      console.error("Auth callback received with no token or error");
      navigate("/login", {
        state: { error: "Invalid authentication response" },
        replace: true,
      });
    }
  }, [searchParams, navigate]);

  return (
    <div
      className="d-flex justify-content-center align-items-center"
      style={{ minHeight: "100vh" }}
    >
      <div className="text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3">Processing authentication...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
