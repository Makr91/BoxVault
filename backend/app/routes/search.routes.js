import { Router } from 'express';
import { sessionAuth } from '../middleware/index.js';
import { search } from '../controllers/search/search.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

router.get('/search', sessionAuth, search);

export default router;
