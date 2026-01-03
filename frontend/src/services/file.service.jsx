import axios from "axios";

import { log } from "../utils/Logger";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

// Helper function for delays
const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

class FileService {
  // Helper: Build headers for chunk upload
  buildChunkHeaders(
    uploadOptions,
    currentChunk,
    totalChunks,
    chunkSize,
    fileName
  ) {
    const { checksum, checksumType } = uploadOptions;
    return {
      ...authHeader(),
      "Content-Type": "application/octet-stream",
      "Content-Length": chunkSize.toString(),
      "X-File-Name": fileName,
      "X-Checksum": checksum || "",
      "X-Checksum-Type": checksumType || "NULL",
      "X-Chunk-Index": currentChunk.toString(),
      "X-Total-Chunks": totalChunks.toString(),
    };
  }

  // Helper: Handle progress updates
  handleProgressUpdate(
    onUploadProgress,
    uploadedBytes,
    fileSize,
    result,
    currentChunk,
    totalChunks
  ) {
    if (!onUploadProgress) {
      return;
    }

    if (result.details.isComplete) {
      onUploadProgress({
        loaded: fileSize,
        total: fileSize,
        progress: 100,
        status: "complete",
      });
    } else if (currentChunk === totalChunks - 1) {
      onUploadProgress({
        loaded: uploadedBytes,
        total: fileSize,
        progress: 99,
        status: "assembling",
      });
    } else {
      onUploadProgress({
        loaded: uploadedBytes,
        total: fileSize,
        progress: Math.round((uploadedBytes / fileSize) * 100),
        status: "uploading",
      });
    }
  }

  // Helper: Upload a single chunk
  async uploadSingleChunk(url, headers, chunk) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: chunk,
      duplex: "half",
    });

    if (!response.ok) {
      throw new Error("errors.upload.chunkFailed");
    }

    return response.json();
  }

  // Helper: Poll for assembly completion
  async pollForAssembly(uploadOptions, fileSize, onUploadProgress) {
    const { organization, name, version, provider, architecture } =
      uploadOptions;
    let attempts = 0;
    let delay = 1000;
    const maxDelay = 5000;
    const timeout = 120000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        log.file.debug("Assembly check attempt", {
          attempt: attempts + 1,
          elapsed: `${Math.round((Date.now() - startTime) / 1000)}s`,
          delay: `${delay}ms`,
        });

        // eslint-disable-next-line no-await-in-loop
        const fileInfo = await this.info(
          organization,
          name,
          version,
          provider,
          architecture
        );
        const assembledFileSize = fileInfo.data?.fileSize || fileInfo.fileSize;

        if (typeof assembledFileSize === "number") {
          const sizeDiff = Math.abs(fileSize - assembledFileSize);
          const maxDiff = Math.max(1024 * 1024, fileSize * 0.01);

          if (sizeDiff > maxDiff) {
            log.file.error("Size mismatch after assembly", {
              originalSize: fileSize,
              assembledSize: assembledFileSize,
              difference: sizeDiff,
              maxAllowedDiff: maxDiff,
            });
            throw new Error("errors.upload.sizeMismatch");
          }

          log.file.info("Assembly completed successfully", {
            finalSize: assembledFileSize,
            originalSize: fileSize,
            duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
          });

          if (onUploadProgress) {
            onUploadProgress({
              loaded: fileSize,
              total: fileSize,
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
              fileSize: assembledFileSize,
            },
          };
        }

        delay = Math.min(delay * 1.5, maxDelay);
        // eslint-disable-next-line no-await-in-loop
        await sleep(delay);
        attempts++;

        if (onUploadProgress) {
          onUploadProgress({
            loaded: fileSize,
            total: fileSize,
            progress: 99,
            status: "assembling",
            message: `Assembling file chunks (${Math.round((Date.now() - startTime) / 1000)}s)...`,
          });
        }
      } catch (error) {
        if (error.message.includes("size mismatch")) {
          throw error;
        }
        log.file.warn("Assembly check failed", {
          error: error.message,
        });
      }
    }

    throw new Error("errors.upload.assemblyTimeout");
  }

  async upload(file, uploadOptions, onUploadProgress) {
    const {
      organization,
      name,
      version,
      provider,
      architecture,
      checksum,
      checksumType,
    } = uploadOptions;

    if (!file) {
      throw new Error("errors.upload.noFile");
    }

    log.file.info("Starting file upload", {
      fileName: file.name,
      fileSize: file.size,
      checksum: checksum || "none",
      checksumType: checksumType || "NULL",
    });

    try {
      const CHUNK_SIZE = 100 * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      let uploadedBytes = 0;
      let currentChunk = 0;

      log.file.info("Starting chunked upload", {
        fileName: file.name,
        fileSize: file.size,
        chunkSize: CHUNK_SIZE,
        estimatedChunks: totalChunks,
      });

      // Process chunks sequentially for upload stability
      while (currentChunk < totalChunks) {
        const start = currentChunk * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);

        log.file.debug("Uploading chunk", {
          current: currentChunk + 1,
          total: totalChunks,
          start,
          end,
          size: end - start,
        });

        const chunk = file.slice(start, end);
        const headers = this.buildChunkHeaders(
          uploadOptions,
          currentChunk,
          totalChunks,
          end - start,
          file.name
        );

        const url = `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`;

        // eslint-disable-next-line no-await-in-loop
        const result = await this.uploadSingleChunk(url, headers, chunk);

        uploadedBytes += end - start;
        this.handleProgressUpdate(
          onUploadProgress,
          uploadedBytes,
          file.size,
          result,
          currentChunk,
          totalChunks
        );

        if (result.details.isComplete) {
          log.file.info("Upload completed successfully", { result });
          return result;
        }

        currentChunk++;
      }

      // All chunks uploaded, poll for assembly
      log.file.info("All chunks uploaded, starting assembly phase");

      if (onUploadProgress) {
        onUploadProgress({
          loaded: file.size,
          total: file.size,
          progress: 99,
          status: "assembling",
          message: "Assembling file chunks...",
        });
      }

      return await this.pollForAssembly(
        uploadOptions,
        file.size,
        onUploadProgress
      );
    } catch (error) {
      log.file.error("Upload failed", {
        error: error.message,
        stack: error.stack,
        fileName: file.name,
        fileSize: file.size,
        type: file.type,
        lastModified: new Date(file.lastModified).toISOString(),
      });

      if (error.name === "TypeError" && error.message.includes("locked")) {
        throw new Error("errors.upload.streamError");
      }
      throw error;
    }
  }

  async getDownloadLink(organization, name, version, provider, architecture) {
    try {
      const boxResponse = await axios.get(
        `${baseURL}/api/organization/${organization}/box/${name}`,
        { headers: authHeader() }
      );

      const headers = boxResponse.data.isPublic ? {} : authHeader();

      const response = await axios.post(
        `${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/get-download-link`,
        {},
        { headers }
      );
      return response.data.downloadUrl;
    } catch (error) {
      log.api.error("Error getting download link", {
        architecture,
        error: error.message,
      });
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
