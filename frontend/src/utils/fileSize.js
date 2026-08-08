export const formatFileSize = (bytes) => {
  const size = Number(bytes) || 0;
  if (size === 0) {
    return "0 Bytes";
  }
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(size) / Math.log(k));
  return `${parseFloat((size / k ** i).toFixed(2))} ${sizes[i]}`;
};
