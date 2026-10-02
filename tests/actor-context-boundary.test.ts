import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const mocks = vi.hoisted(() => ({
  checkDatabaseConnection: vi.fn(),
  createOrder: vi.fn(),
  syncOrderPaymentStatus: vi.fn(),
  clearCart: vi.fn(),
  createPaymentIntent: vi.fn(),
}));

vi.mock('../src/config/environment', () => ({
  environment: {
    env: 'test',
    bffAPIKey: 'valid-service-key',
    serviceName: 'order',
    version: 'test',
  },
}));
vi.mock('../src/config/database', () => ({
  checkDatabaseConnection: mocks.checkDatabaseConnection,
}));
vi.mock('../src/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../src/services/order.database.service', () => ({
  createOrder: mocks.createOrder,
  syncOrderPaymentStatus: mocks.syncOrderPaymentStatus,
}));
vi.mock('../src/services/cart.database.service', () => ({ clearCart: mocks.clearCart }));
vi.mock('../src/services/payment.service', () => ({
  paymentService: { createPaymentIntent: mocks.createPaymentIntent },
}));
vi.mock('../src/utils/mappers', () => ({ mapOrderToResponse: () => ({ id: 'order-1' }) }));

import { apiKeyMiddleware } from '../src/middleware/api-key.middleware';
import { actorContextMiddleware } from '../src/middleware/actor-context.middleware';
import type { ActorContext } from '../src/middleware/actor-context.middleware';
import { errorHandler } from '../src/middleware/error-handler.middleware';
import { healthCheck } from '../src/controllers/common.controller';
import routes from '../src/routes';

const directOrder = {
  userId: 'user-1',
  restaurantId: 'restaurant-1',
  restaurantName: 'Restaurant',
  restaurantAddress: '1 Test St',
  deliveryAddress: { line1: '2 Test St', city: 'London', postcode: 'N1', country: 'UK' },
  deliveryFee: 2,
  serviceFee: 1,
  items: [{ dishId: 'dish-1', dishName: 'Dish', unitPrice: 12, quantity: 1, modifiers: [] }],
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.get('/', healthCheck);
  app.use(apiKeyMiddleware);
  app.use(actorContextMiddleware);
  app.use(routes);
  app.use(errorHandler);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve()));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkDatabaseConnection.mockResolvedValue('connected');
  mocks.createOrder.mockResolvedValue({ id: 'order-1', orderNumber: 'ORD-1' });
  mocks.syncOrderPaymentStatus.mockResolvedValue({ id: 'order-1' });
  mocks.clearCart.mockResolvedValue(undefined);
});

const call = (path: string, method: string, actorType?: string, body?: object) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'x-api-key': 'valid-service-key',
      'x-user-id': 'user-1',
      ...(actorType === undefined ? {} : { 'x-actor-type': actorType }),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('actor context at the API-key and router boundary', () => {
  it.each([
    ['USER', 'SYSTEM'],
    ['SYSTEM', 'SYSTEM'],
  ])('rejects an array of actor header values', (...actorTypes) => {
    const next = vi.fn();
    const req: { headers: { 'x-actor-type': string[] }; actor?: ActorContext } = {
      headers: { 'x-actor-type': actorTypes },
    };
    Reflect.apply(actorContextMiddleware, undefined, [req, {}, next]);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(req.actor).toBeUndefined();
  });

  it.each(['USER', 'RESTAURANT', 'DRIVER', 'SYSTEM', 'PLATFORM_ADMIN'])(
    'preserves explicit actor type %s',
    (actorType) => {
      const next = vi.fn();
      const req: { headers: { 'x-actor-type': string }; actor?: ActorContext } = {
        headers: { 'x-actor-type': actorType },
      };
      Reflect.apply(actorContextMiddleware, undefined, [req, {}, next]);
      expect(next).toHaveBeenCalledExactlyOnceWith();
      expect(req.actor?.type).toBe(actorType);
    }
  );

  it.each([undefined, '', ' ', 'UNKNOWN', 'system', 'SYSTEM, SYSTEM'])(
    'rejects actor type %s before direct order creation',
    async (actorType) => {
      const response = await call('/v1/orders', 'POST', actorType, directOrder);
      expect(response.status).toBe(401);
      expect(mocks.createOrder).not.toHaveBeenCalled();
      expect(mocks.syncOrderPaymentStatus).not.toHaveBeenCalled();
      expect(mocks.clearCart).not.toHaveBeenCalled();
      expect(mocks.createPaymentIntent).not.toHaveBeenCalled();
    }
  );

  it('rejects missing actor type before cart mutation', async () => {
    const response = await call('/v1/cart', 'DELETE');
    expect(response.status).toBe(401);
    expect(mocks.clearCart).not.toHaveBeenCalled();
  });

  it('rejects missing actor type before payment-status mutation', async () => {
    const response = await call('/v1/orders/order-1/payment-status', 'POST', undefined, {
      paymentId: 'payment-1',
      paymentStatus: 'SUCCEEDED',
    });
    expect(response.status).toBe(401);
    expect(mocks.syncOrderPaymentStatus).not.toHaveBeenCalled();
  });

  it('rejects an invalid service key before actor context and order creation', async () => {
    const response = await fetch(`${baseUrl}/v1/orders`, {
      method: 'POST',
      headers: {
        'x-api-key': 'wrong-service-key',
        'x-actor-type': 'SYSTEM',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(directOrder),
    });
    expect(response.status).toBe(401);
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('accepts explicit USER for a customer cart mutation', async () => {
    const response = await call('/v1/cart', 'DELETE', 'USER');
    expect(response.status).toBe(200);
    expect(mocks.clearCart).toHaveBeenCalledExactlyOnceWith('user-1');
  });

  it('accepts explicit SYSTEM for the existing payment-status caller', async () => {
    const response = await call('/v1/orders/order-1/payment-status', 'POST', 'SYSTEM', {
      paymentId: 'payment-1',
      paymentStatus: 'SUCCEEDED',
    });
    expect(response.status).toBe(200);
    expect(mocks.syncOrderPaymentStatus).toHaveBeenCalledExactlyOnceWith(
      'order-1',
      'payment-1',
      'SUCCEEDED'
    );
  });

  it('keeps the public health route accessible without credentials or actor headers', async () => {
    const response = await fetch(baseUrl);
    expect(response.status).toBe(200);
    expect(mocks.checkDatabaseConnection).toHaveBeenCalledOnce();
  });
});
