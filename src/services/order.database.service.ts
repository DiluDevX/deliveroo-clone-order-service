import { Order, OrderStatus, ActorType, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { isPrismaErrorWithCode, prisma } from '../config/database';
import { BadRequestError, InternalServerError, NotFoundError } from '../utils/errors';
import { PRISMA_CODE } from '../utils/constants';
import { CreateOrderRequestBodyDTO, ListOrdersQueryDTO } from '../dtos/order.dto';
import dayjs from 'dayjs';

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    items: { include: { modifiers: true } };
    statusHistory: true;
  };
}>;

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED],
  DELIVERED: [OrderStatus.REFUNDED],
  CANCELLED: [OrderStatus.REFUNDED],
  REFUNDED: [],
};

const MAX_ORDER_NUMBER_RETRIES = 5;

const generateOrderNumber = (): string => {
  const date = dayjs().format('YYYYMMDD');
  const random = randomBytes(3).toString('hex').toUpperCase().substring(0, 5);
  return `ORD-${date}-${random}`;
};

const orderInclude = {
  items: { include: { modifiers: true } },
  statusHistory: true,
} as const;

export const createOrder = async (
  data: CreateOrderRequestBodyDTO,
  actorId?: string,
  actorType?: ActorType
): Promise<OrderWithRelations> => {
  return createOrderWithPayment(data, actorId, actorType, 'card', undefined, 'SUCCEEDED');
};

export const createOrderWithPayment = async (
  data: CreateOrderRequestBodyDTO,
  actorId?: string,
  actorType?: ActorType,
  paymentMethod?: string,
  paymentId?: string,
  paymentStatus: 'PENDING' | 'SUCCEEDED' | 'FAILED' = 'PENDING'
): Promise<OrderWithRelations> => {
  const {
    userId,
    restaurantId,
    items,
    deliveryAddress,
    restaurantName,
    restaurantAddress,
    deliveryFee,
    serviceFee,
    discountAmount,
    promoCode,
    estimatedDeliveryAt,
  } = data;

  const subtotal = items.reduce((sum, item) => {
    const modifiersTotal = item.modifiers.reduce((ms, m) => ms + m.extraPrice, 0);
    return sum + (item.unitPrice + modifiersTotal) * item.quantity;
  }, 0);

  const totalAmount = subtotal + deliveryFee + serviceFee - (discountAmount ?? 0);

  let orderNumber = generateOrderNumber();
  let retries = 0;

  while (retries < MAX_ORDER_NUMBER_RETRIES) {
    try {
      return await prisma.order.create({
        data: {
          orderNumber,
          userId,
          restaurantId,
          subtotal,
          deliveryFee,
          serviceFee,
          discountAmount: discountAmount ?? 0,
          totalAmount,
          deliveryLine1: deliveryAddress.line1,
          deliveryLine2: deliveryAddress.line2,
          deliveryCity: deliveryAddress.city,
          deliveryPostcode: deliveryAddress.postcode,
          deliveryCountry: deliveryAddress.country,
          deliveryLatitude: deliveryAddress.latitude,
          deliveryLongitude: deliveryAddress.longitude,
          deliveryInstructions: deliveryAddress.instructions,
          deliveryLabel: deliveryAddress.label,
          restaurantName,
          restaurantAddress,
          estimatedDeliveryAt: estimatedDeliveryAt ? new Date(estimatedDeliveryAt) : undefined,
          promoCode,
          paymentMethod: paymentMethod,
          paymentId,
          paymentStatus: paymentStatus,
          items: {
            create: items.map((item) => ({
              dishId: item.dishId,
              dishName: item.dishName,
              dishImageUrl: item.dishImageUrl,
              dishCategory: item.dishCategory,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              lineTotal:
                (item.unitPrice + item.modifiers.reduce((ms, m) => ms + m.extraPrice, 0)) *
                item.quantity,
              modifiers: {
                create: item.modifiers.map((m) => ({
                  name: m.name,
                  option: m.option,
                  extraPrice: m.extraPrice,
                })),
              },
            })),
          },
          statusHistory: {
            create: {
              status: OrderStatus.PENDING,
              actorId,
              actorType,
            },
          },
        },
        include: orderInclude,
      });
    } catch (error) {
      if (isPrismaErrorWithCode(error, PRISMA_CODE.CONFLICT)) {
        orderNumber = generateOrderNumber();
        retries++;
        continue;
      }
      throw error;
    }
  }

  throw new InternalServerError('Failed to generate a unique order number');
};

export const findOrderById = async (orderId: string): Promise<OrderWithRelations | null> => {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
};

export const findOrderByNumber = async (
  orderNumber: string
): Promise<OrderWithRelations | null> => {
  return prisma.order.findUnique({
    where: { orderNumber },
    include: orderInclude,
  });
};

export const listOrders = async (
  query: ListOrdersQueryDTO,
  filterUserId?: string
): Promise<{ orders: OrderWithRelations[]; total: number }> => {
  const parsedPage = query.page ? Number.parseInt(query.page, 10) : 1;
  const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : 20;
  const skip = (parsedPage - 1) * parsedLimit;

  let orderBy: Prisma.OrderOrderByWithRelationInput = { createdAt: 'desc' };
  if (query.sort) {
    const [field, direction] = query.sort.split(':');
    if (field && (direction === 'asc' || direction === 'desc')) {
      orderBy = { [field]: direction };
    }
  }

  const where: Prisma.OrderWhereInput = {};
  if (filterUserId) where.userId = filterUserId;
  if (query.restaurantId) where.restaurantId = query.restaurantId;
  if (query.status) where.status = query.status as OrderStatus;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, skip, take: parsedLimit, orderBy, include: orderInclude }),
    prisma.order.count({ where }),
  ]);

  return { orders, total };
};

export const listOrdersByRestaurant = async (
  restaurantId: string,
  query: ListOrdersQueryDTO
): Promise<{ orders: OrderWithRelations[]; total: number }> => {
  return listOrders({ ...query, restaurantId });
};

export const listOrdersByDriver = async (
  driverId: string,
  query: ListOrdersQueryDTO
): Promise<{ orders: OrderWithRelations[]; total: number }> => {
  const parsedPage = query.page ? Number.parseInt(query.page, 10) : 1;
  const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const where: Prisma.OrderWhereInput = { driverId };
  if (query.status) where.status = query.status as OrderStatus;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: parsedLimit,
      orderBy: { createdAt: 'desc' },
      include: orderInclude,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total };
};

export const updateOrderStatus = async (
  orderId: string,
  newStatus: OrderStatus,
  note?: string,
  actorId?: string,
  actorType?: ActorType
): Promise<OrderWithRelations> => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');

  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed.includes(newStatus)) {
    throw new BadRequestError(`Invalid status transition from ${order.status} to ${newStatus}`);
  }

  const extraFields: Partial<Order> = {};
  if (newStatus === OrderStatus.DELIVERED) {
    extraFields.actualDeliveryAt = new Date();
  }

  try {
    return await prisma.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        ...extraFields,
        statusHistory: {
          create: { status: newStatus, note, actorId, actorType },
        },
      },
      include: orderInclude,
    });
  } catch (error) {
    if (isPrismaErrorWithCode(error, PRISMA_CODE.NOT_FOUND)) {
      throw new NotFoundError('Order not found');
    }
    throw error;
  }
};

export const cancelOrder = async (
  orderId: string,
  reason?: string,
  actorId?: string,
  actorType?: ActorType
): Promise<OrderWithRelations> => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');

  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed.includes(OrderStatus.CANCELLED)) {
    throw new BadRequestError(`Order in status ${order.status} cannot be cancelled`);
  }

  try {
    return await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationActor: actorType,
        cancellationReason: reason,
        statusHistory: {
          create: {
            status: OrderStatus.CANCELLED,
            note: reason,
            actorId,
            actorType,
          },
        },
      },
      include: orderInclude,
    });
  } catch (error) {
    if (isPrismaErrorWithCode(error, PRISMA_CODE.NOT_FOUND)) {
      throw new NotFoundError('Order not found');
    }
    throw error;
  }
};

export const assignDriver = async (
  orderId: string,
  driverId: string,
  actorId?: string,
  actorType?: ActorType
): Promise<OrderWithRelations> => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');

  try {
    return await prisma.order.update({
      where: { id: orderId },
      data: {
        driverId,
        statusHistory: {
          create: {
            status: order.status,
            note: `Driver ${driverId} assigned`,
            actorId,
            actorType,
          },
        },
      },
      include: orderInclude,
    });
  } catch (error) {
    if (isPrismaErrorWithCode(error, PRISMA_CODE.NOT_FOUND)) {
      throw new NotFoundError('Order not found');
    }
    throw error;
  }
};
