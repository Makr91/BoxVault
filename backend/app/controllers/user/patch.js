import { log } from '../../utils/Logger.js';
import { problem, refuse } from '../../utils/problem.js';
import { PROFILE_MEMBERS, profileOf, profilePatchOf } from '../../utils/profile.js';
import db from '../../models/index.js';

const { user: User } = db;

const isProviderAccount = user => Boolean(user.authProvider) && user.authProvider !== 'local';

/**
 * @swagger
 * /api/user:
 *   patch:
 *     summary: Update the signed-in user's profile
 *     description: A JSON Merge Patch (RFC 7396) over the RFC 7643 core attributes of a local account; an omitted member is untouched, null or an empty string clears it, an address object merges member by member and a null address clears every part. An account owned by an identity provider is refused 422 with the readOnly rule on every member sent (RFC 7644 §3.5.2), since the provider's push is what writes these.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               given_name:
 *                 type: string
 *                 nullable: true
 *               family_name:
 *                 type: string
 *                 nullable: true
 *               middle_name:
 *                 type: string
 *                 nullable: true
 *               mobile_number:
 *                 type: string
 *                 nullable: true
 *               address:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   line1:
 *                     type: string
 *                     nullable: true
 *                   city:
 *                     type: string
 *                     nullable: true
 *                   state:
 *                     type: string
 *                     nullable: true
 *                   postal_code:
 *                     type: string
 *                     nullable: true
 *                   country:
 *                     type: string
 *                     nullable: true
 *                   formatted:
 *                     type: string
 *                     nullable: true
 *     responses:
 *       200:
 *         description: The profile members as stored
 *       404:
 *         description: User not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A member failed its rule, or the account is owned by an identity provider (rule readOnly)
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
export const patchUser = async (req, res) => {
  const body = req.body || {};
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('users.userNotFound'),
      });
    }
    const sent = PROFILE_MEMBERS.filter(member => Object.hasOwn(body, member));
    if (isProviderAccount(user)) {
      return refuse(
        res,
        req,
        sent.map(member => ({ pointer: `/${member}`, rule: 'readOnly', params: {} }))
      );
    }
    const patch = profilePatchOf(body);
    if (Object.keys(patch).length > 0) {
      await user.update(patch);
    }
    return res.status(200).send(profileOf(user));
  } catch (err) {
    log.error.error('Error updating the profile:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
