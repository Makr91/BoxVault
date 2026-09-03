import axios from 'axios';

const API_URL = '/api/setup';

const verifySetupToken = token => axios.post(`${API_URL}/verify-token`, { token });

const getConfigs = token =>
  axios.get(API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

const updateConfigs = (token, configs) =>
  axios.put(
    API_URL,
    { configs },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

const isSetupComplete = () => axios.get(`${API_URL}/status`);

const uploadSSL = (token, file) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(`${API_URL}/upload-ssl`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }).then(response => {
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
    return response.json();
  });
};

export default {
  verifySetupToken,
  getConfigs,
  updateConfigs,
  isSetupComplete,
  uploadSSL,
};
