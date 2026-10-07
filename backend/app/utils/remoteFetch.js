import http from 'http';
import https from 'https';
import dns from 'dns';
import { BlockList, isIP } from 'net';

const MAX_REDIRECTS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const PROTOCOLS = new Set(['http:', 'https:']);
const MAPPED_IPV4 = /^::ffff:(?<ipv4>\d{1,3}(?:\.\d{1,3}){3})$/i;

const PRIVATE_RANGES = new BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([network, prefix]) => PRIVATE_RANGES.addSubnet(network, prefix, 'ipv4'));
[
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([network, prefix]) => PRIVATE_RANGES.addSubnet(network, prefix, 'ipv6'));

/**
 * Whether an address is loopback, private, link-local, shared, reserved or
 * multicast, an IPv4-mapped IPv6 address judged by its IPv4 part; anything
 * that is not an IP address counts as private.
 * @param {string} address - An IPv4 or IPv6 address
 * @returns {boolean}
 */
const isPrivateAddress = address => {
  const mapped = MAPPED_IPV4.exec(address);
  if (mapped) {
    return PRIVATE_RANGES.check(mapped.groups.ipv4, 'ipv4');
  }
  const family = isIP(address);
  return family === 0 || PRIVATE_RANGES.check(address, family === 6 ? 'ipv6' : 'ipv4');
};

const failure = (code, message, extra = {}) =>
  Object.assign(new Error(message), { code, ...extra });

/**
 * A dns.lookup that refuses a host any of whose addresses is private, so the
 * address the socket connects to is the one judged.
 * @param {string} hostname - The host to resolve
 * @param {Object} options - The lookup options Node passes
 * @param {Function} callback - The lookup callback
 * @returns {void}
 */
const publicLookup = (hostname, options, callback) =>
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      return callback(err);
    }
    const refused = addresses.find(entry => isPrivateAddress(entry.address));
    if (refused) {
      return callback(failure('EPRIVATEADDRESS', `${hostname} resolves to ${refused.address}`));
    }
    return options.all
      ? callback(null, addresses)
      : callback(null, addresses[0].address, addresses[0].family);
  });

/**
 * Open a GET of an http(s) URL and answer its 200 response stream, following
 * up to ten redirects, every hop refused when its host is a private address
 * unless private addresses are allowed. Fails with code EPROTOCOL for another
 * scheme, EPRIVATEADDRESS for a private host, EREDIRECTS past ten redirects
 * and EREMOTESTATUS (with `status`) for any other answer.
 * @param {string} url - The URL
 * @param {{allowPrivate?: boolean, signal?: AbortSignal}} [options] - Whether private hosts are allowed, and an abort signal
 * @param {number} [hops] - Redirects followed so far
 * @returns {Promise<import('http').IncomingMessage>} The response stream
 */
const openRemote = (url, options = {}, hops = 0) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    if (!PROTOCOLS.has(target.protocol)) {
      reject(failure('EPROTOCOL', `${target.protocol} is not http or https`));
      return;
    }
    const host = target.hostname.replace(/^\[|\]$/g, '');
    if (!options.allowPrivate && isIP(host) && isPrivateAddress(host)) {
      reject(failure('EPRIVATEADDRESS', `${host} is a private address`));
      return;
    }
    const client = target.protocol === 'https:' ? https : http;
    const request = client.get(
      target,
      { signal: options.signal, ...(options.allowPrivate ? {} : { lookup: publicLookup }) },
      response => {
        if (REDIRECT_STATUSES.has(response.statusCode) && response.headers.location) {
          response.resume();
          if (hops >= MAX_REDIRECTS) {
            reject(failure('EREDIRECTS', `more than ${MAX_REDIRECTS} redirects`));
            return;
          }
          resolve(openRemote(new URL(response.headers.location, target).href, options, hops + 1));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            failure('EREMOTESTATUS', `answered ${response.statusCode}`, {
              status: response.statusCode,
            })
          );
          return;
        }
        resolve(response);
      }
    );
    request.on('error', reject);
  });

export { isPrivateAddress, openRemote };
