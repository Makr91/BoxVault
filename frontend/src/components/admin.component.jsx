import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import AuthService from "../services/auth.service";

import ConfigurationManager from "./ConfigurationManager.component";
import OrganizationUserManager from "./OrganizationUserManager.component";
import StorageInfo from "./StorageInfo.component";

/**
 * Admin - Main admin panel component
 * Provides authentication guard and tab management for admin features
 */
const Admin = () => {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = t("admin.pageTitle");
  }, [t]);

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("organizations");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  // Authentication guard - redirect if not authenticated or not admin
  useEffect(() => {
    const currentUser = AuthService.getCurrentUser();

    if (!currentUser) {
      // Not authenticated, redirect to login
      navigate("/login");
      return;
    }

    if (!currentUser.roles || !currentUser.roles.includes("ROLE_ADMIN")) {
      // Authenticated but not admin, redirect to home
      navigate("/");
    }
  }, [navigate]);

  return (
    <div className="list row">
      <header>
        <h3 className="text-center">{t("admin.title")}</h3>
      </header>
      <ul className="nav nav-tabs">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "organizations" ? "active" : ""}`}
            onClick={() => setActiveTab("organizations")}
          >
            {t("admin.tabs.orgsAndUsers")}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "config" ? "active" : ""}`}
            onClick={() => setActiveTab("config")}
          >
            {t("admin.tabs.configManagement")}
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === "system" ? "active" : ""}`}
            onClick={() => setActiveTab("system")}
          >
            {t("admin.tabs.system")}
          </button>
        </li>
      </ul>
      <div className="tab-content mt-2">
        {message && (
          <div className={`alert alert-${messageType}`} role="alert">
            {message}
          </div>
        )}
        {activeTab === "organizations" && (
          <OrganizationUserManager
            setMessage={setMessage}
            setMessageType={setMessageType}
          />
        )}
        {activeTab === "config" && (
          <ConfigurationManager
            setMessage={setMessage}
            setMessageType={setMessageType}
          />
        )}
        {activeTab === "system" && <StorageInfo />}
      </div>
    </div>
  );
};

export default Admin;
