import { Router } from 'express';
import cartRoutes from './v1/cart.routes';
import orderRoutes from './v1/order.routes';
import commonRoutes from './common.routes';
import { requireCustomerActor } from '../middleware/customer-actor.middleware';

const router = Router();

router.use('/v1/cart', requireCustomerActor, cartRoutes);
router.use('/v1/orders', orderRoutes);
router.use(commonRoutes);

export default router;
