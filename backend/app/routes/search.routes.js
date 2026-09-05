import { Router } from 'express';
import { sessionAuth } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { search } from '../controllers/search.controller.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/search', rateLimiter, sessionAuth, search);

export default router;
