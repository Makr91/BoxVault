// upload.js
const path = require('path');
const { log } = require('../../utils/Logger');
const { verifyAuthorizedToken } = require('./middleware');
const { uploadSSLFile } = require('../../middleware/upload');

/**
 * @swagger
 * /api/setup/upload-ssl:
 *   post:
 *     summary: Upload SSL certificate files
 *     description: Upload SSL certificate (.crt) or private key (.key) files for HTTPS configuration
 *     tags: [Setup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: SSL certificate file (.crt) or private key file (.key)
 *     responses:
 *       200:
 *         description: SSL file uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 certPath:
 *                   type: string
 *                   description: Path to uploaded certificate file
 *                   example: "/config/ssl/server.crt"
 *                 keyPath:
 *                   type: string
 *                   description: Path to uploaded private key file
 *                   example: "/config/ssl/server.key"
 *       400:
 *         description: No file uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No file uploaded!"
 *       403:
 *         description: Invalid authorization token
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Invalid authorization token"
 *       500:
 *         description: Failed to upload SSL certificate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Failed to upload SSL certificate."
 */
exports.uploadSSL = [
  verifyAuthorizedToken,
  async (req, res) => {
    try {
      await uploadSSLFile(req, res);
      const { file } = req;
      if (!file) {
        return res.status(400).send({ message: req.__('files.noFileUploaded') });
      }

      const filePath = path.join('/config/ssl', file.originalname);

      let certPath;
      let keyPath;
      if (file.originalname.endsWith('.crt')) {
        certPath = filePath;
      } else if (file.originalname.endsWith('.key')) {
        keyPath = filePath;
      }

      return res.status(200).send({ certPath, keyPath });
    } catch (error) {
      log.error.error('Error uploading SSL certificate:', error);
      return res.status(500).send({ message: req.__('setup.sslUploadError') });
    }
  },
];
