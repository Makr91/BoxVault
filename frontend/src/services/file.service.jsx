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
      // Create ReadableStream from file
      const stream = file.stream();
      const reader = stream.getReader();

      // Track upload progress
      let uploadedBytes = 0;
      const progressStream = new TransformStream({
        transform(chunk, controller) {
          uploadedBytes += chunk.length;
          const progress = Math.round((uploadedBytes / file.size) * 100);
          
          if (onUploadProgress) {
            onUploadProgress({
              loaded: uploadedBytes,
              total: file.size,
              progress
            });
          }
          
          controller.enqueue(chunk);
        }
      });

      // Create headers with auth token and metadata
      const headers = {
        ...authHeader(),
        'Content-Type': 'application/octet-stream',
        'Content-Length': file.size.toString(),
        'X-File-Name': file.name,
        'X-Checksum': checksum || '',
        'X-Checksum-Type': checksumType || 'NULL'
      };

      // Stream the file directly to the server
      const response = await fetch(
        `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`,
        {
          method: 'POST',
          headers,
          body: stream.pipeThrough(progressStream),
          duplex: 'half' // Required for streaming request body
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Verify upload success
      const fileInfo = await this.info(organization, name, version, provider, architecture);
      const sizeDiff = Math.abs(file.size - fileInfo.data.fileSize) / file.size;
      
      if (sizeDiff > 0.01) { // Allow 1% difference for filesystem variations
        throw new Error('Upload size mismatch');
      }

      return {
        message: 'File upload completed',
        details: {
          isComplete: true,
          status: 'complete',
          fileSize: fileInfo.data.fileSize
        }
      };
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
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
