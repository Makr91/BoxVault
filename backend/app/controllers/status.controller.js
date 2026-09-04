import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { version } = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));

/**
 * @swagger
 * /api/status:
 *   get:
 *     summary: App identity for the STARTcloud UI (public)
 *     description: Probed by the STARTcloud UI against its own origin before anything renders; role names the app the UI boots and version is this backend's version.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: App status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 role:
 *                   type: string
 *                   example: boxvault
 *                 version:
 *                   type: string
 *                   example: "0.74.0"
 */
const getStatus = (req, res) => {
  void req;
  return res.json({ role: 'boxvault', version });
};

export { getStatus };
