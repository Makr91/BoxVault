import PropTypes from 'prop-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaEye, FaEyeSlash } from 'react-icons/fa6';

export const configFieldShape = PropTypes.shape({
  path: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  label: PropTypes.string,
  description: PropTypes.string,
  placeholder: PropTypes.string,
  required: PropTypes.bool,
  options: PropTypes.arrayOf(PropTypes.string),
  value: PropTypes.any,
  upload: PropTypes.bool,
});

const UploadInput = ({ field, currentValue, onFieldChange, onUpload }) => {
  const { t } = useTranslation();
  return (
    <div className="mb-3">
      <label className="form-label" htmlFor={field.path}>
        {field.label}
        {field.required && <span className="text-danger">*</span>}
      </label>
      <div className="input-group">
        <input
          id={field.path}
          type="text"
          className="form-control"
          value={currentValue}
          onChange={e => onFieldChange(field.path, e.target.value)}
          placeholder={field.placeholder}
        />
        <label className="btn btn-outline-secondary">
          {t('admin.buttons.upload')}
          <input type="file" hidden onChange={e => onUpload(e.target.files[0], currentValue)} />
        </label>
      </div>
      <small className="form-text text-muted">{field.description}</small>
    </div>
  );
};

UploadInput.propTypes = {
  field: configFieldShape.isRequired,
  currentValue: PropTypes.any,
  onFieldChange: PropTypes.func.isRequired,
  onUpload: PropTypes.func.isRequired,
};

/**
 * One configuration field drawn by its type: checkbox, select, password
 * with a reveal, textarea, comma-separated array, text, or a text input
 * with an upload button when the field carries `upload` and the caller
 * hands an `onUpload`.
 */
const ConfigField = ({ field, currentValue, onFieldChange, onUpload = null }) => {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  if (field.upload && onUpload) {
    return (
      <UploadInput
        field={field}
        currentValue={currentValue}
        onFieldChange={onFieldChange}
        onUpload={onUpload}
      />
    );
  }

  const fieldProps = {
    id: field.path,
    value: currentValue || '',
    onChange: e => {
      const value = field.type === 'boolean' ? e.target.checked : e.target.value;
      onFieldChange(field.path, value);
    },
    placeholder: field.placeholder,
    required: field.required,
  };

  const renderInputElement = () => {
    switch (field.type) {
      case 'boolean':
        return (
          <div className="form-check">
            <input
              id={field.path}
              type="checkbox"
              className="form-check-input"
              checked={!!currentValue}
              onChange={fieldProps.onChange}
            />
            <label className="form-check-label" htmlFor={field.path}>
              {field.label}
            </label>
          </div>
        );
      case 'select':
        return (
          <select className="form-select" {...fieldProps}>
            {field.options
              ? field.options.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))
              : null}
          </select>
        );
      case 'password':
        return (
          <div className="input-group">
            <input
              type={showPassword ? 'text' : 'password'}
              className="form-control"
              {...fieldProps}
            />
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => setShowPassword(current => !current)}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
        );
      case 'textarea':
        return <textarea className="form-control" {...fieldProps} rows={3} />;
      case 'array': {
        const arrayValue = Array.isArray(currentValue)
          ? currentValue.join(',')
          : currentValue || '';
        return (
          <input
            id={field.path}
            type="text"
            className="form-control"
            value={arrayValue}
            onChange={e => onFieldChange(field.path, e.target.value.split(','))}
            placeholder={t('configField.commaSeparated')}
          />
        );
      }
      default:
        return <input type="text" className="form-control" {...fieldProps} />;
    }
  };

  return (
    <div className="mb-3">
      {field.type !== 'boolean' ? (
        <label className="form-label" htmlFor={field.path}>
          {field.label}
        </label>
      ) : null}
      {renderInputElement()}
      {field.description ? <div className="form-text">{field.description}</div> : null}
    </div>
  );
};

ConfigField.propTypes = {
  field: configFieldShape.isRequired,
  currentValue: PropTypes.any,
  onFieldChange: PropTypes.func.isRequired,
  onUpload: PropTypes.func,
};

export default ConfigField;
