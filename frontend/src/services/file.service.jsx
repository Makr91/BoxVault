import axios from "axios";
import authHeader from "./auth-header";
import AuthService from './auth.service';

const baseURL = window.location.origin;

class FileService {
  async upload(file, organization, name, version, provider, architecture, checksum, checksumType, onUploadProgress) {
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }

    // Log initial upload details
    console.log('Starting upload process:', {
      fileName: file.name,
      fileSize: file.size,
      checksum: checksum || 'none',
      checksumType: checksumType || 'NULL',
      organization,
      provider,
      architecture
    });

    const maxRetries = 3;
    const formData = new FormData();
    let retryCount = 0;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        // Clear any existing data
        formData.delete('file');
        formData.delete('checksum');
        formData.delete('checksumType');

        // Add file with original name
        formData.append('file', file);
        
        // Add metadata
        formData.append('checksum', checksum || '');
        formData.append('checksumType', checksumType || 'NULL');

        // Verify form data
        for (let [key, value] of formData.entries()) {
          console.log('Form data entry:', {
            field: key,
            value: key === 'file' ? `File: ${value.name}` : value
          });
        }

        // Log form data contents
        console.log('Form data prepared:', {
          fileName: file.name,
          fileSize: file.size,
          fields: Array.from(formData.entries()).map(([key]) => key)
        });

        // Log retry attempt
        console.log(`Upload attempt ${retryCount + 1}/${maxRetries}`, {
          fileName: file.name,
          fileSize: file.size,
          attempt: retryCount + 1,
          totalAttempts: maxRetries
        });

        const response = await axios.post(
          `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`, 
          formData,
          {
            // Configure axios for upload
            headers: authHeader(),
            onUploadProgress: (progressEvent) => {
              // Track total bytes including previous chunks
              const loaded = progressEvent.loaded || 0;
              const total = progressEvent.total || file.size;
              
              // Calculate actual progress
              const percent = Math.round((loaded * 100) / total);
              
              // Log detailed progress
              console.log('Upload progress:', {
                loaded,
                total,
                percent: `${percent}%`,
                rate: progressEvent.rate ? `${Math.round(progressEvent.rate / 1024 / 1024 * 100) / 100} MB/s` : 'calculating...'
              });
              
              // Call the progress callback with the calculated values
              if (onUploadProgress) {
                onUploadProgress({
                  loaded,
                  total,
                  progress: percent
                });
              }
            },
            timeout: 24 * 60 * 60 * 1000, // 24 hour timeout
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            // Ensure proper chunking for large files
            maxChunkSize: 5 * 1024 * 1024, // 5MB chunks
            validateStatus: (status) => status >= 200 && status < 300
          }
        );

        // Log response
        console.log('Upload response:', {
          status: response.status,
          data: response.data,
          headers: response.headers
        });

        // Log successful upload
        console.log('Upload completed successfully:', {
          fileName: file.name,
          fileSize: file.size,
          attempts: retryCount + 1,
          response: response.data
        });

        return response.data;
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

  async download(organization, name, version, provider, architecture) {
    try {
      const response = await fetch(
        `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/download`,
        {
          headers: authHeader()
        }
      );
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'vagrant.box');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
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
