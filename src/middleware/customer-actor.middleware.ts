import { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export function requireCustomerActor(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor?.userId) {
    next(new UnauthorizedError('Authenticated user context is required'));
    return;
  }

  if (req.actor.type !== 'USER') {
    next(new ForbiddenError('Only customer accounts can use carts and checkout'));
    return;
  }

  next();
}
