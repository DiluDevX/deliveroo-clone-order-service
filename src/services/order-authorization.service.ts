import { ActorType, Order } from '@prisma/client';
import { ActorContext, RestaurantActorRole } from '../middleware/actor-context.middleware';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

const ORDER_MANAGER_ROLES: RestaurantActorRole[] = ['employee', 'super_admin', 'admin'];

const isRestaurantOwner = (actor: ActorContext, restaurantId: string): boolean =>
  actor.type === 'RESTAURANT' &&
  actor.restaurantId === restaurantId &&
  actor.actorId === restaurantId;

export const assertCanAccessRestaurant = (
  actor: ActorContext | undefined,
  restaurantId: string
): void => {
  if (!actor) {
    throw new UnauthorizedError('Authenticated actor context is required');
  }

  if (actor.type === 'PLATFORM_ADMIN') {
    return;
  }

  if (!isRestaurantOwner(actor, restaurantId)) {
    throw new ForbiddenError('You do not have permission to access this restaurant');
  }
};

export const assertCanManageRestaurantOrder = (
  actor: ActorContext | undefined,
  restaurantId: string
): void => {
  assertCanAccessRestaurant(actor, restaurantId);

  if (actor?.type === 'PLATFORM_ADMIN') {
    return;
  }

  if (
    actor?.type !== 'RESTAURANT' ||
    !actor.restaurantRole ||
    !ORDER_MANAGER_ROLES.includes(actor.restaurantRole)
  ) {
    throw new ForbiddenError('Your restaurant role cannot manage orders');
  }
};

export const assertCanViewOrder = (actor: ActorContext | undefined, order: Order): void => {
  if (!actor) {
    throw new UnauthorizedError('Authenticated actor context is required');
  }

  if (actor.type === 'PLATFORM_ADMIN' || actor.type === 'SYSTEM') {
    return;
  }

  if (actor.type === 'USER' && actor.userId === order.userId) {
    return;
  }

  if (isRestaurantOwner(actor, order.restaurantId)) {
    return;
  }

  if (actor.type === 'DRIVER' && actor.actorId === order.driverId) {
    return;
  }

  throw new ForbiddenError('You do not have permission to access this order');
};

export const assertCanCancelOrder = (actor: ActorContext | undefined, order: Order): void => {
  assertCanViewOrder(actor, order);

  if (actor?.type === 'DRIVER') {
    throw new ForbiddenError('Drivers cannot cancel orders');
  }

  if (actor?.type === 'RESTAURANT') {
    assertCanManageRestaurantOrder(actor, order.restaurantId);
  }
};

export const toStoredActorType = (actor: ActorContext | undefined): ActorType => {
  if (actor?.type === 'USER') return ActorType.USER;
  if (actor?.type === 'RESTAURANT') return ActorType.RESTAURANT;
  if (actor?.type === 'DRIVER') return ActorType.DRIVER;
  return ActorType.SYSTEM;
};
