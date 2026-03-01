import { Router } from 'express';
import {
  assignDriver,
  cancelOrder,
  createOrder,
  getOrder,
  listOrders,
  listOrdersByDriver,
  listOrdersByRestaurant,
  updateOrderStatus,
} from '../../controllers/v1/order.controller';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware';
import {
  assignDriverRequestBodySchema,
  cancelOrderRequestBodySchema,
  createOrderRequestBodySchema,
  driverIdParamsSchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
  restaurantIdParamsSchema,
  updateOrderStatusRequestBodySchema,
} from '../../schema/order.schema';

const router = Router();

// Static sub-routes must be registered before /:orderId to avoid conflicts
router.get(
  '/restaurant/:restaurantId',
  validateParams(restaurantIdParamsSchema),
  validateQuery(listOrdersQuerySchema),
  listOrdersByRestaurant
);

router.get(
  '/driver/:driverId',
  validateParams(driverIdParamsSchema),
  validateQuery(listOrdersQuerySchema),
  listOrdersByDriver
);

router.get('/', validateQuery(listOrdersQuerySchema), listOrders);

router.get('/:orderId', validateParams(orderIdParamsSchema), getOrder);

router.post('/', validateBody(createOrderRequestBodySchema), createOrder);

router.patch(
  '/:orderId/cancel',
  validateParams(orderIdParamsSchema),
  validateBody(cancelOrderRequestBodySchema),
  cancelOrder
);

router.patch(
  '/:orderId/status',
  validateParams(orderIdParamsSchema),
  validateBody(updateOrderStatusRequestBodySchema),
  updateOrderStatus
);

router.patch(
  '/:orderId/assign-driver',
  validateParams(orderIdParamsSchema),
  validateBody(assignDriverRequestBodySchema),
  assignDriver
);

export default router;
