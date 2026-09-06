import { getRulesDocument } from '../utils/rules.js';

/**
 * @swagger
 * /api/rules:
 *   get:
 *     summary: The validation rules of every form this host has a route for (public)
 *     description: One JSON Schema 2020-12 document. $defs carries the estate's named patterns (slug, identifier, email, orgCode, providerName, hex) and every pattern a form uses is a $ref into it; forms carries one object schema per form of the Universal Validation Contract, its properties the members of the request body the route reads, in snake_case. The password minimum is the host's auth.local.local_password_min_length. A property carrying unique names the scope its value must not already exist in; only the route decides it and answers 409.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: The rules document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [$schema, $defs, forms]
 *               properties:
 *                 $schema:
 *                   type: string
 *                   example: https://json-schema.org/draft/2020-12/schema
 *                 $defs:
 *                   type: object
 *                   description: The named patterns every host shares
 *                 forms:
 *                   type: object
 *                   description: One object schema per form, keyed login, register, displayName, password, email, serviceAccount, organization, accessMode, invitation, joinRequest, box, iso, version, provider, architecture
 */
const getRules = (req, res) => {
  void req;
  return res.json(getRulesDocument());
};

export { getRules };
