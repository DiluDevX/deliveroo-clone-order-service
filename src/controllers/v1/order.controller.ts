import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as orderService from '../../services/order.database.service';
import { logger } from '../../utils/logger';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';
import { mapOrderToResponse } from '../../utils/mappers';
import { CommonResponseDTO, PaginatedResponseDTO } from '../../dtos/common.dto';
import {
  AssignDriverRequestBodyDTO,
  CancelOrderRequestBodyDTO,
  CreateOrderRequestBodyDTO,
  DriverIdParamsDTO,
  ListOrdersQueryDTO,
  OrderIdParamsDTO,
  OrderResponseDTO,
  RestaurantIdParamsDTO,
  UpdateOrderStatusRequestBodyDTO,
} from '../../dtos/order.dto';
import { OrderStatus } from '@prisma/client';

export const listOrders = async (
  req: Request<unknown, PaginatedResponseDTO<OrderResponseDTO>, unknown, ListOrdersQueryDTO>,
  res: Response<PaginatedResponseDTO<OrderResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.actor?.userId;
    if (!userId) throw new UnauthorizedError('X-User-Id header is required');

    const query = req.query;
    const parsedPage = query.page ? Number.parseInt(query.page, 10) : 1;
    const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : 20;

    const { orders, total } = await orderService.listOrders(query, userId);

    logger.info({ userId, count: orders.length }, 'orders listed');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: orders.map((o) => mapOrderToResponse(o) as OrderResponseDTO),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error(error, 'list orders error');
    next(error);
  }
};

export const getOrder = async (
  req: Request<OrderIdParamsDTO, CommonResponseDTO<OrderResponseDTO>>,
  res: Response<CommonResponseDTO<OrderResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { orderId } = req.params;
    const order = await orderService.findOrderById(orderId);

    if (!order) throw new NotFoundError('Order not found');

    logger.info({ orderId }, 'order fetched');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Order retrieved successfully',
      data: mapOrderToResponse(order) ?? undefined,
    });
  } catch (error) {
    logger.error(error, 'get order error');
    next(error);
  }
};

export const createOrder = async (
  req: Request<unknown, CommonResponseDTO<OrderResponseDTO>, CreateOrderRequestBodyDTO>,
  res: Response<CommonResponseDTO<OrderResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const actorType = req.actor?.type;
    const actorId = req.actor?.actorId ?? req.actor?.userId;

    const order = await orderService.createOrder(req.body, actorId, actorType);

    logger.info({ orderId: order.id, orderNumber: order.orderNumber }, 'order created');

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Order created successfully',
      data: mapOrderToResponse(order) ?? undefined,
    });
  } catch (error) {
    logger.error(error, 'create order error');
    next(error);
  }
};

export const cancelOrder = async (
  req: Request<OrderIdParamsDTO, CommonResponseDTO<OrderResponseDTO>, CancelOrderRequestBodyDTO>,
  res: Response<CommonResponseDTO<OrderResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { orderId } = req.params;
    const actorType = req.actor?.type;
    const actorId = req.actor?.actorId ?? req.actor?.userId;

    const order = await orderService.cancelOrder(orderId, req.body.reason, actorId, actorType);

    logger.info({ orderId }, 'order cancelled');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Order cancelled successfully',
      data: mapOrderToResponse(order) ?? undefined,
    });
  } catch (error) {
    logger.error(error, 'cancel order error');
    next(error);
  }
};

export const updateOrderStatus = async (
  req: Request<
    OrderIdParamsDTO,
    CommonResponseDTO<OrderResponseDTO>,
    UpdateOrderStatusRequestBodyDTO
  >,
  res: Response<CommonResponseDTO<OrderResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { status, note } = req.body;
    const actorType = req.actor?.type;
    const actorId = req.actor?.actorId ?? req.actor?.userId;

    const order = await orderService.updateOrderStatus(
      orderId,
      status as OrderStatus,
      note,
      actorId,
      actorType
    );

    logger.info({ orderId, status }, 'order status updated');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Order status updated',
      data: mapOrderToResponse(order) ?? undefined,
    });
  } catch (error) {
    logger.error(error, 'update order status error');
    next(error);
  }
};

export const assignDriver = async (
  req: Request<OrderIdParamsDTO, CommonResponseDTO<OrderResponseDTO>, AssignDriverRequestBodyDTO>,
  res: Response<CommonResponseDTO<OrderResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { driverId } = req.body;
    const actorType = req.actor?.type;
    const actorId = req.actor?.actorId ?? req.actor?.userId;

    const order = await orderService.assignDriver(orderId, driverId, actorId, actorType);

    logger.info({ orderId, driverId }, 'driver assigned');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Driver assigned successfully',
      data: mapOrderToResponse(order) ?? undefined,
    });
  } catch (error) {
    logger.error(error, 'assign driver error');
    next(error);
  }
};

export const listOrdersByRestaurant = async (
  req: Request<
    RestaurantIdParamsDTO,
    PaginatedResponseDTO<OrderResponseDTO>,
    unknown,
    ListOrdersQueryDTO
  >,
  res: Response<PaginatedResponseDTO<OrderResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { restaurantId } = req.params;
    const query = req.query;
    const parsedPage = query.page ? Number.parseInt(query.page, 10) : 1;
    const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : 20;

    const { orders, total } = await orderService.listOrdersByRestaurant(restaurantId, query);

    logger.info({ restaurantId, count: orders.length }, 'restaurant orders listed');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: orders.map((o) => mapOrderToResponse(o) as OrderResponseDTO),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error(error, 'list restaurant orders error');
    next(error);
  }
};

export const listOrdersByDriver = async (
  req: Request<
    DriverIdParamsDTO,
    PaginatedResponseDTO<OrderResponseDTO>,
    unknown,
    ListOrdersQueryDTO
  >,
  res: Response<PaginatedResponseDTO<OrderResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const { driverId } = req.params;
    const query = req.query;
    const parsedPage = query.page ? Number.parseInt(query.page, 10) : 1;
    const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : 20;

    const { orders, total } = await orderService.listOrdersByDriver(driverId, query);

    logger.info({ driverId, count: orders.length }, 'driver orders listed');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Orders retrieved successfully',
      data: orders.map((o) => mapOrderToResponse(o) as OrderResponseDTO),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error(error, 'list driver orders error');
    next(error);
  }
};
