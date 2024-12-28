import axios from "axios";
import authHeader from "./auth-header";
import AuthService from './auth.service';

const baseURL = window.location.origin;

class FileService {
  async upload(file, organization, name, version, provider, architecture, checksum, checksumType, onUploadProgress) {
    if (!file) {
      throw new Error('No file provided');
    }

    // Generate a unique file ID for this upload
    const fileId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let uploadedChunks = new Set();
    let lastProgress = 0;
    const maxRetries = 3;
    const maxConcurrentChunks = 2; // Reduced from 3 to prevent overwhelming
    const chunkTimeout = 15 * 60 * 1000; // 15 minute timeout per chunk

    console.log('Starting chunked upload:', {
      fileId,
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
      chunkSize: CHUNK_SIZE,
      checksum: checksum || 'none',
      checksumType: checksumType || 'NULL'
    });

    // Function to upload a single chunk
    const uploadChunk = async (chunkIndex, retryCount = 0) => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      const formData = new FormData();
      // Add chunk metadata first
      formData.append('fileId', fileId);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('totalChunks', totalChunks.toString());
      formData.append('checksum', checksum || '');
      formData.append('checksumType', checksumType || 'NULL');
      // Add file chunk last to ensure metadata is read first
      formData.append('file', chunk, file.name);

      try {
        const response = await axios.post(
          `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`,
          formData,
          {
            headers: {
              ...authHeader(),
              'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
              'x-file-id': fileId,
              'x-chunk-index': chunkIndex.toString(),
              'x-total-chunks': totalChunks.toString()
            },
            timeout: chunkTimeout,
            maxContentLength: CHUNK_SIZE * 2,
            maxBodyLength: CHUNK_SIZE * 2,
            onUploadProgress: (progressEvent) => {
              // Track individual chunk progress
              if (progressEvent.total) {
                const chunkProgress = (progressEvent.loaded / progressEvent.total) * 100;
                console.log(`Chunk ${chunkIndex} progress: ${Math.round(chunkProgress)}%`);
              }
            },
            validateStatus: (status) => status >= 200 && status < 300
          }
        );

        uploadedChunks.add(chunkIndex);
        
        // Calculate overall progress
        const totalProgress = Math.round((uploadedChunks.size / totalChunks) * 100);
        if (totalProgress > lastProgress) {
          lastProgress = totalProgress;
          if (onUploadProgress) {
            onUploadProgress({
              loaded: uploadedChunks.size * CHUNK_SIZE,
              total: file.size,
              progress: totalProgress
            });
          }
        }

        return response.data;
      } catch (error) {
        console.error(`Chunk ${chunkIndex} upload failed:`, error);
        
        if (retryCount < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          return uploadChunk(chunkIndex, retryCount + 1);
        }
        
        throw error;
      }
    };

    try {
      // Upload chunks with reduced concurrency
      const chunks = Array.from({ length: totalChunks }, (_, i) => i);
      let lastResult;
      
      // Process chunks in smaller batches
      for (let i = 0; i < chunks.length; i += maxConcurrentChunks) {
        const chunkBatch = chunks.slice(i, Math.min(i + maxConcurrentChunks, chunks.length));
        const results = await Promise.all(chunkBatch.map(chunkIndex => uploadChunk(chunkIndex)));
        lastResult = results[results.length - 1];
        
        // Check if this batch completed the upload
        if (lastResult.details?.isComplete) {
          console.log('Upload completed successfully:', {
            fileId,
            totalChunks,
            uploadedChunks: uploadedChunks.size,
            response: lastResult
          });
          return lastResult;
        }

        // Small delay between batches to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // If we get here and have all chunks but no completion signal, consider it successful
      if (uploadedChunks.size === totalChunks) {
        console.log('Upload completed (all chunks received):', {
          fileId,
          totalChunks,
          uploadedChunks: uploadedChunks.size,
          response: lastResult
        });
        return lastResult;
      }

      throw new Error('Upload did not complete successfully');
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
