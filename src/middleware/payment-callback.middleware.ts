import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { environment } from '../config/environment';
import { UnauthorizedError } from '../utils/errors';

// Capture the bytes before JSON parsing or schema validation can change the payload.
export function capturePaymentCallbackBody(
  req: IncomingMessage,
  _res: ServerResponse,
  body: Buffer
): void {
  (req as Request).rawBody = Buffer.from(body);
}

export function verifyPaymentCallback(action: 'payment-status') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const token = req.headers['x-payment-callback-token'];
      if (typeof token !== 'string' || !token || !req.rawBody) {
        throw new Error('Missing callback credentials');
      }

      const claims = jwt.verify(token, environment.paymentCallbackSecret, {
        algorithms: ['HS256'],
        issuer: 'payment-service',
        audience: 'order-service',
        subject: req.params.orderId as string,
        maxAge: '60s',
        clockTolerance: 0,
      });
      const now = Math.floor(Date.now() / 1000);
      if (
        typeof claims === 'string' ||
        claims.action !== action ||
        !Number.isInteger(claims.iat) ||
        !Number.isInteger(claims.exp) ||
        typeof claims.iat !== 'number' ||
        typeof claims.exp !== 'number' ||
        claims.iat > now ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > 60 ||
        typeof claims.payloadSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(claims.payloadSha256)
      ) {
        throw new Error('Invalid callback claims');
      }
      const digest = createHash('sha256').update(req.rawBody).digest();
      if (!timingSafeEqual(digest, Buffer.from(claims.payloadSha256, 'hex'))) {
        throw new Error('Callback payload mismatch');
      }
      next();
    } catch {
      next(new UnauthorizedError('Valid payment callback token is required'));
    }
  };
}
