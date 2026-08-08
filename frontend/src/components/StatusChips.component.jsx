import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const StatusChips = ({ status, visibility, osLabel, deprecated }) => {
  const { t } = useTranslation();

  return (
    <>
      {status && (
        <span
          className={`badge ${status === "published" ? "bg-success" : "bg-warning"}`}
        >
          {status === "published"
            ? t("box.organization.status.published")
            : t("box.organization.status.pending")}
        </span>
      )}
      {visibility && (
        <span
          className={`badge ${visibility === "public" ? "bg-info" : "bg-secondary"}`}
        >
          {visibility === "public"
            ? t("box.organization.visibility.public")
            : t("box.organization.visibility.private")}
        </span>
      )}
      {osLabel && <span className="badge badge-os">{osLabel}</span>}
      {deprecated && (
        <span className="badge bg-danger">{t("version.deprecated")}</span>
      )}
    </>
  );
};

StatusChips.propTypes = {
  status: PropTypes.oneOf(["published", "pending"]),
  visibility: PropTypes.oneOf(["public", "private"]),
  osLabel: PropTypes.string,
  deprecated: PropTypes.bool,
};

export default StatusChips;
