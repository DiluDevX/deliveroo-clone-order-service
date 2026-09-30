import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';

const ACTOR_TYPE_VALUES = ['USER', 'RESTAURANT', 'DRIVER', 'SYSTEM', 'PLATFORM_ADMIN'] as const;
type ActorTypeValue = (typeof ACTOR_TYPE_VALUES)[number];
const RESTAURANT_ROLE_VALUES = ['employee', 'super_admin', 'admin', 'finance'] as const;
export type RestaurantActorRole = (typeof RESTAURANT_ROLE_VALUES)[number];

const isActorType = (value: string | string[] | undefined): value is ActorTypeValue =>
  typeof value === 'string' && ACTOR_TYPE_VALUES.some((type) => type === value);

const isRestaurantRole = (value: string | string[] | undefined): value is RestaurantActorRole =>
  typeof value === 'string' && RESTAURANT_ROLE_VALUES.some((role) => role === value);

export interface ActorContext {
  type: ActorTypeValue;
  userId?: string;
  actorId?: string;
  restaurantId?: string;
  restaurantRole?: RestaurantActorRole;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export function actorContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'];
  const actorType = req.headers['x-actor-type'];
  const actorId = req.headers['x-actor-id'];
  const restaurantId = req.headers['x-actor-restaurant-id'];
  const restaurantRole = req.headers['x-actor-restaurant-role'];
  const userEmail = req.headers['x-user-email'];
  const userFirstName = req.headers['x-user-first-name'];
  const userLastName = req.headers['x-user-last-name'];

  if (!isActorType(actorType)) {
    logger.warn({ actorType }, 'Invalid or missing X-Actor-Type header');
    next(new UnauthorizedError('Valid X-Actor-Type header is required'));
    return;
  }

  req.actor = {
    type: actorType,
    userId: typeof userId === 'string' ? userId : undefined,
    actorId: typeof actorId === 'string' ? actorId : undefined,
    restaurantId: typeof restaurantId === 'string' ? restaurantId : undefined,
    restaurantRole: isRestaurantRole(restaurantRole) ? restaurantRole : undefined,
    email: typeof userEmail === 'string' ? userEmail : undefined,
    firstName: typeof userFirstName === 'string' ? userFirstName : undefined,
    lastName: typeof userLastName === 'string' ? userLastName : undefined,
  };

  next();
}
