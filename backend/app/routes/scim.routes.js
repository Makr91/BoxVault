import { Router, json } from 'express';
import { scimAuth } from '../middleware/scimAuth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
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

// SCIM clients send application/scim+json (RFC 7644); the global body parser
// only handles application/json, so parse both here.
router.use(json({ type: ['application/json', 'application/scim+json'] }));

router.post('/Users', apiLimiter, scimAuth, createUser);
router.get('/Users', apiLimiter, scimAuth, findUsers);
router.put('/Users/:id', apiLimiter, scimAuth, putUser);
router.delete('/Users/:id', apiLimiter, scimAuth, deleteScimUser);
router.post('/Groups', apiLimiter, scimAuth, createGroup);
router.get('/Groups', apiLimiter, scimAuth, findGroups);
router.put('/Groups/:id', apiLimiter, scimAuth, putGroup);
router.delete('/Groups/:id', apiLimiter, scimAuth, deleteGroup);

export default router;
