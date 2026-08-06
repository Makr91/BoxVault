// update.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { generateEmailHash } from '../../utils/identity.js';
const { organization: Organization } = db;

/**
 * @swagger
 * /api/organization/{organizationName}:
 *   put:
 *     summary: Update an organization
 *     description: Update organization information including name, description, email, and website
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Current organization name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               organization:
 *                 type: string
 *                 description: New organization name
 *               description:
 *                 type: string
 *                 description: Organization description
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Organization email
 *               website:
 *                 type: string
 *                 format: uri
 *                 description: Organization website URL
 *     responses:
 *       200:
 *         description: Organization updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization updated successfully."
 *                 organization:
 *                   $ref: '#/components/schemas/Organization'
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
const trimIfSet = value => (value ? value.trim() : value);

/**
 * Rejections for externally-managed orgs (mirrored from an OIDC provider):
 * the slug is frozen — renaming would break the mirror and every URL — and
 * the profile is IdP-truth (synced through the SCIM Group extension), so
 * email, description, and org_code may not be CHANGED locally (unchanged
 * echoes from the console form pass through).
 * @param {Object|null} org - Organization instance
 * @param {Object} fields - { organization, email, description, org_code }
 * @param {Object} req - Express request (for i18n)
 * @returns {{status: number, message: string}|null}
 */
const getExternalEditRejection = (org, fields, req) => {
  if (!org?.external_issuer) {
    return null;
  }
  if (fields.organization && fields.organization !== org.name) {
    return { status: 403, message: req.__('organizations.externallyManagedRename') };
  }
  const profileChanged =
    (fields.email !== undefined && fields.email !== org.email) ||
    (fields.description !== undefined && fields.description !== org.description) ||
    (fields.org_code !== undefined && fields.org_code !== org.org_code);
  if (profileChanged) {
    return { status: 403, message: req.__('organizations.externallyManagedProfile') };
  }
  return null;
};

/**
 * Validate a submitted org_code (6-hex format, globally unique).
 * @param {Object} org - Organization instance
 * @param {string|undefined} orgCode - Trimmed org_code from the request body
 * @param {Object} req - Express request (for i18n)
 * @returns {Promise<{status: number, message: string}|null>}
 */
const getOrgCodeRejection = async (org, orgCode, req) => {
  if (orgCode === undefined || orgCode === null || orgCode === '') {
    return null;
  }
  if (!/^[0-9A-F]{6}$/.test(orgCode)) {
    return { status: 400, message: req.__('organizations.invalidOrgCode') };
  }
  if (orgCode !== org.org_code) {
    const existingOrg = await Organization.findOne({ where: { org_code: orgCode } });
    if (existingOrg) {
      return {
        status: 400,
        message: req.__('organizations.orgCodeInUse', { org_code: orgCode }),
      };
    }
  }
  return null;
};

/**
 * Move an org's storage directory on rename. Only acts when the old directory
 * exists and the paths differ; failures are logged and never block the
 * database update.
 * @param {string} oldFilePath - Current storage path
 * @param {string} newFilePath - Target storage path
 * @returns {void}
 */
const moveOrgDirectory = (oldFilePath, newFilePath) => {
  try {
    if (fs.existsSync(oldFilePath) && oldFilePath !== newFilePath) {
      if (!fs.existsSync(newFilePath)) {
        fs.mkdirSync(newFilePath, { recursive: true });
      }
      fs.renameSync(oldFilePath, newFilePath);
      if (fs.existsSync(oldFilePath)) {
        fs.rmSync(oldFilePath, { recursive: true, force: true });
      }
    }
    // If no directories exist, that's fine - they'll be created when boxes are uploaded
  } catch (fileErr) {
    log.error.error('Directory operation failed:', fileErr);
  }
};

export const update = async (req, res) => {
  const { organization: organizationName } = req.params;
  const { description } = req.body;
  const organization = trimIfSet(req.body.organization);
  const email = trimIfSet(req.body.email);
  const org_code = trimIfSet(req.body.org_code);

  const oldFilePath = getSecureBoxPath(organizationName);
  const newFilePath = getSecureBoxPath(organization || organizationName);

  try {
    const org = await Organization.findOne({
      where: { name: organizationName },
    });

    const externalRejection = getExternalEditRejection(
      org,
      { organization, email, description, org_code },
      req
    );
    if (externalRejection) {
      return res.status(externalRejection.status).send({ message: externalRejection.message });
    }

    moveOrgDirectory(oldFilePath, newFilePath);

    const orgCodeRejection = await getOrgCodeRejection(org, org_code, req);
    if (orgCodeRejection) {
      return res.status(orgCodeRejection.status).send({ message: orgCodeRejection.message });
    }

    await org.update({
      name: organization !== undefined ? organization : org.name,
      description: description !== undefined ? description : org.description,
      email: email !== undefined ? email : org.email,
      emailHash: email ? generateEmailHash(email) : org.emailHash,
      org_code: org_code !== undefined ? org_code : org.org_code,
    });

    // Reload to ensure persistence and get fresh data
    await org.reload();

    return res.status(200).send({
      message: req.__('organizations.updated'),
      organization: org,
    });
  } catch (err) {
    log.error.error('Error updating organization:', err);
    return res.status(500).send({
      message: req.__('organizations.updateError'),
    });
  }
};
