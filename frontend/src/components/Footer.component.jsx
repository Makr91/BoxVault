import { useState, useEffect } from "react";
import { OverlayTrigger, Popover } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { FaHeartPulse, FaCircle } from "react-icons/fa6";

const Footer = () => {
  const { t } = useTranslation(["common", "auth"]);
  const [health, setHealth] = useState({ status: "loading", services: {} });

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) {
          throw new Error("Health check failed");
        }
        const data = await response.json();
        setHealth(data);
      } catch {
        setHealth({ status: "error", services: {} });
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 60000); // Refresh every 60 seconds

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case "ok":
        return "text-success";
      case "error":
        return "text-danger";
      default:
        return "text-warning";
    }
  };

  const renderPopover = (props) => {
    const overallStatus =
      health.status === "ok" &&
      Object.values(health.services).every((s) => s === "ok")
        ? "ok"
        : "error";

    return (
      <Popover id="health-popover" {...props}>
        <Popover.Header as="h3">{t("footer.health.status")}</Popover.Header>
        <Popover.Body>
          <div className="mb-2">
            <FaCircle className={`me-2 ${getStatusColor(overallStatus)}`} />
            {t(`footer.health.${overallStatus}`)}
          </div>
          {Object.entries(health.services).map(([service, status]) => (
            <div key={service} className="mb-1">
              <FaCircle className={`me-2 ${getStatusColor(status)}`} />
              {t(`footer.health.${service}`)}: {status}
            </div>
          ))}
        </Popover.Body>
      </Popover>
    );
  };

  const getOverallStatusColor = () => {
    if (health.status === "loading") {
      return "text-muted";
    }
    if (
      health.status !== "ok" ||
      Object.values(health.services).some((s) => s !== "ok")
    ) {
      return "text-danger";
    }
    return "text-success";
  };

  return (
    <footer className="footer mt-auto py-3 bg-body-tertiary border-top">
      <div className="container-fluid position-relative d-flex align-items-center">
        {/* Left: Copyright */}
        <div className="position-absolute start-0 ms-4">
          <span className="text-muted">
            BoxVault &copy; {new Date().getFullYear()}
          </span>
        </div>

        {/* Center: Powered By */}
        <div className="mx-auto d-flex align-items-center">
          <span className="text-muted me-2">{t("auth:login.poweredBy")}</span>
          <a
            href="https://startcloud.com"
            target="_blank"
            className="text-decoration-none d-flex align-items-center"
            rel="noreferrer"
          >
            <img
              src="https://startcloud.com/assets/images/logos/startcloud-logo40.png"
              alt="STARTcloud"
              height="20"
              className="me-2"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
            <span className="text-muted">
              {t("auth:login.poweredByCompany")}
            </span>
          </a>
        </div>

        {/* Right: System Status Icon */}
        <div className="position-absolute end-0 me-4">
          <OverlayTrigger
            placement="top"
            delay={{ show: 250, hide: 400 }}
            overlay={renderPopover}
          >
            <div className="d-flex align-items-center cursor-pointer">
              <FaHeartPulse className={`fs-5 ${getOverallStatusColor()}`} />
            </div>
          </OverlayTrigger>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
