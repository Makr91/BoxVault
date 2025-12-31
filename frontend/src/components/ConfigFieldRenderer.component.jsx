import PropTypes from "prop-types";
import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa6";

/**
 * ConfigFieldRenderer - Renders individual configuration fields with appropriate input types
 */
const ConfigFieldRenderer = ({ field, currentValue, onFieldChange }) => {
  const [showPasswords, setShowPasswords] = useState({});

  const fieldProps = {
    key: field.path,
    value: currentValue || "",
    onChange: (e) => {
      const value =
        field.type === "boolean" ? e.target.checked : e.target.value;
      onFieldChange(field.path, value);
    },
    placeholder: field.placeholder,
    required: field.required,
  };

  const togglePasswordVisibility = (path) => {
    setShowPasswords((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const renderInputElement = () => {
    switch (field.type) {
      case "boolean":
        return (
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              checked={!!currentValue}
              onChange={fieldProps.onChange}
            />
            <label className="form-check-label">{field.label}</label>
          </div>
        );
      case "select":
        return (
          <select className="form-select" {...fieldProps}>
            {field.options
              ? field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))
              : null}
          </select>
        );
      case "password":
        return (
          <div className="input-group">
            <input
              type={showPasswords[field.path] ? "text" : "password"}
              className="form-control"
              {...fieldProps}
            />
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => togglePasswordVisibility(field.path)}
            >
              {showPasswords[field.path] ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
        );
      case "textarea":
        return <textarea className="form-control" {...fieldProps} rows={3} />;
      case "array": {
        const arrayValue = Array.isArray(currentValue)
          ? currentValue.join(",")
          : currentValue || "";
        return (
          <input
            type="text"
            className="form-control"
            value={arrayValue}
            onChange={(e) =>
              onFieldChange(field.path, e.target.value.split(","))
            }
            placeholder="Comma-separated values"
          />
        );
      }
      default:
        return <input type="text" className="form-control" {...fieldProps} />;
    }
  };

  return (
    <div className="mb-3" key={field.path}>
      {field.type !== "boolean" ? (
        <label className="form-label" htmlFor={field.path}>
          {field.label}
        </label>
      ) : null}
      {renderInputElement()}
      {field.description ? (
        <div className="form-text">{field.description}</div>
      ) : null}
    </div>
  );
};

ConfigFieldRenderer.propTypes = {
  field: PropTypes.shape({
    path: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    label: PropTypes.string,
    description: PropTypes.string,
    placeholder: PropTypes.string,
    required: PropTypes.bool,
    options: PropTypes.arrayOf(PropTypes.string),
    value: PropTypes.any,
  }).isRequired,
  currentValue: PropTypes.any,
  onFieldChange: PropTypes.func.isRequired,
};

export default ConfigFieldRenderer;
