import axios from "axios";
import authHeader from "./auth-header";

const API_URL = process.env.REACT_APP_API_BASE_URL;

class FileService {
  upload(file, organization, name, version, provider, architecture, onUploadProgress) {
    let formData = new FormData();
    formData.append("file", file);

    return axios.post(`${API_URL}/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...authHeader()
      },
      onUploadProgress,
    });
  }

  download(organization, name, version, provider, architecture) {
    return axios.get(`${API_URL}/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file`, { headers: authHeader() });
  }

  info(organization, name, version, provider, architecture) {
    return axios.get(`${API_URL}/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/info`, { headers: authHeader() });
  }
  
  delete(organization, name, version, provider, architecture) {
    return axios.delete(`${API_URL}/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/delete`, { headers: authHeader() });
  }

}

export default new FileService();