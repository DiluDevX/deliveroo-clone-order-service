import { z } from 'zod';
import {
  addItemToCartRequestBodySchema,
  cartItemIdParamsSchema,
  cartItemModifierSchema,
  checkoutRequestBodySchema,
  updateCartItemRequestBodySchema,
} from '../schema/cart.schema';

export type CartItemModifierDTO = z.infer<typeof cartItemModifierSchema>;
export type AddItemToCartRequestBodyDTO = z.infer<typeof addItemToCartRequestBodySchema>;
export type UpdateCartItemRequestBodyDTO = z.infer<typeof updateCartItemRequestBodySchema>;
export type CartItemIdParamsDTO = z.infer<typeof cartItemIdParamsSchema>;
export type CheckoutRequestBodyDTO = z.infer<typeof checkoutRequestBodySchema>;

export interface CartItemModifierResponseDTO {
  id: string;
  name: string;
  option: string;
  extraPrice: number;
}

export interface CartItemResponseDTO {
  id: string;
  dishId: string;
  dishName: string;
  dishImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  modifiers: CartItemModifierResponseDTO[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CartResponseDTO {
  id: string;
  userId: string;
  restaurantId: string;
  items: CartItemResponseDTO[];
  createdAt: Date;
  updatedAt: Date;
}
