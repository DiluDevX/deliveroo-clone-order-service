import { Router } from 'express';
import {
  assignDriver,
  cancelOrder,
  createOrder,
  getOrder,
  listOrders,
  listOrdersByDriver,
  listOrdersByRestaurant,
  preparePayment,
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
  preparePaymentRequestBodySchema,
  restaurantIdParamsSchema,
  updateOrderStatusRequestBodySchema,
} from '../../schema/order.schema';

const router = Router();

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

router.post(
  '/:orderId/prepare-payment',
  validateParams(orderIdParamsSchema),
  validateBody(preparePaymentRequestBodySchema),
  preparePayment
);

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
