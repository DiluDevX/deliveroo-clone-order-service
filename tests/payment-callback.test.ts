import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const secret = 'test-callback-secret-at-least-32-bytes';
const mocks = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock('../src/config/environment', () => ({
  environment: { paymentCallbackSecret: 'test-callback-secret-at-least-32-bytes' },
}));
vi.mock('../src/services/order.database.service', () => ({ syncOrderPaymentStatus: mocks.sync }));
vi.mock('../src/services/restaurant-report.service', () => ({}));
vi.mock('../src/utils/mappers', () => ({ mapOrderToResponse: () => ({ id: 'order-1' }) }));
vi.mock('../src/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import orderRoutes from '../src/routes/v1/order.routes';
import { capturePaymentCallbackBody } from '../src/middleware/payment-callback.middleware';
import { errorHandler } from '../src/middleware/error-handler.middleware';

const body = JSON.stringify({ paymentId: 'payment-1', paymentStatus: 'SUCCEEDED' });
let server: Server;
let baseUrl: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json({ verify: capturePaymentCallbackBody }));
  app.use('/orders', orderRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
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
  mocks.sync.mockResolvedValue({ id: 'order-1' });
});

function token(overrides: Record<string, unknown> = {}, signingSecret = secret) {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: 'payment-service',
    aud: 'order-service',
    sub: 'order-1',
    action: 'payment-status',
    payloadSha256: createHash('sha256').update(body).digest('hex'),
    iat: now,
    exp: now + 60,
    ...overrides,
  };
  for (const key of Object.keys(claims)) {
    if (claims[key] === undefined) delete claims[key];
  }
  return jwt.sign(claims, signingSecret, {
    algorithm: 'HS256',
    noTimestamp:
      Object.prototype.hasOwnProperty.call(overrides, 'iat') && overrides.iat === undefined,
  });
}

function post(callbackToken?: string, payload = body, orderId = 'order-1') {
  return fetch(`${baseUrl}/orders/${orderId}/payment-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Existing gateway credentials and asserted actors cannot authorize callbacks.
      'X-Api-Key': 'gateway-key',
      'X-Actor-Type': 'PLATFORM_ADMIN',
      ...(callbackToken === undefined ? {} : { 'X-Payment-Callback-Token': callbackToken }),
    },
    body: payload,
  });
}

describe('payment callback HTTP boundary', () => {
  it('accepts a signed, order/action/payload-bound callback', async () => {
    expect((await post(token())).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith('order-1', 'payment-1', 'SUCCEEDED');
  });

  it.each([
    ['unsigned', () => undefined],
    ['malformed', () => 'not-a-token'],
    ['wrong secret', () => token({}, 'another-secret-at-least-32-bytes-long')],
    ['wrong issuer', () => token({ iss: 'gateway' })],
    ['wrong audience', () => token({ aud: 'payment-service' })],
    ['wrong action', () => token({ action: 'prepare-payment' })],
    ['missing expiry', () => token({ exp: undefined })],
    ['missing issued-at', () => token({ iat: undefined })],
    ['expired', () => token({ iat: 1, exp: 61 })],
    ['future issued-at', () => token({ iat: Math.floor(Date.now() / 1000) + 10 })],
    ['excess lifetime', () => token({ exp: Math.floor(Date.now() / 1000) + 61 })],
    ['missing payload binding', () => token({ payloadSha256: undefined })],
    ['malformed payload hash', () => token({ payloadSha256: '00' })],
    ['wrong algorithm', () => jwt.sign({ sub: 'order-1' }, secret, { algorithm: 'HS384' })],
    ['unsigned JWT', () => jwt.sign({ sub: 'order-1' }, '', { algorithm: 'none' })],
  ])('rejects %s before order mutation', async (_name, makeToken) => {
    const response = await post(makeToken());
    expect(response.status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('rejects replay against another order', async () => {
    expect((await post(token(), body, 'order-2')).status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it.each([
    JSON.stringify({ paymentId: 'payment-2', paymentStatus: 'SUCCEEDED' }),
    JSON.stringify({ paymentId: 'payment-1', paymentStatus: 'REFUNDED' }),
    JSON.stringify({ paymentId: 'payment-1', paymentStatus: 'SUCCEEDED', extra: true }),
    '{ "paymentId": "payment-1", "paymentStatus": "SUCCEEDED" }',
  ])('rejects altered raw payload before schema coercion', async (payload) => {
    expect((await post(token(), payload)).status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
