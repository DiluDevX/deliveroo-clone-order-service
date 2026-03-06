import { Router } from 'express';
import cartRoutes from './v1/cart.routes';
import orderRoutes from './v1/order.routes';
import commonRoutes from './common.routes';

const router = Router();

router.use('/v1/cart', cartRoutes);
router.use('/v1/orders', orderRoutes);
router.use(commonRoutes);

export default router;
