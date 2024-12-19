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
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        // Log upload attempt
        console.log(`Upload attempt ${retryCount + 1}/${maxRetries}`, {
          fileName: file.name,
          fileSize: file.size,
          organization,
          provider,
          architecture
        });

        const response = await axios.post(
          `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`, 
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
              ...authHeader()
            },
            onUploadProgress: (progressEvent) => {
              if (onUploadProgress) {
                // Log detailed progress
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                console.log('Upload progress:', {
                  loaded: progressEvent.loaded,
                  total: progressEvent.total,
                  percent: `${percent}%`
                });
                onUploadProgress(progressEvent);
              }
            },
            // Prevent axios from automatically retrying
            maxRedirects: 0,
            // Increase timeout for large files
            timeout: 24 * 60 * 60 * 1000, // 24 hours
            // Disable response timeout
            timeoutErrorMessage: 'Upload timed out - please try again'
          }
        );

        // Log successful upload
        console.log('Upload completed successfully:', {
          fileName: file.name,
          fileSize: file.size,
          attempts: retryCount + 1
        });

        return response;
      } catch (error) {
        lastError = error;
        console.error(`Upload attempt ${retryCount + 1} failed:`, {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data
        });

        if (error.response?.status === 401 && retryCount < maxRetries - 1) {
          // Try to refresh the token
          console.log('Attempting to refresh auth token...');
          const newUserData = await AuthService.refreshUserData();
          if (!newUserData) {
            throw new Error('Failed to refresh authentication');
          }
          console.log('Auth token refreshed successfully');
        } else if (error.code === 'ECONNABORTED' && retryCount < maxRetries - 1) {
          // Handle timeout specifically
          console.log('Upload timed out, will retry...');
        } else if (retryCount === maxRetries - 1) {
          // Last attempt failed
          console.error('All upload attempts failed:', {
            attempts: maxRetries,
            finalError: error.message
          });
          throw error;
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        retryCount++;
      }
    }

    // If we get here, all retries failed
    throw lastError;
  }

  download(organization, name, version, provider, architecture) {
    return axios.get(
      `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file`, 
      { 
        headers: authHeader(),
        timeout: 30 * 60 * 1000 // 30 minute timeout for downloads
      }
    );
  }

  info(organization, name, version, provider, architecture) {
    return axios.get(
      `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/info`, 
      { headers: authHeader() }
    );
  }

  delete(organization, name, version, provider, architecture) {
    return axios.delete(
      `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/delete`, 
      { headers: authHeader() }
    );
  }
}

export default new FileService();
