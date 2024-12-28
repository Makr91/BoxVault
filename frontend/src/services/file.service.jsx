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
      // Set up chunked upload
      const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      let uploadedBytes = 0;
      let currentChunk = 0;

      // Process chunks sequentially
      while (currentChunk < totalChunks) {
        const start = currentChunk * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        
        // Get chunk data without loading entire file
        const chunk = file.slice(start, end);

        // Set up headers for this chunk
        const headers = {
          ...authHeader(),
          'Content-Type': 'application/octet-stream',
          'Content-Length': (end - start).toString(),
          'X-File-Name': file.name,
          'X-Checksum': checksum || '',
          'X-Checksum-Type': checksumType || 'NULL',
          'X-Chunk-Index': currentChunk.toString(),
          'X-Total-Chunks': totalChunks.toString()
        };

        // Upload chunk
        const response = await fetch(
          `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`,
          {
            method: 'POST',
            headers,
            body: chunk,
            duplex: 'half'
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Chunk upload failed: ${response.statusText}. ${errorText}`);
        }

        const result = await response.json();
        
        // Update progress
        uploadedBytes += (end - start);
        if (onUploadProgress) {
          onUploadProgress({
            loaded: uploadedBytes,
            total: file.size,
            progress: Math.round((uploadedBytes / file.size) * 100)
          });
        }

        // Check if upload is complete
        if (result.details.isComplete) {
          // Verify upload success
          const fileInfo = await this.info(organization, name, version, provider, architecture);
          const fileSize = fileInfo.data?.fileSize || fileInfo.fileSize;
          
          if (typeof fileSize !== 'number') {
            console.error('Invalid file info response:', fileInfo);
            throw new Error('Unable to verify upload: File size not found in response');
          }

          const sizeDiff = Math.abs(file.size - fileSize);
          const maxDiff = Math.max(1024 * 1024, file.size * 0.01); // Allow 1MB or 1% difference
          
          if (sizeDiff > maxDiff) {
            console.error('Size mismatch:', {
              originalSize: file.size,
              uploadedSize: fileSize,
              difference: sizeDiff,
              maxAllowedDiff: maxDiff
            });
            throw new Error(`Upload size mismatch: Expected ${file.size} bytes but got ${fileSize} bytes`);
          }

          return result;
        }

        currentChunk++;
      }

      throw new Error('Upload failed: Final chunk response not received');
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
