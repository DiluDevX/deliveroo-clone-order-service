import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const RECOGNIZED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

const reportOrderSelect = {
  id: true,
  orderNumber: true,
  userId: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  totalAmount: true,
  createdAt: true,
  items: {
    select: {
      dishId: true,
      dishName: true,
      dishCategory: true,
      quantity: true,
      lineTotal: true,
    },
  },
} satisfies Prisma.OrderSelect;

export type RestaurantReportOrder = Prisma.OrderGetPayload<{
  select: typeof reportOrderSelect;
}>;

const fullOrderInclude = {
  items: { include: { modifiers: true } },
  statusHistory: true,
} satisfies Prisma.OrderInclude;

export type RestaurantOrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof fullOrderInclude;
}>;

export const findRecognizedOrders = async (
  restaurantId: string,
  from: Date,
  to: Date
): Promise<RestaurantReportOrder[]> =>
  prisma.order.findMany({
    where: {
      restaurantId,
      status: { in: RECOGNIZED_ORDER_STATUSES },
      createdAt: { gte: from, lte: to },
    },
    orderBy: { createdAt: 'asc' },
    select: reportOrderSelect,
  });

export const countActiveOrders = async (restaurantId: string): Promise<number> =>
  prisma.order.count({
    where: {
      restaurantId,
      status: {
        in: [
          OrderStatus.CONFIRMED,
          OrderStatus.PREPARING,
          OrderStatus.READY,
          OrderStatus.OUT_FOR_DELIVERY,
        ],
      },
    },
  });

export const countRecognizedCustomers = async (restaurantId: string): Promise<number> => {
  const customers = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { in: RECOGNIZED_ORDER_STATUSES },
    },
    distinct: ['userId'],
    select: { userId: true },
  });

  return customers.length;
};

export const findRecentOrders = async (
  restaurantId: string,
  limit: number
): Promise<RestaurantOrderWithRelations[]> =>
  prisma.order.findMany({
    where: { restaurantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: fullOrderInclude,
  });
