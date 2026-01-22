/**
 * @swagger
 * components:
 *   schemas:
 *     Version:
 *       type: object
 *       required:
 *         - versionNumber
 *         - boxId
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated id of the version
 *         versionNumber:
 *           type: string
 *           description: The version number (e.g., 1.0.0)
 *         description:
 *           type: string
 *           description: Description of the version
 *         boxId:
 *           type: integer
 *           description: ID of the box this version belongs to
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Version creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Version last update timestamp
 *       example:
 *         id: 1
 *         versionNumber: "1.0.0"
 *         description: "Initial release"
 *         boxId: 1
 *         createdAt: "2023-01-01T00:00:00.000Z"
 *         updatedAt: "2023-01-01T00:00:00.000Z"
 *
 *     VersionWithProviders:
 *       allOf:
 *         - $ref: '#/components/schemas/Version'
 *         - type: object
 *           properties:
 *             providers:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   architectures:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         files:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               filename:
 *                                 type: string
 *                               size:
 *                                 type: integer
 *
 *     CreateVersionRequest:
 *       type: object
 *       required:
 *         - versionNumber
 *       properties:
 *         versionNumber:
 *           type: string
 *           description: The version number
 *         description:
 *           type: string
 *           description: Description of the version
 *       example:
 *         versionNumber: "1.0.0"
 *         description: "Initial release"
 *
 *     UpdateVersionRequest:
 *       type: object
 *       properties:
 *         versionNumber:
 *           type: string
 *           description: The new version number
 *         description:
 *           type: string
 *           description: Updated description of the version
 *       example:
 *         versionNumber: "1.0.1"
 *         description: "Bug fixes and improvements"
 */

// version.controller.js
import { create } from './version/create.js';
import { findAllByBox } from './version/box/findall.js';
import { findOne } from './version/findone.js';
import { update } from './version/update.js';
import { delete as deleteVersion } from './version/delete.js';
import { deleteAllByBox } from './version/box/deleteall.js';

export { create, findAllByBox, findOne, update, deleteVersion as delete, deleteAllByBox };
