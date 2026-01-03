// remove.file.controller.js
const { getSecureBoxPath } = require('../../utils/paths');
const { log } = require('../../utils/Logger');
const db = require('../../models');
const { safeUnlink, safeRm } = require('../../utils/fsHelper');

const Architecture = db.architectures;
const File = db.files;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/delete:
 *   delete:
 *     summary: Delete a Vagrant box file
 *     description: Delete a Vagrant box file from both disk and database
 *     tags: [Files]
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
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *     responses:
 *       200:
 *         description: File deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "File and database record are deleted, or file was not found but cleanup attempted."
 *       404:
 *         description: Architecture not found
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
const remove = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const basefilePath = getSecureBoxPath(
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName
  );
  const filePath = require('path').join(basefilePath, fileName);

  try {
    const architecture = await Architecture.findOne({
      where: { name: architectureName },
      include: [
        {
          model: db.providers,
          as: 'provider',
          where: { name: providerName },
          include: [
            {
              model: db.versions,
              as: 'version',
              where: { versionNumber },
              include: [
                {
                  model: db.box,
                  as: 'box',
                  where: { name: boxId },
                  include: [
                    {
                      model: db.user,
                      as: 'user',
                      include: [
                        {
                          model: db.organization,
                          as: 'primaryOrganization',
                          where: { name: organization },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!architecture) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Architecture not found for provider ${providerName} in version ${versionNumber} of box ${boxId}.`,
      });
    }

    const fileRecord = await File.findOne({
      where: {
        fileName,
        architectureId: architecture.id,
      },
    });

    // Attempt to delete the file from the disk
    safeUnlink(filePath);

    // Proceed to delete the database record regardless of file deletion success
    try {
      if (fileRecord) {
        await fileRecord.destroy();
        log.app.info('Database record deleted successfully.');
      } else {
        log.app.info('File record not found, but continuing with directory cleanup.');
      }

      // Attempt to delete the architecture directory
      safeRm(basefilePath, { recursive: true, force: true });

      return res.status(200).send({
        message:
          'File and database record are deleted, or file was not found but cleanup attempted.',
      });
    } catch (dbErr) {
      log.app.info(`Could not delete the database record: ${dbErr}`);
      return res.status(200).send({
        message:
          'File deletion attempted, but encountered issues with database or directory cleanup.',
      });
    }
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while deleting the file.',
    });
  }
};

module.exports = { remove };
