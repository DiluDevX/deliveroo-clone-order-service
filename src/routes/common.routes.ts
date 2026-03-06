import { Router } from 'express';
import { fallback, healthCheck } from '../controllers/common.controller';

const router = Router();

router.get('/', healthCheck);

router.all(/.*/, fallback);

export default router;
