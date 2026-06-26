import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as cartService from '../../services/cart.database.service';
import * as orderService from '../../services/order.database.service';
import { logger } from '../../utils/logger';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { mapCartToResponse, mapOrderToResponse } from '../../utils/mappers';
import { CommonResponseDTO } from '../../dtos/common.dto';
import { environment } from '../../config/environment';
import {
  AddItemToCartRequestBodyDTO,
  CartItemIdParamsDTO,
  CartResponseDTO,
  CheckoutRequestBodyDTO,
  SyncCartRequestBodyDTO,
  UpdateCartItemRequestBodyDTO,
} from '../../dtos/cart.dto';
import { OrderResponseDTO } from '../../dtos/order.dto';
import { ActorType, OrderStatus, PaymentStatus } from '@prisma/client';
import * as restaurantService from '../../services/restaurant.service';
import { OrderCreatedEventData } from '../../types/event-envelope';
import { publishEvent } from '../../messaging/event-publisher';

export const getCart = async (
  req: Request<unknown, CommonResponseDTO<CartResponseDTO>>,
  res: Response<CommonResponseDTO<CartResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.actor?.userId;
    if (!userId) throw new UnauthorizedError('X-User-Id header is required');

    const cart = await cartService.findCartByUser(userId);

    logger.info({ userId }, 'cart fetched');

    res.status(StatusCodes.OK).json({
      success: true,
      message: cart ? 'Cart retrieved successfully' : 'No active cart',
      data: mapCartToResponse(cart) ?? undefined,
    });
  } catch (error) {
    logger.error(error, 'get cart error');
    next(error);
  }
};

export const addItemToCart = async (
  req: Request<unknown, CommonResponseDTO<CartResponseDTO>, AddItemToCartRequestBodyDTO>,
  res: Response<CommonResponseDTO<CartResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.actor?.userId;
    if (!userId) throw new UnauthorizedError('X-User-Id header is required');

    const cart = await cartService.addItemToCart(userId, req.body);

    logger.info({ userId, cartId: cart.id }, 'item added to cart');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Item added to cart',
      data: mapCartToResponse(cart) ?? undefined,
    });
  } catch (error) {
    logger.error(error, 'add item to cart error');
    next(error);
  }
};

export const syncCart = async (
  req: Request<unknown, CommonResponseDTO<CartResponseDTO>, SyncCartRequestBodyDTO>,
  res: Response<CommonResponseDTO<CartResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.actor?.userId;
    if (!userId) throw new UnauthorizedError('X-User-Id header is required');

    const cart = await cartService.replaceCart(userId, req.body);

    logger.info(
      { userId, cartId: cart?.id, itemCount: req.body.items.length },
      'cart synced from client'
    );

    res.status(StatusCodes.OK).json({
      success: true,
      message: cart ? 'Cart synced' : 'Cart cleared',
      data: mapCartToResponse(cart) ?? undefined,
    });
  } catch (error) {
    logger.error(error, 'sync cart error');
    next(error);
  }
};

export const updateCartItem = async (
  req: Request<
    CartItemIdParamsDTO,
    CommonResponseDTO<CartResponseDTO>,
    UpdateCartItemRequestBodyDTO
  >,
  res: Response<CommonResponseDTO<CartResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.actor?.userId;
    if (!userId) throw new UnauthorizedError('X-User-Id header is required');

    const { cartItemId } = req.params;
    const { quantity } = req.body;

    await cartService.updateCartItemQuantity(cartItemId, userId, quantity);

    const cart = await cartService.findCartByUser(userId);

    logger.info({ userId, cartItemId }, 'cart item updated');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Cart item updated',
      data: mapCartToResponse(cart) ?? undefined,
    });
  } catch (error) {
    logger.error(error, 'update cart item error');
    next(error);
  }
};

export const removeCartItem = async (
  req: Request<CartItemIdParamsDTO, CommonResponseDTO>,
  res: Response<CommonResponseDTO>,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.actor?.userId;
    if (!userId) throw new UnauthorizedError('X-User-Id header is required');

    const { cartItemId } = req.params;
    await cartService.removeCartItem(cartItemId, userId);

    logger.info({ userId, cartItemId }, 'cart item removed');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Cart item removed',
    });
  } catch (error) {
    logger.error(error, 'remove cart item error');
    next(error);
  }
};

export const clearCart = async (
  req: Request,
  res: Response<CommonResponseDTO>,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.actor?.userId;
    if (!userId) throw new UnauthorizedError('X-User-Id header is required');

    await cartService.clearCart(userId);

    logger.info({ userId }, 'cart cleared');

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Cart cleared',
    });
  } catch (error) {
    logger.error(error, 'clear cart error');
    next(error);
  }
};

export const checkout = async (
  req: Request<unknown, CommonResponseDTO<OrderResponseDTO>, CheckoutRequestBodyDTO>,
  res: Response<CommonResponseDTO<OrderResponseDTO>>,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.actor?.userId;
    if (!userId) throw new UnauthorizedError('X-User-Id header is required');

    const cart = await cartService.findCartByUser(userId);
    if (!cart || cart.items.length === 0) {
      throw new BadRequestError('Cart is empty or does not exist');
    }

    const { deliveryAddress, discountAmount, promoCode, estimatedDeliveryAt, paymentMethod } =
      req.body;

    const actorType = req.actor?.type as ActorType;
    const actorId = req.actor?.actorId ?? userId;

    const restaurant = await restaurantService.getRestaurant(cart.restaurantId);

    if (restaurant.status !== 'ACTIVE') {
      throw new BadRequestError('Restaurant is not currently accepting orders');
    }

    const pricedItems = await Promise.all(
      cart.items.map(async (item) => {
        const dish = await restaurantService.getDish(item.dishId);
        restaurantService.assertDishCanBeOrdered(dish, cart.restaurantId);

        return {
          dishId: dish.id,
          dishName: dish.name,
          dishImageUrl: dish.image ?? undefined,
          dishCategory: dish.categoryId,
          unitPrice: dish.price,
          quantity: item.quantity,
          modifiers: item.modifiers.map((m) => ({
            name: m.name,
            option: m.option,
            extraPrice: 0,
          })),
        };
      })
    );

    const subtotal = pricedItems.reduce((sum, item) => {
      const modifiersTotal = item.modifiers.reduce((ms, m) => ms + m.extraPrice, 0);
      return sum + (item.unitPrice + modifiersTotal) * item.quantity;
    }, 0);
    const deliveryFee = restaurant.deliveryCharge;
    const serviceFee = environment.serviceFee;

    if (subtotal < restaurant.minimumValue) {
      throw new BadRequestError(`Minimum order value is ${restaurant.minimumValue}`);
    }

    const normalizedPaymentMethod = paymentMethod ?? 'cash';
    const initialOrderStatus =
      normalizedPaymentMethod === 'cash' ? OrderStatus.CONFIRMED : OrderStatus.PENDING;

    const order = await orderService.createOrderBeforePaymentIntent(
      {
        userId,
        restaurantId: cart.restaurantId,
        items: pricedItems,
        deliveryAddress,
        restaurantName: restaurant.name,
        restaurantAddress: restaurant.address ?? '',
        deliveryFee,
        serviceFee,
        discountAmount,
        promoCode,
        estimatedDeliveryAt,
      },
      actorId,
      actorType,
      normalizedPaymentMethod,
      undefined,
      PaymentStatus.PENDING,
      initialOrderStatus
    );

    await cartService.clearCart(userId);

    const orderCreatedEvent: OrderCreatedEventData = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      userEmail: req.actor?.email,
      userFirstName: req.actor?.firstName,
      userLastName: req.actor?.lastName,
      restaurantId: order.restaurantId,
      restaurantName: order.restaurantName,
      restaurantAddress: order.restaurantAddress,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      serviceFee: order.serviceFee,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      status: order.status,
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
      items: order.items.map((item) => ({
        id: item.id,
        dishId: item.dishId,
        dishName: item.dishName,
        dishImageUrl: item.dishImageUrl,
        dishCategory: item.dishCategory,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        modifiers: item.modifiers.map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          option: modifier.option,
          extraPrice: modifier.extraPrice,
        })),
      })),
      estimatedDeliveryAt: order.estimatedDeliveryAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
    };

    try {
      await publishEvent('order.created', orderCreatedEvent);
    } catch (error) {
      logger.error({ error, orderId: order.id }, 'Failed to publish order.created event');
    }

    logger.info({ userId, orderId: order.id, orderNumber: order.orderNumber }, 'order placed');

    const response = mapOrderToResponse(order) ?? undefined;

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Order placed successfully',
      data: response,
    });
  } catch (error) {
    logger.error(error, 'checkout error');
    next(error);
  }
};
