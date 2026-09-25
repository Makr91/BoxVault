/**
 * @swagger
 * components:
 *   schemas:
 *     DownloadFamily:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *           description: The family name, the one a product's family member points at (HCL Domino)
 *         description:
 *           type: string
 *           nullable: true
 *         vendor:
 *           type: string
 *           nullable: true
 *         docs_url:
 *           type: string
 *           format: uri
 *           nullable: true
 *         notes_url:
 *           type: string
 *           format: uri
 *           nullable: true
 *         icon_url:
 *           type: string
 *           format: uri
 *           nullable: true
 *         products:
 *           type: integer
 *           description: How many products of the organization name this family
 *         organization_id:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { conflict, problem } from '../../utils/problem.js';
import { resolveOrgMembership, canWriteInOrg } from '../../utils/orgMembership.js';
const { download: Download, downloadFamilies: DownloadFamily, Sequelize } = db;
const { Op } = Sequelize;

const linkOf = (value, current) => {
  if (value === undefined) {
    return current;
  }
  return value === '' ? null : value;
};

const forbidden = (req, res) =>
  problem(res, req, {
    status: 403,
    type: 'forbidden',
    title: req.__('downloads.families.permissionDenied'),
  });

const notFound = (req, res) =>
  problem(res, req, {
    status: 404,
    type: 'not-found',
    title: req.__('downloads.families.notFound'),
  });

const internal = (req, res, err, message) => {
  log.error.error(message, err);
  return problem(res, req, {
    status: 500,
    type: 'internal',
    title: req.__('errors.operationFailed'),
  });
};

const payloadOf = (body, current = {}) => ({
  ...(body.name !== undefined ? { name: body.name } : {}),
  ...(body.description !== undefined ? { description: body.description } : {}),
  ...(body.vendor !== undefined ? { vendor: body.vendor === '' ? null : body.vendor } : {}),
  docsUrl: linkOf(body.docs_url, current.docsUrl ?? null),
  notesUrl: linkOf(body.notes_url, current.notesUrl ?? null),
  iconUrl: linkOf(body.icon_url, current.iconUrl ?? null),
});

/**
 * The family rows of one organization keyed by name.
 * @param {number} organizationId - Organization id
 * @returns {Promise<Map<string, Object>>} The families by name
 */
const familiesOf = async organizationId => {
  const rows = await DownloadFamily.findAll({ where: { organizationId } });
  return new Map(rows.map(row => [row.name, row]));
};

/**
 * The family rows of every organization, keyed by organization id then name.
 * @returns {Promise<Map<number, Map<string, Object>>>} The families by organization and name
 */
const familiesOfAll = async () => {
  const rows = await DownloadFamily.findAll();
  const map = new Map();
  rows.forEach(row => {
    if (!map.has(row.organizationId)) {
      map.set(row.organizationId, new Map());
    }
    map.get(row.organizationId).set(row.name, row);
  });
  return map;
};

const answerOf = async (family, organizationId) => ({
  ...family.toJSON(),
  products: await Download.count({ where: { organizationId, family: family.name } }),
});

/**
 * @swagger
 * /api/organization/{organization}/download-family:
 *   get:
 *     summary: List the download families of an organization
 *     description: Every family row of the organization with how many products name it, in name order. Anyone who may read the organization's downloads may list them.
 *     tags: [Downloads]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The families
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DownloadFamily'
 *       404:
 *         description: Organization not found
 *   post:
 *     summary: Create a download family
 *     description: A family carries the vendor, documentation link, release-notes link and icon its products share; a product naming the family answers those wherever its own member is empty. A writing member of the organization may create one; the name is unique in the organization.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               vendor:
 *                 type: string
 *               docs_url:
 *                 type: string
 *                 format: uri
 *               notes_url:
 *                 type: string
 *                 format: uri
 *               icon_url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Family created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadFamily'
 *       403:
 *         description: The caller may not write in the organization
 *       409:
 *         description: A family with that name already exists in the organization
 *       422:
 *         description: A value breaks a rule of the family form
 */
const findAll = async (req, res) => {
  try {
    const families = await DownloadFamily.findAll({
      where: { organizationId: req.organizationId },
      order: [['name', 'ASC']],
    });
    return res.send(
      await Promise.all(families.map(family => answerOf(family, req.organizationId)))
    );
  } catch (err) {
    return internal(req, res, err, 'Error listing download families');
  }
};

const create = async (req, res) => {
  const { organization } = req.params;
  try {
    const existing = await DownloadFamily.findOne({
      where: { name: req.body.name, organizationId: req.organizationId },
    });
    if (existing) {
      return conflict(res, req, '/name', organization);
    }
    const family = await DownloadFamily.create({
      ...payloadOf(req.body),
      organizationId: req.organizationId,
    });
    return res.status(201).send(await answerOf(family, req.organizationId));
  } catch (err) {
    return internal(req, res, err, 'Error creating download family');
  }
};

/**
 * @swagger
 * /api/organization/{organization}/download-family/{name}:
 *   get:
 *     summary: Get a download family
 *     tags: [Downloads]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The family
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadFamily'
 *       404:
 *         description: Organization or family not found
 *   put:
 *     summary: Update a download family, or rename it
 *     description: A rename carries every product naming the old name over to the new one. An empty string clears a link or the vendor. A writing member of the organization may update.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               vendor:
 *                 type: string
 *               docs_url:
 *                 type: string
 *                 format: uri
 *               notes_url:
 *                 type: string
 *                 format: uri
 *               icon_url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Family updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadFamily'
 *       403:
 *         description: The caller may not write in the organization
 *       404:
 *         description: Organization or family not found
 *       409:
 *         description: A family with the new name already exists in the organization
 *       422:
 *         description: A value breaks a rule of the family form
 *   delete:
 *     summary: Delete a download family
 *     description: The products naming it keep their family name and lose only the inherited members. A writing member of the organization may delete.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Family deleted
 *       403:
 *         description: The caller may not write in the organization
 *       404:
 *         description: Organization or family not found
 */
const findOne = async (req, res) => {
  try {
    const family = await DownloadFamily.findOne({
      where: { name: req.params.name, organizationId: req.organizationId },
    });
    if (!family) {
      return notFound(req, res);
    }
    return res.send(await answerOf(family, req.organizationId));
  } catch (err) {
    return internal(req, res, err, 'Error reading download family');
  }
};

const update = async (req, res) => {
  const { organization, name } = req.params;
  try {
    const family = await DownloadFamily.findOne({
      where: { name, organizationId: req.organizationId },
    });
    if (!family) {
      return notFound(req, res);
    }
    const newName = req.body.name;
    if (newName && newName !== name) {
      const taken = await DownloadFamily.findOne({
        where: { name: newName, organizationId: req.organizationId, id: { [Op.ne]: family.id } },
      });
      if (taken) {
        return conflict(res, req, '/name', organization);
      }
    }
    const updated = await family.update(payloadOf(req.body, family));
    if (newName && newName !== name) {
      await Download.update(
        { family: newName },
        { where: { family: name, organizationId: req.organizationId } }
      );
    }
    return res.send(await answerOf(updated, req.organizationId));
  } catch (err) {
    return internal(req, res, err, 'Error updating download family');
  }
};

const remove = async (req, res) => {
  try {
    const family = await DownloadFamily.findOne({
      where: { name: req.params.name, organizationId: req.organizationId },
    });
    if (!family) {
      return notFound(req, res);
    }
    await family.destroy();
    return res.send({ message: req.__('downloads.families.deleted') });
  } catch (err) {
    return internal(req, res, err, 'Error deleting download family');
  }
};

/**
 * The organization the route names, attached as req.organizationId, and
 * for a write the caller's writing membership.
 * @param {boolean} writing - Whether the route writes
 * @returns {import('express').RequestHandler}
 */
const attachOrganization = writing => async (req, res, next) => {
  const organization = await db.organization.findOne({ where: { name: req.params.organization } });
  if (!organization) {
    return problem(res, req, {
      status: 404,
      type: 'not-found',
      title: req.__('organizations.organizationNotFound'),
    });
  }
  req.organizationId = organization.id;
  if (writing) {
    const membership = await resolveOrgMembership(req, organization.id);
    if (!canWriteInOrg(membership)) {
      return forbidden(req, res);
    }
  }
  return next();
};

export { familiesOf, familiesOfAll, attachOrganization, findAll, findOne, create, update, remove };
