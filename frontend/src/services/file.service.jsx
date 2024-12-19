import axios from "axios";
import authHeader from "./auth-header";
import AuthService from './auth.service';

const baseURL = window.location.origin;

class FileService {
  async upload(file, organization, name, version, provider, architecture, checksum, checksumType, onUploadProgress) {
    let formData = new FormData();
    formData.append("file", file);
    formData.append("checksum", checksum);
    formData.append("checksumType", checksumType);

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        return await axios.post(
          `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`, 
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
              ...authHeader()
            },
            onUploadProgress,
            // Prevent axios from automatically retrying
            maxRedirects: 0,
            // Increase timeout for large files
            timeout: 24 * 60 * 60 * 1000 // 24 hours
          }
        );
      } catch (error) {
        if (error.response?.status === 401 && retryCount < maxRetries - 1) {
          // Try to refresh the token
          const newUserData = await AuthService.refreshUserData();
          if (!newUserData) {
            throw new Error('Failed to refresh authentication');
          }
          retryCount++;
          continue;
        }
        throw error;
      }
    }
  }

  download(organization, name, version, provider, architecture) {
    return axios.get(`${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file`, { headers: authHeader() });
  }

  info(organization, name, version, provider, architecture) {
    return axios.get(`${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/info`, { headers: authHeader() });
  }

  delete(organization, name, version, provider, architecture) {
    return axios.delete(`${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/delete`, { headers: authHeader() });
  }
}

const fileServiceInstance = new FileService();

export default fileServiceInstance;
