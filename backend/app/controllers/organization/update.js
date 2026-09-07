// update.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { conflict } from '../../utils/problem.js';
import db from '../../models/index.js';
import { generateEmailHash } from '../../utils/identity.js';
import { isReservedSegment } from '../../utils/reservedSegments.js';
const { organization: Organization, sequelize } = db;

/**
 * @swagger
 * /api/organization/{organizationName}:
 *   put:
 *     summary: Update an organization
 *     description: Update organization information including name, description, email, and organization code
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
 *                 description: New organization name (the slug pattern of /api/rules, unique)
 *               description:
 *                 type: string
 *                 description: Organization description
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Organization email
 *               org_code:
 *                 type: string
 *                 pattern: '^[0-9A-F]{6}$'
 *                 description: Organization code (the orgCode pattern of /api/rules, unique)
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
 *       409:
 *         description: The new name or organization code is already taken, or the new name is a reserved path segment
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the organization form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
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
 * The taken value of a rename or a code change, as a `unique` failure; a
 * reserved path segment counts as a taken name.
 * @param {Object} org - Organization instance
 * @param {string|undefined} organization - Trimmed new name from the request body
 * @param {string|undefined} orgCode - Trimmed org_code from the request body
 * @returns {Promise<{pointer: string}|null>} The pointer of the taken value, or null
 */
const getTakenValue = async (org, organization, orgCode) => {
  if (organization && organization !== org.name) {
    if (isReservedSegment(organization)) {
      return { pointer: '/organization' };
    }
    const existingOrg = await Organization.findOne({ where: { name: organization } });
    if (existingOrg) {
      return { pointer: '/organization' };
    }
  }
  if (orgCode && orgCode !== org.org_code) {
    const existingOrg = await Organization.findOne({ where: { org_code: orgCode } });
    if (existingOrg) {
      return { pointer: '/org_code' };
    }
  }
  return null;
};

/**
 * Move an org's storage directory on rename. Only acts when the old directory
 * exists and the paths differ; a failure throws so the caller rolls the
 * database update back.
 * @param {string} oldFilePath - Current storage path
 * @param {string} newFilePath - Target storage path
 * @returns {void}
 * @throws {Error} When the directory cannot be moved
 */
const moveOrgDirectory = (oldFilePath, newFilePath) => {
  if (fs.existsSync(oldFilePath) && oldFilePath !== newFilePath) {
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }
    fs.renameSync(oldFilePath, newFilePath);
    if (fs.existsSync(oldFilePath)) {
      fs.rmSync(oldFilePath, { recursive: true, force: true });
    }
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

    if (!org) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    const externalRejection = getExternalEditRejection(
      org,
      { organization, email, description, org_code },
      req
    );
    if (externalRejection) {
      return res.status(externalRejection.status).send({ message: externalRejection.message });
    }

    const taken = await getTakenValue(org, organization, org_code);
    if (taken) {
      return conflict(res, req, taken.pointer, 'global');
    }

    const transaction = await sequelize.transaction();
    try {
      await org.update(
        {
          name: organization !== undefined ? organization : org.name,
          description: description !== undefined ? description : org.description,
          email: email !== undefined ? email : org.email,
          emailHash: email ? generateEmailHash(email) : org.emailHash,
          org_code: org_code ? org_code : org.org_code,
        },
        { transaction }
      );
      moveOrgDirectory(oldFilePath, newFilePath);
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

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
