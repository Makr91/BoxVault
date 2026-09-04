import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { log } from '../chrome';
import { returnTo, session } from '../chromeProps';
import { api } from '../services/api';

import ConfigurationManager from './ConfigurationManager.component';
import OrganizationUserManager from './OrganizationUserManager.component';
import StorageInfo from './StorageInfo.component';
import UpdateNotification from './UpdateNotification.component';

/**
 * Admin - Main admin panel component
 * Provides authentication guard and tab management for admin features
 */
const Admin = () => {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = t('admin.pageTitle');
  }, [t]);

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('organizations');
  const [updateInfo, setUpdateInfo] = useState(null);

  // Authentication guard - redirect if not authenticated or not admin
  useEffect(() => {
    const currentUser = session.current();

    if (!currentUser) {
      navigate(returnTo.signInTo('/admin'));
      return;
    }

    if (!currentUser.roles || !currentUser.roles.includes('ROLE_ADMIN')) {
      // Authenticated but not admin, redirect to home
      navigate('/');
    }

    // Check for updates
    api.system
      .updateStatus()
      .then(status => {
        if (status.isAptManaged && status.updateAvailable) {
          setUpdateInfo(status);
        }
      })
      .catch(error => {
        log.api.error('Failed to check for updates', { error: error.message });
      });
  }, [navigate]);

  return (
    <div className="list row">
      <header>
        <h3 className="text-center">{t('admin.title')}</h3>
      </header>
      {updateInfo && <UpdateNotification updateInfo={updateInfo} />}
      <ul className="nav nav-tabs">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'organizations' ? 'active' : ''}`}
            onClick={() => setActiveTab('organizations')}
          >
            {t('admin.tabs.orgsAndUsers')}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            {t('admin.tabs.configManagement')}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => setActiveTab('system')}
          >
            {t('admin.tabs.system')}
          </button>
        </li>
      </ul>
      <div className="tab-content mt-2">
        {activeTab === 'organizations' && <OrganizationUserManager />}
        {activeTab === 'config' && <ConfigurationManager />}
        {activeTab === 'system' && <StorageInfo />}
      </div>
    </div>
  );
};

export default Admin;
