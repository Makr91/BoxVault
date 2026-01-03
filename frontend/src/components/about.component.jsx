import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  FaStar,
  FaBook,
  FaRocket,
  FaHeart,
  FaGithub,
  FaCode,
  FaServer,
} from "react-icons/fa6";

import AuthService from "../services/auth.service";
import FavoritesService from "../services/favorites.service";
import UserService from "../services/user.service";
import { log } from "../utils/Logger";
import BoxVaultVersion from "../version.json";

const About = () => {
  const { t } = useTranslation();
  const [projectData, setProjectData] = useState({
    title: "",
    description: "",
    components: [],
    features: [],
    goal: "",
  });
  const [currentUser, setCurrentUser] = useState(null);
  const [isBoxVaultFavorited, setIsBoxVaultFavorited] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState("");

  useEffect(() => {
    document.title = "About";
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await UserService.getPublicContent();
        setProjectData(response.data);
      } catch (error) {
        const content =
          (error.response && error.response.data) ||
          error.message ||
          error.toString();
        setProjectData((prevData) => ({ ...prevData, title: content }));
      }

      const user = AuthService.getCurrentUser();
      setCurrentUser(user);

      if (user?.provider?.startsWith("oidc-")) {
        try {
          const favResponse = await FavoritesService.getFavorites();
          const favorites = favResponse.data || [];
          setIsBoxVaultFavorited(
            favorites.some((f) => f.clientId === "boxvault")
          );
        } catch (error) {
          log.api.error("Error loading favorites", {
            error: error.message,
          });
        }
      }
    };

    loadData();
  }, []);

  const handleToggleFavorite = async () => {
    try {
      const response = await FavoritesService.getFavorites();
      let favorites = response.data || [];

      if (isBoxVaultFavorited) {
        favorites = FavoritesService.removeFavorite(favorites, "boxvault");
        setFavoriteMessage(
          t("messages.removedFromFavorites", { ns: "common" })
        );
      } else {
        favorites = FavoritesService.addFavorite(favorites, "boxvault", null);
        setFavoriteMessage(t("messages.addedToFavorites", { ns: "common" }));
      }

      await FavoritesService.saveFavorites(favorites);
      setIsBoxVaultFavorited(!isBoxVaultFavorited);

      setTimeout(() => setFavoriteMessage(""), 3000);
    } catch (error) {
      log.component.error("Error toggling favorite", {
        clientId: "boxvault",
        error: error.message,
      });
      setFavoriteMessage(
        t("messages.failedToUpdateFavorites", { ns: "common" })
      );
      setTimeout(() => setFavoriteMessage(""), 3000);
    }
  };

  return (
    <div className="container mt-4">
      <div className="text-center mb-5">
        <h1 className="display-4 fw-bold">{projectData.title || "BoxVault"}</h1>
        <p className="lead text-muted">
          {projectData.description || "Self-hosted Vagrant Box Repository"}
        </p>
        <span className="badge bg-primary fs-5">
          v{BoxVaultVersion.version}
        </span>

        {currentUser?.provider?.startsWith("oidc-") && (
          <div className="mt-3">
            <button
              className={`btn ${isBoxVaultFavorited ? "btn-warning" : "btn-outline-warning"}`}
              onClick={handleToggleFavorite}
            >
              <FaStar className="me-2" />
              {isBoxVaultFavorited
                ? t("about.removeFromFavorites", { ns: "common" })
                : t("about.addToFavorites", { ns: "common" })}
            </button>
            {favoriteMessage && (
              <div className="alert alert-info mt-2">{favoriteMessage}</div>
            )}
          </div>
        )}
      </div>

      <div className="row g-4">
        {/* Documentation Card */}
        <div className="col-md-6">
          <div className="card h-100 shadow-sm">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0">
                <FaBook className="me-2" />
                Documentation
              </h5>
            </div>
            <div className="card-body">
              <p className="card-text">
                Learn how to use BoxVault and integrate it with your workflow.
              </p>
              <ul className="list-unstyled">
                <li className="mb-2">
                  <a
                    href="https://docs.boxvault.startcloud.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decoration-none"
                  >
                    <FaBook className="me-2" />
                    Full Documentation
                  </a>
                </li>
                <li className="mb-2">
                  <a
                    href="/api-docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decoration-none"
                  >
                    <FaCode className="me-2" />
                    API Explorer (Swagger UI)
                  </a>
                </li>
                <li className="mb-2">
                  <a
                    href="https://docs.boxvault.startcloud.com/guides"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decoration-none"
                  >
                    <FaServer className="me-2" />
                    Getting Started Guide
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Features Card */}
        <div className="col-md-6">
          <div className="card h-100 shadow-sm">
            <div className="card-header bg-success text-white">
              <h5 className="mb-0">
                <FaRocket className="me-2" />
                {t("about.keyFeatures", { ns: "common" })}
              </h5>
            </div>
            <div className="card-body">
              <ul className="list-unstyled">
                {projectData.features.map((feature) => (
                  <li key={feature} className="mb-2">
                    <FaRocket className="me-2 text-success" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Support & Community Card */}
        <div className="col-md-6">
          <div className="card h-100 shadow-sm">
            <div className="card-header bg-danger text-white">
              <h5 className="mb-0">
                <FaHeart className="me-2" />
                {t("about.supportAndFollow", { ns: "common" })}
              </h5>
            </div>
            <div className="card-body">
              <p className="card-text">
                Support the project and stay connected with the community.
              </p>
              <ul className="list-unstyled">
                <li className="mb-2">
                  <a
                    href="https://www.patreon.com/Philotic"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decoration-none"
                  >
                    <FaHeart className="me-2 text-danger" />
                    {t("about.supportOnPatreon", { ns: "common" })}
                  </a>
                </li>
                <li className="mb-2">
                  <a
                    href="https://github.com/makr91"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decoration-none"
                  >
                    <FaGithub className="me-2" />
                    {t("about.githubProfile", { ns: "common" })}
                  </a>
                </li>
                <li className="mb-2">
                  <a
                    href="https://github.com/makr91/BoxVault"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decoration-none"
                  >
                    <FaCode className="me-2" />
                    {t("about.projectRepository", { ns: "common" })}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Components Card */}
        <div className="col-md-6">
          <div className="card h-100 shadow-sm">
            <div className="card-header bg-info text-white">
              <h5 className="mb-0">
                <FaServer className="me-2" />
                Components
              </h5>
            </div>
            <div className="card-body">
              {projectData.components.map((component) => (
                <div key={component.title} className="mb-3">
                  <h6 className="fw-bold">{component.title}</h6>
                  <ul className="list-unstyled small">
                    {component.details.map((detail) => (
                      <li key={detail} className="mb-1">
                        • {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {projectData.goal && (
        <div className="row mt-4">
          <div className="col-12">
            <div className="card shadow-sm">
              <div className="card-body text-center">
                <p className="mb-0 lead">{projectData.goal}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default About;
