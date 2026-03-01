import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const ACTOR_TYPE_VALUES = ['USER', 'RESTAURANT', 'DRIVER', 'SYSTEM'] as const;
type ActorTypeValue = (typeof ACTOR_TYPE_VALUES)[number];

export interface ActorContext {
  type: ActorTypeValue;
  userId?: string;
  actorId?: string;
}

export function actorContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'];
  const actorType = req.headers['x-actor-type'];
  const actorId = req.headers['x-actor-id'];

  const type: ActorTypeValue = ACTOR_TYPE_VALUES.includes(actorType as ActorTypeValue)
    ? (actorType as ActorTypeValue)
    : 'SYSTEM';

  if (!ACTOR_TYPE_VALUES.includes(actorType as ActorTypeValue)) {
    logger.warn({ actorType }, 'Unknown or missing X-Actor-Type header, defaulting to SYSTEM');
  }

  req.actor = {
    type,
    userId: typeof userId === 'string' ? userId : undefined,
    actorId: typeof actorId === 'string' ? actorId : undefined,
  };

  next();
}
