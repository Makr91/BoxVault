import axios from "axios";
import authHeader from "./auth-header";

const baseURL = window.location.origin;

class FileService {
  upload(file, organization, name, version, provider, architecture, checksum, checksumType, onUploadProgress) {
    let formData = new FormData();
    formData.append("file", file);
    formData.append("checksum", checksum);
    formData.append("checksumType", checksumType);

    return axios.post(`${baseURL}/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...authHeader()
      },
      onUploadProgress,
    });
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