import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as cartService from '../../services/cart.database.service';
import * as orderService from '../../services/order.database.service';
import { logger } from '../../utils/logger';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { mapCartToResponse, mapOrderToResponse } from '../../utils/mappers';
import { CommonResponseDTO } from '../../dtos/common.dto';
import {
  AddItemToCartRequestBodyDTO,
  CartItemIdParamsDTO,
  CartResponseDTO,
  CheckoutRequestBodyDTO,
  UpdateCartItemRequestBodyDTO,
} from '../../dtos/cart.dto';
import { OrderResponseDTO } from '../../dtos/order.dto';
import { ActorType } from '@prisma/client';
import { paymentService } from '../../services/payment.service';

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
  req: Request<unknown, CommonResponseDTO>,
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

    const {
      deliveryAddress,
      restaurantName,
      restaurantAddress,
      deliveryFee,
      serviceFee,
      discountAmount,
      promoCode,
      estimatedDeliveryAt,
      paymentMethod,
    } = req.body;

    const actorType = req.actor?.type as ActorType;
    const actorId = req.actor?.actorId ?? userId;

    let paymentId: string | undefined;
    let clientSecret: string | undefined;
    let paymentStatus: 'PENDING' | 'SUCCEEDED' = 'PENDING';

    if (paymentMethod === 'card') {
      const subtotal = cart.items.reduce((sum, item) => {
        const modifiersTotal = item.modifiers.reduce((ms, m) => ms + m.extraPrice, 0);
        return sum + (item.unitPrice + modifiersTotal) * item.quantity;
      }, 0);
      const totalAmount = subtotal + deliveryFee + serviceFee - (discountAmount ?? 0);

      const paymentResult = await paymentService.createPayment(totalAmount, 'usd', {
        userId,
        restaurantId: cart.restaurantId,
      });

      if (!paymentResult.success) {
        throw new BadRequestError(`Payment failed: ${paymentResult.error}`);
      }

      paymentId = paymentResult.paymentId;
      clientSecret = paymentResult.clientSecret;
      paymentStatus = paymentResult.success ? 'SUCCEEDED' : 'PENDING';
    }

    const order = await orderService.createOrderWithPayment(
      {
        userId,
        restaurantId: cart.restaurantId,
        items: cart.items.map((item) => ({
          dishId: item.dishId,
          dishName: item.dishName,
          dishImageUrl: item.dishImageUrl ?? undefined,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          modifiers: item.modifiers.map((m) => ({
            name: m.name,
            option: m.option,
            extraPrice: m.extraPrice,
          })),
        })),
        deliveryAddress,
        restaurantName,
        restaurantAddress,
        deliveryFee,
        serviceFee,
        discountAmount,
        promoCode,
        estimatedDeliveryAt,
      },
      actorId,
      actorType,
      paymentMethod ?? 'cash',
      paymentId,
      paymentStatus
    );

    await cartService.clearCart(userId);

    logger.info({ userId, orderId: order.id, orderNumber: order.orderNumber }, 'order placed');

    const response = mapOrderToResponse(order) ?? undefined;

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Order placed successfully',
      data: {
        ...response,
        paymentClientSecret: clientSecret,
      } as OrderResponseDTO & { paymentClientSecret?: string },
    });
  } catch (error) {
    logger.error(error, 'checkout error');
    next(error);
  }
};
