import { z } from 'zod';
import { deliveryAddressSchema } from './cart.schema';

const orderStatusEnum = z.enum([
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]);

const actorTypeEnum = z.enum(['USER', 'RESTAURANT', 'DRIVER', 'SYSTEM']);

const orderItemModifierSchema = z.object({
  name: z.string().min(1),
  option: z.string().min(1),
  extraPrice: z.number().min(0),
});

const orderItemSchema = z.object({
  dishId: z.string().min(1),
  dishName: z.string().min(1),
  dishImageUrl: z.string().url().optional(),
  dishCategory: z.string().optional(),
  unitPrice: z.number().positive(),
  quantity: z.number().int().positive(),
  modifiers: z.array(orderItemModifierSchema).optional().default([]),
});

export const createOrderRequestBodySchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  restaurantId: z.string().min(1, 'restaurantId is required'),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  deliveryAddress: deliveryAddressSchema,
  restaurantName: z.string().min(1, 'restaurantName is required'),
  restaurantAddress: z.string().min(1, 'restaurantAddress is required'),
  deliveryFee: z.number().min(0),
  serviceFee: z.number().min(0),
  discountAmount: z.number().min(0).optional().default(0),
  promoCode: z.string().optional(),
  estimatedDeliveryAt: z.string().datetime().optional(),
});

export const updateOrderStatusRequestBodySchema = z.object({
  status: orderStatusEnum,
  note: z.string().optional(),
});

export const cancelOrderRequestBodySchema = z.object({
  reason: z.string().optional(),
});

export const assignDriverRequestBodySchema = z.object({
  driverId: z.string().min(1, 'driverId is required'),
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().uuid('Invalid orderId'),
});

export const restaurantIdParamsSchema = z.object({
  restaurantId: z.string().min(1, 'restaurantId is required'),
});

export const driverIdParamsSchema = z.object({
  driverId: z.string().min(1, 'driverId is required'),
});

export const listOrdersQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: orderStatusEnum.optional(),
  restaurantId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.string().optional(),
  actorType: actorTypeEnum.optional(),
});
