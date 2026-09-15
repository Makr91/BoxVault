import { extensionOf, levelsFromFileName, tokensOf } from '../file/upload.js';

const PLATFORMS = {
  linux: 'linux',
  linux64: 'linux',
  win: 'windows',
  win32: 'windows',
  win64: 'windows',
  windows: 'windows',
  mac: 'macos',
  macos: 'macos',
  osx: 'macos',
  darwin: 'macos',
  omnios: 'omnios',
};

const ARCHITECTURES = {
  x64: 'x64',
  amd64: 'x64',
  win64: 'x64',
  linux64: 'x64',
  x86: 'x86',
  i386: 'x86',
  i686: 'x86',
  win32: 'x86',
  arm64: 'arm64',
  aarch64: 'arm64',
};

const LANGUAGES = {
  en: 'en',
  english: 'en',
  de: 'de',
  german: 'de',
  fr: 'fr',
  french: 'fr',
  es: 'es',
  spanish: 'es',
  it: 'it',
  italian: 'it',
  ja: 'ja',
  japanese: 'ja',
  pt: 'pt',
  portuguese: 'pt',
  nl: 'nl',
  dutch: 'nl',
  zh: 'zh',
  chinese: 'zh',
};

const KIND_TOKENS = {
  fixpack: 'fixpack',
  fp: 'fixpack',
  hotfix: 'hotfix',
  hf: 'hotfix',
  if: 'interim-fix',
  container: 'container-image',
  docker: 'container-image',
  image: 'container-image',
  template: 'template',
  notes: 'notes',
  readme: 'notes',
  tool: 'tool',
  tools: 'tool',
};

const KIND_PATTERNS = [
  [/^fp\d+$/, 'fixpack'],
  [/^if\d+$/, 'interim-fix'],
  [/^hf\d+$/, 'hotfix'],
];

const KIND_EXTENSIONS = {
  '.deb': 'package',
  '.rpm': 'package',
  '.p5p': 'package',
  '.pkg': 'package',
  '.ntf': 'template',
  '.pdf': 'notes',
  '.txt': 'notes',
  '.md': 'notes',
  '.exe': 'installer',
  '.msi': 'installer',
  '.dmg': 'installer',
  '.run': 'installer',
  '.bin': 'installer',
};

const firstOf = (tokens, map) => {
  const hit = tokens.find(token => Object.hasOwn(map, token));
  return hit ? map[hit] : null;
};

const kindOf = (tokens, extension) => {
  const byToken = firstOf(tokens, KIND_TOKENS);
  if (byToken) {
    return byToken;
  }
  const byPattern = KIND_PATTERNS.find(([pattern]) => tokens.some(token => pattern.test(token)));
  if (byPattern) {
    return byPattern[1];
  }
  const chain = extension.split('.').filter(Boolean);
  const byExtension = chain.map(part => KIND_EXTENSIONS[`.${part}`]).find(Boolean);
  return byExtension || 'other';
};

/**
 * The words a file name gives, never a rule: the product slug and the
 * release identifier of levelsFromFileName, the patch `release`, the key
 * the file name, and the kind, platform, architecture and language read
 * from the name's tokens where obvious (Linux, Win64, Mac, English, _EN,
 * FP1, IF1, notes, .deb, .ntf, .pdf), else other, any, any, any. Empty
 * where the name gives nothing.
 * @param {string} fileName - The real file name
 * @returns {{product: string, release: string, patch: string, key: string, kind: string, platform: string, architecture: string, language: string}} The guess
 */
const guessFromFileName = fileName => {
  const { name, versionNumber } = levelsFromFileName(fileName);
  const lower = fileName.toLowerCase();
  const tokens = tokensOf(lower.replace('x86_64', 'x64'));
  return {
    product: name,
    release: versionNumber,
    patch: 'release',
    key: fileName,
    kind: kindOf(tokens, extensionOf(lower)),
    platform: firstOf(tokens, PLATFORMS) || 'any',
    architecture: firstOf(tokens, ARCHITECTURES) || 'any',
    language: firstOf(tokens, LANGUAGES) || 'any',
  };
};

export { guessFromFileName };
