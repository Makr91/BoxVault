// Distro icon lookup built from the bundled SVG set in
// src/images/distro-icons/. Keys are the icon file names without the .svg
// extension, lowercased (e.g. "debian", "windows", "centos-stream"), which
// match the `metadata.distro` values boxes carry.
const iconModules = import.meta.glob("../images/distro-icons/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

const iconsByDistro = Object.entries(iconModules).reduce((acc, [path, url]) => {
  const fileName = path.split("/").pop();
  acc[fileName.replace(/\.svg$/, "").toLowerCase()] = url;
  return acc;
}, {});

/**
 * Resolve the bundled icon URL for a distro identifier.
 *
 * @param {string|null|undefined} distro - e.g. "debian", "windows", "alma".
 * @returns {string|null} Icon URL, or null for unknown/absent distros.
 */
export const getDistroIconUrl = (distro) => {
  if (typeof distro !== "string" || distro === "") {
    return null;
  }
  return iconsByDistro[distro.toLowerCase()] || null;
};

/**
 * Human-readable OS name from box metadata: os_name first, then
 * "<Distro> <version>" capitalized, else "".
 *
 * @param {object|null|undefined} metadata - box metadata object.
 * @returns {string}
 */
export const getOsDisplayName = (metadata) => {
  if (!metadata) {
    return "";
  }
  if (metadata.os_name) {
    return metadata.os_name;
  }
  if (!metadata.distro) {
    return "";
  }
  const { distro } = metadata;
  const versionSuffix = metadata.distro_version
    ? ` ${metadata.distro_version}`
    : "";
  return `${distro.charAt(0).toUpperCase()}${distro.slice(1)}${versionSuffix}`;
};
