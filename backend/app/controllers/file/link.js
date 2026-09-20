// download.link.file.controller.js
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import {
  canReadInOrg,
  reachOfMembership,
  resolveOrgMembership,
  withinReach,
} from '../../utils/orgMembership.js';
import { generateDownloadToken } from '../../utils/auth.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { files: File } = db;

const unauthorized = (req, res) =>
  problem(res, req, { status: 403, type: 'forbidden', title: req.__('files.unauthorized') });

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/get-download-link:
 *   post:
 *     summary: Generate a secure download link
 *     description: Generate a time-limited secure download link for a Vagrant box file. A private box needs a writing membership of its organization, a guest of the organization minting one only while the box is published and flagged for guests; a service account is a member of its own organization only, at its effective role. A version, provider, architecture or file beyond the caller's reach answers 404.
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
 *         description: Download link generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 download_url:
 *                   type: string
 *                   example: "https://api.example.com/organization/myorg/box/mybox/version/1.0.0/provider/virtualbox/architecture/amd64/file/download?token=..."
 *                   description: Secure download URL with embedded token (expires in 1 hour)
 *       403:
 *         description: Unauthorized access to file
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: File, box, or organization not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const getDownloadLink = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

  const { userId, isServiceAccount, serviceAccountId } = req;

  try {
    const appConfig = loadConfig('app');
    const authConfig = loadConfig('auth');

    // Entities are pre-loaded by verifyBoxFilePath middleware
    const { organization: organizationData, box, version, provider, architecture } = req.entities;
    const membership = userId ? await resolveOrgMembership(req, organizationData.id) : null;

    // Check authorization
    if (!box.isPublic) {
      if (!userId) {
        return unauthorized(req, res);
      }

      if (!canReadInOrg(membership, box)) {
        return unauthorized(req, res);
      }
    }
    const caller = userId ? { userId, isServiceAccount } : null;
    const reach = reachOfMembership(caller, box, membership);
    const fileRecord = withinReach(reach, version, provider, architecture)
      ? await File.findOne({ where: { fileName: 'vagrant.box', architectureId: architecture.id } })
      : null;
    if (!fileRecord || !withinReach(reach, version, provider, architecture, fileRecord)) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('files.notFound'),
      });
    }

    // Generate a secure download token with configurable expiry
    const downloadLinkExpiry = authConfig.auth?.jwt?.download_link_expiry || '1h';
    const downloadToken = generateDownloadToken(
      {
        user_id: userId,
        is_service_account: isServiceAccount,
        service_account_id: serviceAccountId,
        organization,
        box_id: boxId,
        version_number: versionNumber,
        provider_name: providerName,
        architecture_name: architectureName,
      },
      downloadLinkExpiry
    );

    // Return the secure download URL
    const downloadUrl = `${appConfig.boxvault.api_url}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download?token=${downloadToken}`;

    return res.status(200).json({ download_url: downloadUrl });
  } catch (err) {
    log.error.error('Error generating download link:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('files.link.error'),
    });
  }
};

export { getDownloadLink };
