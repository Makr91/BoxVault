import React, { useState, useEffect } from "react";
import SetupService from "../services/setup.service";
import { useNavigate } from 'react-router-dom';
import { FaEye, FaEyeSlash } from "react-icons/fa6";

const SetupComponent = () => {
  const [configs, setConfigs] = useState({ db: {}, app: {}, auth: {}, mail: {} });
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupToken, setSetupToken] = useState('');
  const [authorizedSetupToken, setAuthorizedSetupToken] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('db');
  const [validationErrors, setValidationErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState({});
  const [isFormValid, setIsFormValid] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    SetupService.isSetupComplete().then(response => {
      setSetupComplete(response.data.setupComplete);
    }).catch(error => {
      console.error('Error checking setup status:', error);
    });
  }, []);

  const handleVerifyToken = () => {
    SetupService.verifySetupToken(setupToken).then(response => {
      setAuthorizedSetupToken(response.data.authorizedSetupToken);
      SetupService.getConfigs(response.data.authorizedSetupToken).then(response => {
        const newConfigs = response.data.configs;
        setConfigs(newConfigs);
        
        // Perform initial validation
        const errors = {};
        Object.keys(newConfigs).forEach(configName => {
          errors[configName] = {};
          const validateFields = (obj, path = []) => {
            Object.entries(obj).forEach(([key, value]) => {
              const currentPath = [...path, key];
              if (typeof value === 'object' && value !== null) {
                if ('type' in value && 'value' in value) {
                  errors[configName][currentPath.join(".")] = getValidationError(value.type, value.value);
                } else {
                  validateFields(value, currentPath);
                }
              }
            });
          };
          validateFields(newConfigs[configName]);
        });
        setValidationErrors(errors);
        updateFormValidity(errors);
      }).catch(error => {
        console.error('Error fetching configs:', error);
      });
    }).catch(error => {
      console.error('Error verifying setup token:', error);
      setMessage('Invalid setup token.');
    });
  };

  const handleConfigChange = (configName, path, value) => {
    setConfigs(prevConfigs => {
      const newConfigs = { ...prevConfigs };
      let current = newConfigs[configName];
      for (let i = 0; i < path.length - 1; i++) {
        if (current[path[i]] === null) {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
      if (current[path[path.length - 1]] === null) {
        current[path[path.length - 1]] = { value: value };
      } else {
        current[path[path.length - 1]].value = value;
      }
      return newConfigs;
    });
  
    validateField(configName, path, value);
  };

  const validateField = (configName, path, value) => {
    const field = path.reduce((acc, key) => acc && acc[key], configs[configName]);
    const error = field && field.type ? getValidationError(field.type, value) : "Invalid field structure";
  
    setValidationErrors(prevErrors => {
      const newErrors = { 
        ...prevErrors,
        [configName]: {
          ...prevErrors[configName],
          [path.join(".")]: error
        }
      };
      updateFormValidity(newErrors);
      return newErrors;
    });
  };

  const getValidationError = (type, value) => {
    if (value === null) {
      return "Value cannot be null.";
    }
  
    switch (type) {
      case 'url':
        try {
          new URL(value);
          return null;
        } catch {
          return "Invalid URL format.";
        }
      case 'host':
        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const fqdnRegex = /^(?!:\/\/)(?=.{1,255}$)((.{1,63}\.){1,127}(?![0-9]*$)[a-z0-9-]+\.?)$/i;
        if (ipRegex.test(value) || fqdnRegex.test(value)) {
          return null;
        }
        return "Invalid host. Must be a valid IP address or FQDN.";
      case 'integer':
        return Number.isInteger(Number(value)) ? null : "Value must be an integer.";
      case 'boolean':
        return typeof value === 'boolean' ? null : "Value must be a boolean.";
      case 'password':
        return value.length >= 6 ? null : "Password must be at least 6 characters.";
      case 'email':
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
        return emailRegex.test(value) ? null : "Invalid email address.";
      case 'port':
        const port = Number(value);
        return port >= 1 && port <= 65535 ? null : "Port must be between 1 and 65535.";
      case 'string':
        return value.trim() !== '' ? null : "Value cannot be empty.";
      default:
        return null;
    }
  };

  const updateFormValidity = (errors) => {
    const hasErrors = ['db', 'app', 'auth', 'mail'].some(configName => 
      Object.values(errors[configName] || {}).some(error => error !== null)
    );
    setIsFormValid(!hasErrors);
  };

  const handleSubmit = () => {
    if (!isFormValid) {
      setMessage('Please fix all validation errors before submitting.');
      return;
    }

    SetupService.updateConfigs(authorizedSetupToken, configs).then(() => {
      setMessage('Configuration updated successfully. Redirecting to registration page in 5 seconds...');
      
      // Set a 5-second delay before navigating
      setTimeout(() => {
        navigate('/register');
      }, 5000);
    }).catch(error => {
      console.error('Error updating configuration:', error);
      setMessage('Failed to update configuration.');
    });
  };

  const renderConfigFields = (configName) => {
    const renderFields = (obj, path = []) => {
      return Object.keys(obj).map((key) => {
        const currentPath = [...path, key];
        const entry = obj[key];
        const errorKey = currentPath.join(".");
        const error = validationErrors[configName] && validationErrors[configName][errorKey];
  
        if (typeof entry === 'object' && entry !== null && !('type' in entry && 'value' in entry)) {
          return (
            <div key={errorKey} className="col-md-6 mb-3">
              <div className="card">
                <div className="card-header">
                  <h5>{key}</h5>
                </div>
                <div className="card-body">
                  {renderFields(entry, currentPath)}
                </div>
              </div>
            </div>
          );
        } else {
          const { type, value, description } = entry;
          const inputValue = value === null || value === undefined ? '' : value; // Handle null and undefined
  
          return (
            <div className="form-group" key={errorKey}>
              <label>{key}</label>
              {type === 'password' ? (
                <div className="input-group">
                  <input
                    type={showPasswords[errorKey] ? "text" : "password"}
                    className={`form-control ${error ? 'is-invalid' : ''}`}
                    value={inputValue}
                    onChange={e => handleConfigChange(configName, currentPath, e.target.value)}
                  />
                  <button 
                    className="btn btn-outline-secondary" 
                    type="button"
                    onClick={() => setShowPasswords(prev => ({...prev, [errorKey]: !prev[errorKey]}))}
                  >
                    {showPasswords[errorKey] ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  className={`form-control ${error ? 'is-invalid' : ''}`}
                  value={inputValue}
                  onChange={e => handleConfigChange(configName, currentPath, e.target.value)}
                />
              )}
              <small className="form-text text-muted">{description}</small>
              {error && <div className="invalid-feedback">{error}</div>}
            </div>
          );
        }
      });
    };
  
    return renderFields(configs[configName]);
  };

  useEffect(() => {
    if (authorizedSetupToken) {
      SetupService.getConfigs(authorizedSetupToken).then(response => {
        console.log("Fetched configs:", response.data.configs);
        setConfigs(response.data.configs);
      }).catch(error => {
        console.error('Error fetching configs:', error);
      });
    }
  }, [authorizedSetupToken]);

  return (
    <div className="container mt-5">
      <h2 className="text-center mb-4">BoxVault Setup</h2>
      {setupComplete ? (
        <div className="alert alert-success" role="alert">
          Setup is already complete. You can now use BoxVault.
        </div>
      ) : (
        <>
          {!authorizedSetupToken ? (
            <div className="card">
              <div className="card-body">
                <h5 className="card-title">Enter Setup Token</h5>
                <div className="input-group mb-3">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Setup Token"
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={handleVerifyToken}>
                    Verify Token
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <ul className="nav nav-tabs mb-4 d-flex">
                {['db', 'app', 'auth', 'mail'].map((configName) => (
                  <li className="nav-item" key={configName}>
                    <button
                      className={`nav-link ${activeTab === configName ? 'active' : ''} ${
                        !validationErrors[configName] || Object.values(validationErrors[configName]).every(error => error === null)
                          ? 'text-success'
                          : ''
                      }`}
                      onClick={() => setActiveTab(configName)}
                    >
                      {configName.charAt(0).toUpperCase() + configName.slice(1)} Config
                    </button>
                  </li>
                ))}
                <li className="nav-item ms-auto">
                  <button
                    type="button"
                    className={`nav-link ${!isFormValid ? 'disabled' : ''}`}
                    onClick={handleSubmit}
                    disabled={!isFormValid}
                    style={{ cursor: isFormValid ? 'pointer' : 'not-allowed' }}
                  >
                    Submit All Configurations
                  </button>
                </li>
              </ul>
  
              <div className="tab-content">
                {['db', 'app', 'auth', 'mail'].map((configName) => (
                  <div
                    key={configName}
                    className={`tab-pane ${activeTab === configName ? 'active' : ''}`}
                  >
                    <div className="row">
                      {renderConfigFields(configName)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
  
          {message && (
            <div className="alert alert-info mt-3" role="alert">
              {message}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SetupComponent;