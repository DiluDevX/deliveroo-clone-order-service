import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { UnauthorizedError } from '../utils/errors';

const API_KEY_HEADER = 'x-api-key';

export function apiKeyMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    // If no API key is configured, skip validation
    return next();
  }

  const providedKey = req.headers[API_KEY_HEADER];

  if (!providedKey || typeof providedKey !== 'string') {
    return next(new UnauthorizedError('API key is required'));
  }

  // Use timing-safe comparison to prevent timing attacks
  const expectedBuffer = Buffer.from(apiKey, 'utf8');
  const providedBuffer = Buffer.from(providedKey, 'utf8');

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return next(new UnauthorizedError('Invalid API key'));
  }

  next();
}
