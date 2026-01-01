// delete.js
const fs = require('fs');
const { getSecureBoxPath } = require('../../utils/paths');
const db = require('../../models');

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
exports.delete = async (req, res) => {
  const { organizationName } = req.params;

  try {
    // Find the organization by name
    const organization = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!organization) {
      return res.status(404).send({
        message: 'Organization not found.',
      });
    }

    // Delete the organization
    await organization.destroy();

    // Delete the directory
    const dirPath = getSecureBoxPath(organizationName);
    if (fs.existsSync(dirPath)) {
      fs.rmdirSync(dirPath, { recursive: true });
    }

    return res.status(200).send({
      message: 'Organization and its files deleted successfully.',
    });
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while deleting the organization.',
    });
  }
};
