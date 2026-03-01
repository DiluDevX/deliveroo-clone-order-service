import { Cart, CartItem, Prisma } from '@prisma/client';
import { isPrismaErrorWithCode, prisma } from '../config/database';
import { ConflictError, NotFoundError } from '../utils/errors';
import { PRISMA_CODE } from '../utils/constants';
import { AddItemToCartRequestBodyDTO } from '../dtos/cart.dto';

type CartWithItems = Prisma.CartGetPayload<{
  include: { items: { include: { modifiers: true } } };
}>;

export const findCartByUser = async (userId: string): Promise<CartWithItems | null> => {
  return prisma.cart.findFirst({
    where: { userId },
    include: { items: { include: { modifiers: true } } },
  });
};

export const findCartById = async (cartId: string): Promise<CartWithItems | null> => {
  return prisma.cart.findFirst({
    where: { id: cartId },
    include: { items: { include: { modifiers: true } } },
  });
};

export const addItemToCart = async (
  userId: string,
  data: AddItemToCartRequestBodyDTO
): Promise<CartWithItems> => {
  const { restaurantId, dishId, dishName, dishImageUrl, unitPrice, quantity, modifiers } = data;

  const existingCart = await prisma.cart.findFirst({ where: { userId } });

  if (existingCart && existingCart.restaurantId !== restaurantId) {
    throw new ConflictError('Cannot add items from a different restaurant. Clear your cart first.');
  }

  const cart = await prisma.cart.upsert({
    where: { userId_restaurantId: { userId, restaurantId } },
    create: {
      userId,
      restaurantId,
      items: {
        create: {
          dishId,
          dishName,
          dishImageUrl,
          unitPrice,
          quantity,
          modifiers: {
            create: modifiers.map((m) => ({
              name: m.name,
              option: m.option,
              extraPrice: m.extraPrice,
            })),
          },
        },
      },
    },
    update: {
      items: {
        create: {
          dishId,
          dishName,
          dishImageUrl,
          unitPrice,
          quantity,
          modifiers: {
            create: modifiers.map((m) => ({
              name: m.name,
              option: m.option,
              extraPrice: m.extraPrice,
            })),
          },
        },
      },
    },
    include: { items: { include: { modifiers: true } } },
  });

  return cart;
};

export const updateCartItemQuantity = async (
  cartItemId: string,
  userId: string,
  quantity: number
): Promise<CartItem> => {
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, cart: { userId } },
  });

  if (!item) {
    throw new NotFoundError('Cart item not found');
  }

  try {
    return await prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });
  } catch (error) {
    if (isPrismaErrorWithCode(error, PRISMA_CODE.NOT_FOUND)) {
      throw new NotFoundError('Cart item not found');
    }
    throw error;
  }
};

export const removeCartItem = async (cartItemId: string, userId: string): Promise<CartItem> => {
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, cart: { userId } },
  });

  if (!item) {
    throw new NotFoundError('Cart item not found');
  }

  const deleted = await prisma.cartItem.delete({ where: { id: cartItemId } });

  // Remove cart if no items remain
  const remaining = await prisma.cartItem.count({ where: { cartId: item.cartId } });
  if (remaining === 0) {
    await prisma.cart.delete({ where: { id: item.cartId } });
  }

  return deleted;
};

export const clearCart = async (userId: string): Promise<Cart | null> => {
  const cart = await prisma.cart.findFirst({ where: { userId } });
  if (!cart) {
    return null;
  }
  return prisma.cart.delete({ where: { id: cart.id } });
};
