import db from '../../../models/index.js';
import { resolveOrgMembership } from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';

const { organization: Organization, downloadPendingUploads: PendingUpload } = db;

/**
 * The organization, the caller's membership and the pending upload a
 * pending route names: 404 for an unknown organization, 403 for a caller
 * without a membership, 404 for an id that is not a pending upload of this
 * organization. Answers the refusal itself and returns null.
 * @param {import('express').Request} req - The request
 * @param {import('express').Response} res - The response
 * @returns {Promise<{organization: Object, membership: Object, pending: Object}|null>} The rows, or null after a refusal
 */
const resolvePending = async (req, res) => {
  const { organization: organizationName, id } = req.params;

  const organization = await Organization.findOne({ where: { name: organizationName } });
  if (!organization) {
    problem(res, req, {
      status: 404,
      type: 'not-found',
      title: req.__('organizations.organizationNotFoundWithName', {
        organization: organizationName,
      }),
    });
    return null;
  }

  const membership = await resolveOrgMembership(req, organization.id);
  if (!membership) {
    problem(res, req, {
      status: 403,
      type: 'forbidden',
      title: req.__('downloads.permissionDenied'),
    });
    return null;
  }

  const pending = await PendingUpload.findOne({ where: { id, organizationId: organization.id } });
  if (!pending) {
    problem(res, req, { status: 404, type: 'not-found' });
    return null;
  }

  return { organization, membership, pending };
};

export { resolvePending };
