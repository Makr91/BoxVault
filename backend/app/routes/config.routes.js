import { Router } from 'express';
import { getGravatarProfile } from '../controllers/config/gravatar.js';
import { getTicketConfig } from '../controllers/config/ticket.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/gravatar/profile/:emailHash', getGravatarProfile);
router.get('/config/ticket', getTicketConfig);

export default router;
