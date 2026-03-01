import { z } from 'zod';
import {
  assignDriverRequestBodySchema,
  cancelOrderRequestBodySchema,
  createOrderRequestBodySchema,
  driverIdParamsSchema,
  listOrdersQuerySchema,
  orderIdParamsSchema,
  restaurantIdParamsSchema,
  updateOrderStatusRequestBodySchema,
} from '../schema/order.schema';

export type CreateOrderRequestBodyDTO = z.infer<typeof createOrderRequestBodySchema>;
export type UpdateOrderStatusRequestBodyDTO = z.infer<typeof updateOrderStatusRequestBodySchema>;
export type CancelOrderRequestBodyDTO = z.infer<typeof cancelOrderRequestBodySchema>;
export type AssignDriverRequestBodyDTO = z.infer<typeof assignDriverRequestBodySchema>;
export type OrderIdParamsDTO = z.infer<typeof orderIdParamsSchema>;
export type RestaurantIdParamsDTO = z.infer<typeof restaurantIdParamsSchema>;
export type DriverIdParamsDTO = z.infer<typeof driverIdParamsSchema>;
export type ListOrdersQueryDTO = z.infer<typeof listOrdersQuerySchema>;

export type OrderStatusDTO =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export type ActorTypeDTO = 'USER' | 'RESTAURANT' | 'DRIVER' | 'SYSTEM';

export interface OrderItemModifierResponseDTO {
  id: string;
  name: string;
  option: string;
  extraPrice: number;
}

export interface OrderItemResponseDTO {
  id: string;
  dishId: string;
  dishName: string;
  dishImageUrl: string | null;
  dishCategory: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  modifiers: OrderItemModifierResponseDTO[];
}

export interface DeliveryAddressResponseDTO {
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  instructions: string | null;
  label: string | null;
}

export interface OrderStatusHistoryResponseDTO {
  id: string;
  status: OrderStatusDTO;
  note: string | null;
  actorId: string | null;
  actorType: ActorTypeDTO | null;
  createdAt: Date;
}

export interface OrderResponseDTO {
  id: string;
  orderNumber: string;
  userId: string;
  restaurantId: string;
  driverId: string | null;
  status: OrderStatusDTO;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discountAmount: number;
  totalAmount: number;
  deliveryAddress: DeliveryAddressResponseDTO;
  restaurantName: string;
  restaurantAddress: string;
  estimatedDeliveryAt: Date | null;
  actualDeliveryAt: Date | null;
  promoCode: string | null;
  cancelledAt: Date | null;
  cancellationActor: ActorTypeDTO | null;
  cancellationReason: string | null;
  items: OrderItemResponseDTO[];
  statusHistory: OrderStatusHistoryResponseDTO[];
  createdAt: Date;
  updatedAt: Date;
}
