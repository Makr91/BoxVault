const fs = require('fs');
const { log } = require('../utils/Logger');
const { getStorageRoot } = require('../utils/paths');
const { getIsoStorageRoot } = require('./iso/helpers');

/**
 * @swagger
 * /api/system/storage:
 *   get:
 *     summary: Get storage usage information
 *     description: Retrieve disk space usage for Box and ISO storage locations. Requires Node.js v18.15.0 or later.
 *     tags: [System]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Storage information retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 boxes:
 *                   $ref: '#/components/schemas/StorageInfo'
 *                 isos:
 *                   $ref: '#/components/schemas/StorageInfo'
 *       500:
 *         description: Internal server error.
 *       501:
 *         description: Not supported on this Node.js version.
 */
exports.getStorageInfo = async (req, res) => {
  void req;
  if (!fs.promises.statfs) {
    return res.status(501).json({
      error: 'NOT_SUPPORTED',
      message: 'Disk usage monitoring requires Node.js v18.15.0 or later',
    });
  }

  try {
    const boxPath = getStorageRoot();
    const isoPath = getIsoStorageRoot();

    const getUsage = async dirPath => {
      if (!fs.existsSync(dirPath)) {
        return null;
      }
      const stats = await fs.promises.statfs(dirPath);
      return {
        path: dirPath,
        total: stats.blocks * stats.bsize,
        free: stats.bavail * stats.bsize,
        used: (stats.blocks - stats.bfree) * stats.bsize,
      };
    };

    const [boxUsage, isoUsage] = await Promise.all([getUsage(boxPath), getUsage(isoPath)]);

    return res.json({ boxes: boxUsage, isos: isoUsage });
  } catch (error) {
    log.error.error('Error getting storage info', { error: error.message });
    return res.status(500).send({ message: 'Failed to retrieve storage information' });
  }
};
