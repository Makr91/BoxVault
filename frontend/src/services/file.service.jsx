import axios from "axios";
import authHeader from "./auth-header";
import AuthService from './auth.service';

const baseURL = window.location.origin;

class FileService {
  async upload(file, organization, name, version, provider, architecture, checksum, checksumType, onUploadProgress) {
    if (!file) {
      throw new Error('No file provided');
    }

    console.log('Starting file upload:', {
      fileName: file.name,
      fileSize: file.size,
      checksum: checksum || 'none',
      checksumType: checksumType || 'NULL'
    });

    try {
      // Set up headers with auth token and metadata
      const headers = {
        ...authHeader(),
        'Content-Type': 'application/octet-stream',
        'Content-Length': file.size.toString(),
        'X-File-Name': file.name,
        'X-Checksum': checksum || '',
        'X-Checksum-Type': checksumType || 'NULL'
      };

      // Set up upload progress tracking
      let uploadedBytes = 0;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`);
      
      // Set headers
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      // Track upload progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onUploadProgress) {
          uploadedBytes = event.loaded;
          onUploadProgress({
            loaded: event.loaded,
            total: event.total,
            progress: Math.round((event.loaded / event.total) * 100)
          });
        }
      };

      // Handle the upload using a Promise
      const response = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({
              ok: true,
              status: xhr.status,
              statusText: xhr.statusText,
              json: () => Promise.resolve(JSON.parse(xhr.responseText))
            });
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.statusText}. ${errorText}`);
      }

      const result = await response.json();

      // Verify upload success
      const fileInfo = await this.info(organization, name, version, provider, architecture);
      const fileSize = fileInfo.data?.fileSize || fileInfo.fileSize;
      
      if (typeof fileSize !== 'number') {
        console.error('Invalid file info response:', fileInfo);
        throw new Error('Unable to verify upload: File size not found in response');
      }

      const sizeDiff = Math.abs(file.size - fileSize);
      const maxDiff = Math.max(1024 * 1024, file.size * 0.01); // Allow 1MB or 1% difference, whichever is larger
      
      if (sizeDiff > maxDiff) {
        console.error('Size mismatch:', {
          originalSize: file.size,
          uploadedSize: fileSize,
          difference: sizeDiff,
          maxAllowedDiff: maxDiff
        });
        throw new Error(`Upload size mismatch: Expected ${file.size} bytes but got ${fileSize} bytes`);
      }

      return {
        message: 'File upload completed',
        details: {
          isComplete: true,
          status: 'complete',
          fileSize: fileSize
        }
      };
    } catch (error) {
      console.error('Upload failed:', {
        error,
        fileName: file.name,
        fileSize: file.size,
        type: file.type,
        lastModified: new Date(file.lastModified).toISOString()
      });
      
      // Add more context to the error
      if (error.name === 'TypeError' && error.message.includes('locked')) {
        throw new Error('Upload failed: Stream handling error. Please try again.');
      } else {
        throw error;
      }
    }
  }

  async getDownloadLink(organization, name, version, provider, architecture) {
    try {
      // First check if the box is public
      const boxResponse = await axios.get(
        `${baseURL}/api/organization/${organization}/box/${name}`,
        { headers: authHeader() }
      );
      
      // Send auth header only if box is private
      const headers = boxResponse.data.isPublic ? {} : authHeader();
      
      const response = await axios.post(
        `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/get-download-link`,
        {},
        { headers }
      );
      return response.data.downloadUrl;
    } catch (error) {
      console.error('Error getting download link:', error);
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
