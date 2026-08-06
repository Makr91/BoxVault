import { Router, json } from 'express';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { scimAuth } from '../middleware/scimAuth.js';
import { createUser, findUsers, putUser, deleteScimUser } from '../controllers/scim/users.js';
import { createGroup, findGroups, putGroup, deleteGroup } from '../controllers/scim/groups.js';

/**
 * SCIM 2.0 receiver (mounted at /scim/v2). Contract surface is two resources
 * (Users, Groups): POST creates and returns the BoxVault-ASSIGNED resource id
 * (RFC 7644 §3.3), GET supports exactly one filter (externalId eq "<value>")
 * as the auth server's recovery lookup, and PUT/DELETE address resources by
 * the BoxVault-assigned id. The auth server's identity travels ONLY in
 * externalId, scoped per issuer. No PATCH exists by design: every PUT is full
 * desired state, so updates are idempotent by construction.
 */
const router = Router();

// Apply rate limiting to this router
router.use(rateLimiter);

// SCIM clients send application/scim+json (RFC 7644); the global body parser
// only handles application/json, so parse both here.
router.use(json({ type: ['application/json', 'application/scim+json'] }));

router.use(scimAuth);

router.post('/Users', createUser);
router.get('/Users', findUsers);
router.put('/Users/:id', putUser);
router.delete('/Users/:id', deleteScimUser);
router.post('/Groups', createGroup);
router.get('/Groups', findGroups);
router.put('/Groups/:id', putGroup);
router.delete('/Groups/:id', deleteGroup);

export default router;
