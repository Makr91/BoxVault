// update.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { conflict } from '../../utils/problem.js';
import db from '../../models/index.js';
import { notifyVersionDeprecated } from './notifications.js';
const { versions: Version, UserOrg } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}:
 *   put:
 *     summary: Update a specific version of a box
 *     tags: [Versions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name/ID
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Current version number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateVersionRequest'
 *     responses:
 *       200:
 *         description: Version updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Version'
 *       404:
 *         description: Organization, box, or version not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Box example-box not found in organization example-org."
 *       409:
 *         description: A version with the new number already exists for the box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the version form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while updating the Version."
 */
export const update = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const {
    version_number: newVersionNumber,
    description,
    release_notes: releaseNotes,
    deprecated,
    deprecation_reason: deprecationReason,
  } = req.body;
  const oldFilePath = getSecureBoxPath(organization, boxId, versionNumber);
  // Use the new version number for the path if it's provided, otherwise use the old one.
  const newFilePath = getSecureBoxPath(organization, boxId, newVersionNumber || versionNumber);

  try {
    // Organization and Box are already verified and attached by attachBox middleware
    const { organizationData, boxData: box } = req;

    // Check if user owns the box OR has admin/owner role
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canUpdate = isOwner || (membership && ['admin', 'owner'].includes(membership.role));

    if (!canUpdate) {
      return res.status(403).send({
        message: req.__('versions.update.permissionDenied'),
      });
    }

    const version = await Version.findOne({
      where: { versionNumber, boxId: box.id },
    });

    if (!version) {
      return res.status(404).send({
        message: req.__('versions.versionNotFound'),
      });
    }

    if (newVersionNumber && newVersionNumber !== versionNumber) {
      const existingVersion = await Version.findOne({
        where: { versionNumber: newVersionNumber, boxId: box.id },
      });
      if (existingVersion) {
        return conflict(res, req, '/version_number', box.name);
      }
    }

    // Only THIS request flipping deprecated false -> true triggers a hub
    // notification below; re-saving an already-deprecated version does not.
    const becomesDeprecated = deprecated === true && !version.deprecated;

    // Build the update payload carefully to avoid setting fields to null
    const updatePayload = {};
    if (newVersionNumber) {
      updatePayload.versionNumber = newVersionNumber;
    }
    if (typeof description !== 'undefined') {
      updatePayload.description = description;
    }
    if (typeof releaseNotes !== 'undefined') {
      updatePayload.releaseNotes = releaseNotes;
    }
    if (typeof deprecated !== 'undefined') {
      updatePayload.deprecated = deprecated;
    }
    if (typeof deprecationReason !== 'undefined') {
      updatePayload.deprecationReason = deprecationReason;
    }

    const updated = await version.update(updatePayload);

    if (updated) {
      // Rename the directory if necessary
      if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath)) {
        // If the target directory already exists (e.g. from a previous failed run),
        // remove it so we can rename the old one to this location.
        if (fs.existsSync(newFilePath)) {
          fs.rmSync(newFilePath, { recursive: true, force: true });
        }

        fs.renameSync(oldFilePath, newFilePath);
      }

      const updatedVersion = await Version.findOne({
        where: { versionNumber: newVersionNumber || versionNumber, boxId: box.id },
      });

      // Fan out the deprecation to the org's notification hub (externally
      // managed orgs only). Fire-and-forget — never blocks or fails the request.
      if (becomesDeprecated) {
        notifyVersionDeprecated(
          organizationData,
          box.name,
          updatedVersion.versionNumber,
          updatedVersion.deprecationReason
        );
      }

      return res.send(updatedVersion);
    }

    throw new Error(`Version ${versionNumber} not found`);
  } catch (err) {
    log.error.error('Error updating version:', err);
    return res.status(500).send({
      message: req.__('errors.operationFailed'),
    });
  }
};
