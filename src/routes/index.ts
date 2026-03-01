import { Router } from 'express';
import itemRoutes from './v1/item.routes';
import commonRoutes from './common.routes';

const router = Router();

router.use('/v1/items', itemRoutes);
router.use(commonRoutes);

export default router;
