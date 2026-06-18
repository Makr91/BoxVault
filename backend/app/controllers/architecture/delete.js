// delete.js
import db from '../../models/index.js';
const { architectures: Architecture, providers: Provider } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   delete:
 *     summary: Delete a specific architecture
 *     description: Delete a specific architecture and its associated files from the system
 *     tags: [Architectures]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: myorg
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *         example: ubuntu-server
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *         example: "1.0.0"
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *         example: virtualbox
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name to delete
 *         example: amd64
 *     responses:
 *       200:
 *         description: Architecture deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Organization, box, version, provider, or architecture not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const _delete = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', { organization }),
      });
    }

    const box = await db.box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!box) {
      return res.status(404).send({
        message: req.__('boxes.boxNotFoundInOrg', { boxId, organization }),
      });
    }

    // Check if user owns the box OR has moderator/admin role
    const membership = await db.UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canDelete = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canDelete) {
      return res.status(403).send({
        message: req.__('architectures.delete.permissionDenied'),
      });
    }

    const version = await db.versions.findOne({
      where: { versionNumber, boxId: box.id },
    });

    if (!version) {
      return res.status(404).send({
        message: req.__('versions.versionNotFoundInBox', { versionNumber, boxId, organization }),
      });
    }

    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id },
    });

    if (!provider) {
      return res.status(404).send({
        message: req.__('providers.providerNotFoundInVersion', {
          providerName,
          versionNumber,
          boxId,
        }),
      });
    }

    const deleted = await Architecture.destroy({
      where: { name: architectureName, providerId: provider.id },
    });

    if (deleted) {
      return res.send({ message: req.__('architectures.deleted') });
    }

    return res.status(404).send({
      message: req.__('architectures.notFound'),
    });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('architectures.delete.error'),
    });
  }
};

export { _delete as delete };
