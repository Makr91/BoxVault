import { getOrigin, getSiteConfig } from '../utils/config-loader.js';

const DEFAULT_NAME = 'BoxVault';
const DEFAULT_LOGO = '/brand/boxvault/mark.svg';

const XML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/**
 * A value escaped for XML text and attribute values.
 * @param {string} value - The value
 * @returns {string} The escaped value
 */
const xml = value => String(value).replace(/[&<>"']/g, character => XML_ENTITIES[character]);

/**
 * @swagger
 * /opensearch.xml:
 *   get:
 *     summary: OpenSearch description of this host (public)
 *     description: An OpenSearch 1.1 description answered per Host header, so a browser can add the site as a search engine. ShortName is the brand name of the hostname's sites entry, BoxVault for the unnamed hostname; Description is "Search" and the ShortName; Image is the brand logo_url of the hostname's sites entry, the default mark otherwise, written as an absolute URL on the hostname's origin; the text/html Url template opens the search page at that origin.
 *     tags: [Search]
 *     responses:
 *       200:
 *         description: The OpenSearch description
 *         headers:
 *           Cache-Control:
 *             schema:
 *               type: string
 *               example: no-cache
 *         content:
 *           application/opensearchdescription+xml:
 *             schema:
 *               type: string
 *               example: <?xml version="1.0" encoding="UTF-8"?><OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"><ShortName>BoxVault</ShortName><Description>Search BoxVault</Description><InputEncoding>UTF-8</InputEncoding><Image>https://boxvault.example.com/brand/boxvault/mark.svg</Image><Url type="text/html" template="https://boxvault.example.com/search?q={searchTerms}"/></OpenSearchDescription>
 */
const opensearch = (req, res) => {
  const site = getSiteConfig(req.hostname);
  const origin = getOrigin(req.hostname);
  const name = site?.brand?.name || DEFAULT_NAME;
  const logo = site?.brand?.logo_url || DEFAULT_LOGO;
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">',
    `  <ShortName>${xml(name)}</ShortName>`,
    `  <Description>${xml(`Search ${name}`)}</Description>`,
    '  <InputEncoding>UTF-8</InputEncoding>',
    `  <Image>${xml(`${origin}${logo}`)}</Image>`,
    `  <Url type="text/html" template="${xml(`${origin}/search?q={searchTerms}`)}"/>`,
    '</OpenSearchDescription>',
    '',
  ].join('\n');
  return res
    .set('Cache-Control', 'no-cache')
    .type('application/opensearchdescription+xml')
    .send(body);
};

export { opensearch };
