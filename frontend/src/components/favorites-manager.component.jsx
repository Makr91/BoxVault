import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FaStar, FaXmark, FaGripVertical, FaPlus } from "react-icons/fa6";

import FavoritesService from "../services/favorites.service";
import { log } from "../utils/Logger";

const FavoritesManager = () => {
  const { t } = useTranslation();
  const [favorites, setFavorites] = useState([]);
  const [enrichedFavorites, setEnrichedFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [draggedIndex, setDraggedIndex] = useState(null);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const [rawResponse, enrichedResponse] = await Promise.all([
        FavoritesService.getFavorites(),
        FavoritesService.getUserInfoClaims(),
      ]);

      setFavorites(rawResponse.data || []);
      setEnrichedFavorites(enrichedResponse.data?.favorite_apps || []);
    } catch (error) {
      log.api.error("Error loading favorites", { error: error.message });
      setMessage(t("favorites.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const saveFavorites = async (newFavorites) => {
    setSaving(true);
    setMessage("");
    try {
      await FavoritesService.saveFavorites(newFavorites);
      setMessage(t("favorites.saveSuccess"));
      setFavorites(newFavorites);
      const enrichedResponse = await FavoritesService.getUserInfoClaims();
      setEnrichedFavorites(enrichedResponse.data?.favorite_apps || []);
    } catch (error) {
      log.api.error("Error saving favorites", { error: error.message });
      setMessage(t("favorites.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddFavorite = (e) => {
    e.preventDefault();
    if (!newClientId.trim()) {
      setMessage(t("favorites.clientIdRequired"));
      return;
    }

    if (favorites.some((f) => f.clientId === newClientId)) {
      setMessage(t("favorites.alreadyFavorite"));
      return;
    }

    const updated = FavoritesService.addFavorite(
      favorites,
      newClientId.trim(),
      newCustomLabel.trim() || null
    );
    saveFavorites(updated);
    setNewClientId("");
    setNewCustomLabel("");
  };

  const handleRemoveFavorite = (clientId) => {
    const updated = FavoritesService.removeFavorite(favorites, clientId);
    saveFavorites(updated);
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      return;
    }

    const updated = FavoritesService.reorderFavorites(
      favorites,
      draggedIndex,
      dropIndex
    );
    setDraggedIndex(null);
    saveFavorites(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const getEnrichedData = (clientId) =>
    enrichedFavorites.find((ef) => ef.clientId === clientId) || {};

  const renderAppIcon = (app) => {
    if (app.iconUrl && app.iconUrl !== "") {
      return (
        <img
          src={app.iconUrl}
          className="logo-md icon-with-margin"
          alt=""
          onError={(e) => {
            e.target.style.display = "none";
          }}
        />
      );
    }

    if (app.homeUrl && app.homeUrl !== "") {
      try {
        const faviconUrl = `${new URL(app.homeUrl).origin}/favicon.ico`;
        return (
          <img
            src={faviconUrl}
            className="logo-md icon-with-margin"
            alt=""
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        );
      } catch (err) {
        log.component.debug("Invalid URL for favicon", {
          url: app.homeUrl,
          error: err.message,
        });
        return <FaStar className="logo-md icon-with-margin text-warning" />;
      }
    }

    return <FaStar className="logo-md icon-with-margin text-warning" />;
  };

  if (loading) {
    return (
      <div className="text-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3>{t("favorites.title")}</h3>
      <p className="text-muted">{t("favorites.description")}</p>

      {message && (
        <div
          className={`alert ${message.includes("success") ? "alert-success" : "alert-danger"}`}
        >
          {message}
        </div>
      )}

      <div className="card mb-4">
        <div className="card-header">
          <FaPlus className="me-2" /> {t("favorites.add.title")}
        </div>
        <div className="card-body">
          <form onSubmit={handleAddFavorite}>
            <div className="row">
              <div className="col-md-5 mb-3">
                <label htmlFor="clientId" className="form-label">
                  {t("favorites.add.clientIdLabel")}{" "}
                  <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="clientId"
                  value={newClientId}
                  onChange={(e) => setNewClientId(e.target.value)}
                  placeholder="e.g., boxvault, armor, web-terminal"
                  required
                />
                <small className="form-text text-muted">
                  {t("favorites.add.clientIdHint")}
                </small>
              </div>
              <div className="col-md-5 mb-3">
                <label htmlFor="customLabel" className="form-label">
                  {t("favorites.add.customLabelLabel")}
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="customLabel"
                  value={newCustomLabel}
                  onChange={(e) => setNewCustomLabel(e.target.value)}
                  placeholder="e.g., My App Name"
                />
                <small className="form-text text-muted">
                  {t("favorites.add.customLabelHint")}
                </small>
              </div>
              <div className="col-md-2 mb-3 d-flex align-items-end">
                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={saving}
                >
                  {saving ? (
                    <span className="spinner-border spinner-border-sm me-2" />
                  ) : (
                    <FaPlus className="me-2" />
                  )}
                  {t("buttons.add")}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <FaStar className="me-2 text-warning" />{" "}
          {t("favorites.yourFavorites")}
          {favorites.length > 0 && (
            <span className="badge bg-primary ms-2">{favorites.length}</span>
          )}
        </div>
        <div className="card-body">
          {favorites.length === 0 ? (
            <p className="text-muted">{t("favorites.noFavorites")}</p>
          ) : (
            <div className="list-group">
              {favorites
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((fav, index) => {
                  const enriched = getEnrichedData(fav.clientId);
                  const displayName =
                    fav.customLabel || enriched.clientName || fav.clientId;

                  return (
                    <div
                      key={fav.clientId}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      role="button"
                      tabIndex={0}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                        }
                      }}
                      className={`list-group-item ${draggedIndex === index ? "dragging" : ""}`}
                    >
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center">
                          <FaGripVertical className="text-muted me-3" />
                          {renderAppIcon(enriched)}
                          <div>
                            <strong>{displayName}</strong>
                            {enriched.clientName &&
                              fav.customLabel &&
                              enriched.clientName !== fav.customLabel && (
                                <small className="text-muted d-block">
                                  {enriched.clientName}
                                </small>
                              )}
                            {enriched.homeUrl && (
                              <small className="text-muted d-block">
                                <a
                                  href={enriched.homeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-decoration-none"
                                >
                                  {enriched.homeUrl}
                                </a>
                              </small>
                            )}
                          </div>
                        </div>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleRemoveFavorite(fav.clientId)}
                          disabled={saving}
                        >
                          <FaXmark className="me-1" />
                          {t("buttons.remove")}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          <div className="mt-3">
            <small className="text-muted">
              <FaGripVertical className="me-1" /> {t("favorites.dragHint")}
            </small>
          </div>
        </div>
      </div>

      <div className="card mt-3">
        <div className="card-body">
          <h6>{t("favorites.commonApps.title")}</h6>
          <p className="text-muted small mb-2">
            {t("favorites.commonApps.description")}
          </p>
          <ul className="list-unstyled small">
            <li>
              <code>boxvault</code> - {t("favorites.commonApps.boxvault")}
            </li>
            <li>
              <code>armor</code> - {t("favorites.commonApps.armor")}
            </li>
            <li>
              <code>web-terminal</code> -{" "}
              {t("favorites.commonApps.webTerminal")}
            </li>
          </ul>
          <p className="text-muted small">{t("favorites.commonApps.note")}</p>
        </div>
      </div>
    </div>
  );
};

export default FavoritesManager;
