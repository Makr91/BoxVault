import React, { useState, useEffect } from 'react';
import FavoritesService from '../services/favorites.service';
import { FaStar, FaXmark, FaGripVertical, FaPlus } from 'react-icons/fa6';

const FavoritesManager = () => {
  const [favorites, setFavorites] = useState([]);
  const [enrichedFavorites, setEnrichedFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [newCustomLabel, setNewCustomLabel] = useState('');
  const [draggedIndex, setDraggedIndex] = useState(null);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    setLoading(true);
    try {
      const [rawResponse, enrichedResponse] = await Promise.all([
        FavoritesService.getFavorites(),
        FavoritesService.getUserInfoClaims(),
      ]);

      setFavorites(rawResponse.data || []);
      setEnrichedFavorites(enrichedResponse.data?.favorite_apps || []);
    } catch (error) {
      console.error('Error loading favorites:', error);
      setMessage('Failed to load favorites');
    } finally {
      setLoading(false);
    }
  };

  const saveFavorites = async newFavorites => {
    setSaving(true);
    setMessage('');
    try {
      await FavoritesService.saveFavorites(newFavorites);
      setMessage('Favorites saved successfully!');
      setFavorites(newFavorites);
      // Reload enriched favorites
      const enrichedResponse = await FavoritesService.getUserInfoClaims();
      setEnrichedFavorites(enrichedResponse.data?.favorite_apps || []);
    } catch (error) {
      console.error('Error saving favorites:', error);
      setMessage('Failed to save favorites');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFavorite = e => {
    e.preventDefault();
    if (!newClientId.trim()) {
      setMessage('Please enter a client ID');
      return;
    }

    if (favorites.some(f => f.clientId === newClientId)) {
      setMessage('This application is already in your favorites');
      return;
    }

    const updated = FavoritesService.addFavorite(
      favorites,
      newClientId.trim(),
      newCustomLabel.trim() || null
    );
    saveFavorites(updated);
    setNewClientId('');
    setNewCustomLabel('');
  };

  const handleRemoveFavorite = clientId => {
    const updated = FavoritesService.removeFavorite(favorites, clientId);
    saveFavorites(updated);
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      return;
    }

    const updated = FavoritesService.reorderFavorites(favorites, draggedIndex, dropIndex);
    setDraggedIndex(null);
    saveFavorites(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const getEnrichedData = clientId => {
    return enrichedFavorites.find(ef => ef.clientId === clientId) || {};
  };

  const renderAppIcon = enriched => {
    const iconStyle = { width: '24px', height: '24px', marginRight: '12px' };

    if (enriched.iconUrl && enriched.iconUrl !== '') {
      return (
        <img
          src={enriched.iconUrl}
          style={iconStyle}
          alt=""
          onError={e => {
            e.target.style.display = 'none';
          }}
        />
      );
    }

    if (enriched.homeUrl && enriched.homeUrl !== '') {
      try {
        const faviconUrl = new URL(enriched.homeUrl).origin + '/favicon.ico';
        return (
          <img
            src={faviconUrl}
            style={iconStyle}
            alt=""
            onError={e => {
              e.target.style.display = 'none';
            }}
          />
        );
      } catch (error) {
        return <FaStar style={iconStyle} className="text-warning" />;
      }
    }

    return <FaStar style={iconStyle} className="text-warning" />;
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
      <h3>Favorite Applications</h3>
      <p className="text-muted">
        Manage your favorite applications for quick access from the user menu.
      </p>

      {message && (
        <div className={`alert ${message.includes('success') ? 'alert-success' : 'alert-danger'}`}>
          {message}
        </div>
      )}

      {/* Add New Favorite Form */}
      <div className="card mb-4">
        <div className="card-header">
          <FaPlus className="me-2" />
          Add Favorite Application
        </div>
        <div className="card-body">
          <form onSubmit={handleAddFavorite}>
            <div className="row">
              <div className="col-md-5 mb-3">
                <label htmlFor="clientId" className="form-label">
                  Client ID <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="clientId"
                  value={newClientId}
                  onChange={e => setNewClientId(e.target.value)}
                  placeholder="e.g., boxvault, armor, web-terminal"
                  required
                />
                <small className="form-text text-muted">
                  The OAuth client ID of the application
                </small>
              </div>
              <div className="col-md-5 mb-3">
                <label htmlFor="customLabel" className="form-label">
                  Custom Label (Optional)
                </label>
                <input
                  type="text"
                  className="form-control"
                  id="customLabel"
                  value={newCustomLabel}
                  onChange={e => setNewCustomLabel(e.target.value)}
                  placeholder="e.g., My App Name"
                />
                <small className="form-text text-muted">Override the default app name</small>
              </div>
              <div className="col-md-2 mb-3 d-flex align-items-end">
                <button type="submit" className="btn btn-primary w-100" disabled={saving}>
                  {saving ? (
                    <span className="spinner-border spinner-border-sm me-2" />
                  ) : (
                    <FaPlus className="me-2" />
                  )}
                  Add
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Current Favorites List */}
      <div className="card">
        <div className="card-header">
          <FaStar className="me-2 text-warning" />
          Your Favorites
          {favorites.length > 0 && (
            <span className="badge bg-primary ms-2">{favorites.length}</span>
          )}
        </div>
        <div className="card-body">
          {favorites.length === 0 ? (
            <p className="text-muted">
              No favorites yet. Add applications above to see them in your user menu.
            </p>
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
                      className="list-group-item"
                      draggable
                      onDragStart={e => handleDragStart(e, index)}
                      onDragOver={e => handleDragOver(e, index)}
                      onDrop={e => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      style={{
                        cursor: 'move',
                        opacity: draggedIndex === index ? 0.5 : 1,
                      }}
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
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          <div className="mt-3">
            <small className="text-muted">
              <FaGripVertical className="me-1" />
              Drag and drop to reorder favorites
            </small>
          </div>
        </div>
      </div>

      <div className="card mt-3">
        <div className="card-body">
          <h6>Application Client IDs</h6>
          <p className="text-muted small mb-2">
            Common applications you can add to favorites:
          </p>
          <ul className="list-unstyled small">
            <li>
              <code>boxvault</code> - BoxVault (Vagrant Box Repository)
            </li>
            <li>
              <code>armor</code> - ARMOR (File Server)
            </li>
            <li>
              <code>web-terminal</code> - Web Terminal
            </li>
          </ul>
          <p className="text-muted small">
            Note: Applications must be configured in the authorization server to appear with
            names and icons. Contact your administrator if an application doesn't display
            correctly.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FavoritesManager;
