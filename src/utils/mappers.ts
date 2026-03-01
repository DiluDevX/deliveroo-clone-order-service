import { Prisma } from '@prisma/client';
import { CartResponseDTO } from '../dtos/cart.dto';
import { OrderResponseDTO } from '../dtos/order.dto';

type CartWithItems = Prisma.CartGetPayload<{
  include: { items: { include: { modifiers: true } } };
}>;

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    items: { include: { modifiers: true } };
    statusHistory: true;
  };
}>;

export const mapCartToResponse = (cart: CartWithItems | null): CartResponseDTO | null => {
  if (!cart) return null;
  return {
    id: cart.id,
    userId: cart.userId,
    restaurantId: cart.restaurantId,
    items: cart.items.map((item) => ({
      id: item.id,
      dishId: item.dishId,
      dishName: item.dishName,
      dishImageUrl: item.dishImageUrl,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      modifiers: item.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        option: m.option,
        extraPrice: m.extraPrice,
      })),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
};

export const mapOrderToResponse = (order: OrderWithRelations | null): OrderResponseDTO | null => {
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    restaurantId: order.restaurantId,
    driverId: order.driverId,
    status: order.status,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    serviceFee: order.serviceFee,
    discountAmount: order.discountAmount,
    totalAmount: order.totalAmount,
    deliveryAddress: {
      line1: order.deliveryLine1,
      line2: order.deliveryLine2,
      city: order.deliveryCity,
      postcode: order.deliveryPostcode,
      country: order.deliveryCountry,
      latitude: order.deliveryLatitude,
      longitude: order.deliveryLongitude,
      instructions: order.deliveryInstructions,
      label: order.deliveryLabel,
    },
    restaurantName: order.restaurantName,
    restaurantAddress: order.restaurantAddress,
    estimatedDeliveryAt: order.estimatedDeliveryAt,
    actualDeliveryAt: order.actualDeliveryAt,
    promoCode: order.promoCode,
    cancelledAt: order.cancelledAt,
    cancellationActor: order.cancellationActor,
    cancellationReason: order.cancellationReason,
    items: order.items.map((item) => ({
      id: item.id,
      dishId: item.dishId,
      dishName: item.dishName,
      dishImageUrl: item.dishImageUrl,
      dishCategory: item.dishCategory,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      modifiers: item.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        option: m.option,
        extraPrice: m.extraPrice,
      })),
    })),
    statusHistory: order.statusHistory.map((h) => ({
      id: h.id,
      status: h.status,
      note: h.note,
      actorId: h.actorId,
      actorType: h.actorType,
      createdAt: h.createdAt,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};
