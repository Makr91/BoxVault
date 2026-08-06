// badge.js — public shields-style status badge for a box (SVG, no auth)
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { organization: Organization, box: Box, versions: Version } = db;

const BADGE_LABEL = 'boxvault';
const LABEL_BG = '#4d5359';
const LABEL_TEXT = '#ffffff';
const VERSION_BG = '#91c54e';
const VERSION_TEXT = '#333333';
const DEPRECATED_BG = '#c0392b';
const DEPRECATED_TEXT = '#ffffff';

const XML_ESCAPES = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
const escapeXml = value => value.replace(/[<>&"']/g, ch => XML_ESCAPES[ch]);

// Fixed-height 20px badge; cell width derived from text length (6.5px/char + padding)
const cellWidth = text => Math.ceil(text.length * 6.5) + 10;

const renderBadgeSvg = (value, valueBg, valueText) => {
  const labelWidth = cellWidth(BADGE_LABEL);
  const valueWidth = cellWidth(value);
  const width = labelWidth + valueWidth;
  const safeValue = escapeXml(value);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img"`,
    ` aria-label="${BADGE_LABEL}: ${safeValue}">`,
    `<rect width="${labelWidth}" height="20" fill="${LABEL_BG}"/>`,
    `<rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${valueBg}"/>`,
    '<g font-family="Verdana,sans-serif" font-size="11" text-anchor="middle">',
    `<text x="${labelWidth / 2}" y="14" fill="${LABEL_TEXT}">${BADGE_LABEL}</text>`,
    `<text x="${labelWidth + valueWidth / 2}" y="14" fill="${valueText}">${safeValue}</text>`,
    '</g></svg>',
  ].join('');
};

/**
 * @swagger
 * /badge/{organization}/{name}.svg:
 *   get:
 *     summary: Get box status badge
 *     description: Public shields-style SVG badge (root path, no /api prefix, no auth). Shows the latest version number of a public published box, or "deprecated" in red when that version is deprecated. Responds 404 for missing, private, or unpublished boxes.
 *     tags: [Boxes]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *     responses:
 *       200:
 *         description: Badge image
 *         headers:
 *           Cache-Control:
 *             schema:
 *               type: string
 *               example: max-age=300
 *         content:
 *           image/svg+xml:
 *             schema:
 *               type: string
 *       404:
 *         description: Box missing, private, unpublished, or without versions (plain text)
 *       500:
 *         description: Internal server error (plain text)
 */
export const getBadge = async (req, res) => {
  const { organization, name } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });
    const box = organizationData
      ? await Box.findOne({ where: { name, organizationId: organizationData.id } })
      : null;

    // Badges exist only for public, published boxes — everything else is opaque
    if (!box || !box.isPublic || !box.published) {
      return res.status(404).type('text/plain').send('Not Found');
    }

    const latestVersion = await Version.findOne({
      where: { boxId: box.id },
      order: [['createdAt', 'DESC']],
    });
    if (!latestVersion) {
      return res.status(404).type('text/plain').send('Not Found');
    }

    const svg = latestVersion.deprecated
      ? renderBadgeSvg('deprecated', DEPRECATED_BG, DEPRECATED_TEXT)
      : renderBadgeSvg(latestVersion.versionNumber, VERSION_BG, VERSION_TEXT);

    res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=300' });
    return res.send(svg);
  } catch (err) {
    log.error.error('Error rendering box badge:', err);
    return res.status(500).type('text/plain').send('Internal Server Error');
  }
};
