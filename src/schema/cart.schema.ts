import { z } from 'zod';

export const cartItemModifierSchema = z.object({
  name: z.string().min(1),
  option: z.string().min(1),
  extraPrice: z.number().min(0),
});

export const addItemToCartRequestBodySchema = z.object({
  restaurantId: z.string().min(1, 'restaurantId is required'),
  dishId: z.string().min(1, 'dishId is required'),
  dishName: z.string().min(1, 'dishName is required'),
  dishImageUrl: z.string().url().optional(),
  unitPrice: z.number().positive('unitPrice must be positive'),
  quantity: z.number().int().positive('quantity must be a positive integer'),
  modifiers: z.array(cartItemModifierSchema).optional().default([]),
});

export const updateCartItemRequestBodySchema = z.object({
  quantity: z.number().int().positive('quantity must be a positive integer'),
});

export const cartItemIdParamsSchema = z.object({
  cartItemId: z.string().uuid('Invalid cartItemId'),
});

export const deliveryAddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  postcode: z.string().min(1),
  country: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  instructions: z.string().optional(),
  label: z.string().optional(),
});

export const checkoutRequestBodySchema = z.object({
  deliveryAddress: deliveryAddressSchema,
  restaurantName: z.string().min(1, 'restaurantName is required'),
  restaurantAddress: z.string().min(1, 'restaurantAddress is required'),
  deliveryFee: z.number().min(0),
  serviceFee: z.number().min(0),
  discountAmount: z.number().min(0).optional().default(0),
  promoCode: z.string().optional(),
  estimatedDeliveryAt: z.string().datetime().optional(),
  paymentMethod: z.enum(['card', 'cash']).optional().default('card'),
});
