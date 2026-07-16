import { ActorType, Order, OrderStatus } from '@prisma/client';
import { ActorContext, RestaurantActorRole } from '../middleware/actor-context.middleware';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

const ORDER_MANAGER_ROLES: RestaurantActorRole[] = ['employee', 'super_admin', 'admin'];
const RESTAURANT_MANAGED_STATUSES = new Set<OrderStatus>([
  OrderStatus.PREPARING,
  OrderStatus.READY,
]);
const DRIVER_MANAGED_STATUSES = new Set<OrderStatus>([
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
]);

const isRestaurantActor = (actor: ActorContext, restaurantId: string): boolean =>
  actor.type === 'RESTAURANT' && actor.restaurantId === restaurantId;

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

  if (!isRestaurantActor(actor, restaurantId)) {
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

export const assertCanUpdateOrderStatus = (
  actor: ActorContext | undefined,
  order: Order,
  status: OrderStatus
): void => {
  if (!actor) {
    throw new UnauthorizedError('Authenticated actor context is required');
  }

  if (actor.type === 'PLATFORM_ADMIN' || actor.type === 'SYSTEM') {
    return;
  }

  if (actor.type === 'RESTAURANT') {
    assertCanManageRestaurantOrder(actor, order.restaurantId);

    if (!RESTAURANT_MANAGED_STATUSES.has(status)) {
      throw new ForbiddenError('Restaurant staff can only mark orders as preparing or ready');
    }
    return;
  }

  if (actor.type === 'DRIVER') {
    if (!actor.actorId || actor.actorId !== order.driverId) {
      throw new ForbiddenError('Only the assigned driver can update delivery status');
    }

    if (!DRIVER_MANAGED_STATUSES.has(status)) {
      throw new ForbiddenError('Drivers can only mark orders as out for delivery or delivered');
    }
    return;
  }

  throw new ForbiddenError('You do not have permission to update this order status');
};

export const assertCanCreateDirectOrder = (actor: ActorContext | undefined): void => {
  if (!actor) {
    throw new UnauthorizedError('Authenticated actor context is required');
  }

  if (actor.type !== 'PLATFORM_ADMIN' && actor.type !== 'SYSTEM') {
    throw new ForbiddenError('Customer orders must be created through cart checkout');
  }
};

export const assertCustomerActor = (actor: ActorContext | undefined): void => {
  if (!actor?.userId) {
    throw new UnauthorizedError('Authenticated customer context is required');
  }

  if (actor.type !== 'USER') {
    throw new ForbiddenError('Only customer accounts can perform this action');
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

  if (isRestaurantActor(actor, order.restaurantId)) {
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
