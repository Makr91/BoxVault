// delete.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import db from '../../models/index.js';

const Organization = db.organization;

/**
 * @swagger
 * /api/organization/{organizationName}:
 *   delete:
 *     summary: Delete an organization
 *     description: Delete an organization and all its associated files and directories (Admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to delete
 *     responses:
 *       200:
 *         description: Organization deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization and its files deleted successfully."
 *       404:
 *         description: Organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Delete a Organization with the specified id in the request
const _delete = async (req, res) => {
  const { organization: organizationName } = req.params;

  try {
    // Find the organization by name
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFound'),
      });
    }

    // Delete the organization
    await organization.destroy();

    // Delete the directory
    const dirPath = getSecureBoxPath(organizationName);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }

    return res.status(200).send({
      message: req.__('organizations.deleted'),
    });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('organizations.deleteError'),
    });
  }
};

export { _delete as delete };
