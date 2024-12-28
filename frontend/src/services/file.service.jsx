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
      
      // Upload all chunks with retries for missing ones
      let attempt = 0;
      const maxAttempts = 3;
      
      while (attempt < maxAttempts) {
        // Process chunks sequentially
        for (let i = 0; i < chunks.length; i++) {
          // Skip already uploaded chunks
          if (uploadedChunks.has(i)) {
            continue;
          }

          try {
            lastResult = await uploadChunk(i);
            
            // Log progress after each chunk
            console.log('Chunk upload progress:', {
              chunk: i,
              totalChunks: chunks.length,
              uploadedChunks: uploadedChunks.size,
              remaining: chunks.length - uploadedChunks.size,
              attempt: attempt + 1
            });

            if (lastResult.details?.isComplete) {
              console.log('Upload completed successfully:', {
                fileId,
                totalChunks,
                uploadedChunks: uploadedChunks.size,
                response: lastResult
              });
              return lastResult;
            }
          } catch (error) {
            console.error(`Failed to upload chunk ${i} (attempt ${attempt + 1}/${maxAttempts}):`, error);
          }

          // Small delay between chunks
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Check if we have all chunks
        if (uploadedChunks.size === chunks.length) {
          break;
        }

        // If we're missing chunks, wait longer before retrying
        console.log('Missing chunks, retrying...', {
          attempt: attempt + 1,
          maxAttempts,
          missingChunks: chunks.filter(i => !uploadedChunks.has(i))
        });
        
        attempt++;
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
        }
      }

      if (uploadedChunks.size !== chunks.length) {
        throw new Error(`Failed to upload all chunks after ${maxAttempts} attempts`);
      }

      // If we get here and have all chunks, check if assembly is in progress
      if (uploadedChunks.size === totalChunks && lastResult?.details?.status === 'assembling') {
        console.log('Assembly in progress, polling for completion...');
        
        // Keep polling the file info endpoint until assembly is complete
        while (true) {
          try {
            const fileInfo = await this.info(organization, name, version, provider, architecture);
            
            // Update progress to show assembly status
            if (onUploadProgress) {
              onUploadProgress({
                loaded: file.size,
                total: file.size,
                progress: 100,
                status: 'assembling'
              });
            }

            // Only consider assembly complete if we have a file size
            // and it matches what we uploaded (within 1% to account for any filesystem differences)
            if (fileInfo.data.fileSize) {
              const sizeDiff = Math.abs(file.size - fileInfo.data.fileSize) / file.size;
              if (sizeDiff <= 0.01) {
                console.log('Assembly completed successfully:', {
                  expectedSize: file.size,
                  actualSize: fileInfo.data.fileSize,
                  difference: `${(sizeDiff * 100).toFixed(2)}%`
                });

                // Update progress to show completion
                if (onUploadProgress) {
                  onUploadProgress({
                    loaded: file.size,
                    total: file.size,
                    progress: 100,
                    status: 'complete'
                  });
                }
                return {
                  message: 'File upload completed',
                  details: {
                    isComplete: true,
                    status: 'complete',
                    fileSize: fileInfo.data.fileSize
                  }
                };
              }
            }
            // Wait 10 seconds before next poll since assembly can take a while
            await new Promise(resolve => setTimeout(resolve, 10000));
          } catch (error) {
            console.warn('Error polling file info:', error);
            // Wait 10 seconds before retry after error to match polling interval
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        }
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
