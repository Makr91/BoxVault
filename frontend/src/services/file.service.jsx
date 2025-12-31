import axios from "axios";

import authHeader from "./auth-header";
import AuthService from "./auth.service";

const baseURL = window.location.origin;

class FileService {
  async upload(
    file,
    organization,
    name,
    version,
    provider,
    architecture,
    checksum,
    checksumType,
    onUploadProgress
  ) {
    if (!file) {
      throw new Error("No file provided");
    }

    console.log("Starting file upload:", {
      fileName: file.name,
      fileSize: file.size,
      checksum: checksum || "none",
      checksumType: checksumType || "NULL",
    });

    try {
      // Set up chunked upload with logging
      console.log("Starting chunked upload:", {
        fileName: file.name,
        fileSize: file.size,
        chunkSize: 100 * 1024 * 1024,
        estimatedChunks: Math.ceil(file.size / (100 * 1024 * 1024)),
      });

      const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB chunks
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      let uploadedBytes = 0;
      let currentChunk = 0;

      // Process chunks sequentially
      while (currentChunk < totalChunks) {
        const start = currentChunk * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);

        console.log(`Uploading chunk ${currentChunk + 1}/${totalChunks}:`, {
          start,
          end,
          size: end - start,
        });

        // Get chunk data without loading entire file
        const chunk = file.slice(start, end);

        // Set up headers for this chunk
        const headers = {
          ...authHeader(),
          "Content-Type": "application/octet-stream",
          "Content-Length": (end - start).toString(),
          "X-File-Name": file.name,
          "X-Checksum": checksum || "",
          "X-Checksum-Type": checksumType || "NULL",
          "X-Chunk-Index": currentChunk.toString(),
          "X-Total-Chunks": totalChunks.toString(),
        };

        // Upload chunk
        const response = await fetch(
          `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`,
          {
            method: "POST",
            headers,
            body: chunk,
            duplex: "half",
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Chunk upload failed:", {
            chunk: currentChunk,
            total: totalChunks,
            error: errorText,
          });
          throw new Error(
            `Chunk upload failed: ${response.statusText}. ${errorText}`
          );
        }

        const result = await response.json();

        // Update progress based on status
        uploadedBytes += end - start;
        if (onUploadProgress) {
          if (result.details.isComplete) {
            // Final assembly complete
            onUploadProgress({
              loaded: file.size,
              total: file.size,
              progress: 100,
              status: "complete",
            });
          } else if (currentChunk === totalChunks - 1) {
            // All chunks uploaded, assembly in progress
            onUploadProgress({
              loaded: uploadedBytes,
              total: file.size,
              progress: 99,
              status: "assembling",
            });
          } else {
            // Normal chunk progress
            onUploadProgress({
              loaded: uploadedBytes,
              total: file.size,
              progress: Math.round((uploadedBytes / file.size) * 100),
              status: "uploading",
            });
          }
        }

        // Check if upload is complete
        if (result.details.isComplete) {
          console.log("Upload completed successfully:", result);
          return result;
        }

        currentChunk++;
      }

      // Wait for final assembly with progress updates
      console.log("All chunks uploaded, starting assembly phase...");

      if (onUploadProgress) {
        onUploadProgress({
          loaded: file.size,
          total: file.size,
          progress: 99,
          status: "assembling",
          message: "Assembling file chunks...",
        });
      }

      // Poll for completion with exponential backoff
      let attempts = 0;
      let delay = 1000; // Start with 1 second
      const maxDelay = 5000; // Max 5 seconds between attempts
      const timeout = 120000; // 2 minute total timeout
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        try {
          console.log(`Assembly check attempt ${attempts + 1}:`, {
            elapsed: `${Math.round((Date.now() - startTime) / 1000)}s`,
            delay: `${delay}ms`,
          });

          const fileInfo = await this.info(
            organization,
            name,
            version,
            provider,
            architecture
          );
          const fileSize = fileInfo.data?.fileSize || fileInfo.fileSize;

          if (typeof fileSize === "number") {
            // Verify file size
            const sizeDiff = Math.abs(file.size - fileSize);
            const maxDiff = Math.max(1024 * 1024, file.size * 0.01); // Allow 1MB or 1% difference

            if (sizeDiff > maxDiff) {
              console.error("Size mismatch after assembly:", {
                originalSize: file.size,
                assembledSize: fileSize,
                difference: sizeDiff,
                maxAllowedDiff: maxDiff,
              });
              throw new Error(
                `File size mismatch after assembly: Expected ${file.size} bytes but got ${fileSize} bytes`
              );
            }

            console.log("Assembly completed successfully:", {
              finalSize: fileSize,
              originalSize: file.size,
              duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
            });

            if (onUploadProgress) {
              onUploadProgress({
                loaded: file.size,
                total: file.size,
                progress: 100,
                status: "complete",
                message: "Upload complete",
              });
            }

            return {
              message: "File upload completed",
              details: {
                isComplete: true,
                status: "complete",
                fileSize,
              },
            };
          }

          // Increase delay with exponential backoff
          delay = Math.min(delay * 1.5, maxDelay);
          await new Promise((resolve) => setTimeout(resolve, delay));
          attempts++;

          if (onUploadProgress) {
            onUploadProgress({
              loaded: file.size,
              total: file.size,
              progress: 99,
              status: "assembling",
              message: `Assembling file chunks (${Math.round((Date.now() - startTime) / 1000)}s)...`,
            });
          }
        } catch (error) {
          if (error.message.includes("size mismatch")) {
            throw error; // Re-throw size mismatch errors
          }
          console.warn("Assembly check failed:", error);
          // Continue polling on other errors
        }
      }

      throw new Error(
        `Upload failed: Assembly timed out after ${Math.round((Date.now() - startTime) / 1000)} seconds`
      );
    } catch (error) {
      console.error("Upload failed:", {
        error,
        fileName: file.name,
        fileSize: file.size,
        type: file.type,
        lastModified: new Date(file.lastModified).toISOString(),
      });

      // Add more context to the error
      if (error.name === "TypeError" && error.message.includes("locked")) {
        throw new Error(
          "Upload failed: Stream handling error. Please try again."
        );
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
      console.error("Error getting download link:", error);
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
