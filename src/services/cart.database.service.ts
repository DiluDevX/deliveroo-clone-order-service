import { Cart, CartItem, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ConflictError, NotFoundError } from '../utils/errors';
import { AddItemToCartRequestBodyDTO, SyncCartRequestBodyDTO } from '../dtos/cart.dto';
import * as restaurantService from './restaurant.service';

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
  const { restaurantId, dishId, quantity, modifiers } = data;

  const existingCart = await prisma.cart.findFirst({ where: { userId } });

  if (existingCart && existingCart.restaurantId !== restaurantId) {
    throw new ConflictError('Cannot add items from a different restaurant. Clear your cart first.');
  }

  const dish = await restaurantService.getDish(dishId);
  restaurantService.assertDishCanBeOrdered(dish, restaurantId);

  const cart = await prisma.cart.upsert({
    where: { userId_restaurantId: { userId, restaurantId } },
    create: {
      userId,
      restaurantId,
      items: {
        create: {
          dishId,
          dishName: dish.name,
          dishImageUrl: dish.image,
          unitPrice: dish.price,
          quantity,
          modifiers: {
            create: modifiers.map((m) => ({
              name: m.name,
              option: m.option,
              extraPrice: 0,
            })),
          },
        },
      },
    },
    update: {
      items: {
        create: {
          dishId,
          dishName: dish.name,
          dishImageUrl: dish.image,
          unitPrice: dish.price,
          quantity,
          modifiers: {
            create: modifiers.map((m) => ({
              name: m.name,
              option: m.option,
              extraPrice: 0,
            })),
          },
        },
      },
    },
    include: { items: { include: { modifiers: true } } },
  });

  return cart;
};

export const replaceCart = async (
  userId: string,
  data: SyncCartRequestBodyDTO
): Promise<CartWithItems | null> => {
  const { restaurantId, items } = data;

  if (items.length === 0) {
    await clearCart(userId);
    return null;
  }

  const pricedItems = await Promise.all(
    items.map(async (item) => {
      const dish = await restaurantService.getDish(item.dishId);
      restaurantService.assertDishCanBeOrdered(dish, restaurantId);

      return {
        dishId: dish.id,
        dishName: dish.name,
        dishImageUrl: dish.image,
        unitPrice: dish.price,
        quantity: item.quantity,
        modifiers: item.modifiers.map((modifier) => ({
          name: modifier.name,
          option: modifier.option,
          extraPrice: 0,
        })),
      };
    })
  );

  return prisma.$transaction(async (tx) => {
    const existingCart = await tx.cart.findFirst({ where: { userId } });

    if (existingCart) {
      const existingItems = await tx.cartItem.findMany({
        where: { cartId: existingCart.id },
        select: { id: true },
      });
      const existingItemIds = existingItems.map((item) => item.id);

      if (existingItemIds.length > 0) {
        await tx.cartItemModifier.deleteMany({
          where: { cartItemId: { in: existingItemIds } },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: existingCart.id } });
      await tx.cart.delete({ where: { id: existingCart.id } });
    }

    return tx.cart.create({
      data: {
        userId,
        restaurantId,
        items: {
          create: pricedItems.map((item) => ({
            dishId: item.dishId,
            dishName: item.dishName,
            dishImageUrl: item.dishImageUrl,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            modifiers: {
              create: item.modifiers,
            },
          })),
        },
      },
      include: { items: { include: { modifiers: true } } },
    });
  });
};

export const updateCartItemQuantity = async (
  cartItemId: string,
  userId: string,
  quantity: number
): Promise<CartItem> => {
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId },
  });

  if (!item) {
    throw new NotFoundError('Cart item not found');
  }

  const cart = await prisma.cart.findFirst({
    where: { id: item.cartId, userId },
  });

  if (!cart) {
    throw new NotFoundError('Cart item not found');
  }

  return await prisma.cartItem.update({
    where: { id: cartItemId },
    data: { quantity },
  });
};

export const removeCartItem = async (cartItemId: string, userId: string): Promise<CartItem> => {
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId },
  });

  if (!item) {
    throw new NotFoundError('Cart item not found');
  }

  const cart = await prisma.cart.findFirst({
    where: { id: item.cartId, userId },
  });

  if (!cart) {
    throw new NotFoundError('Cart item not found');
  }

  const deleted = await prisma.cartItem.delete({ where: { id: cartItemId } });

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
