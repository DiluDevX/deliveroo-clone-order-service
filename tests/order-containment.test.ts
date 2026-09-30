import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ActorType, OrderStatus, PaymentStatus } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  orderCreate: vi.fn(),
  findCart: vi.fn(),
  clearCart: vi.fn(),
  getRestaurant: vi.fn(),
  getDish: vi.fn(),
  assertDishCanBeOrdered: vi.fn(),
  publishEvent: vi.fn(),
  createPaymentIntent: vi.fn(),
}));

vi.mock('../src/config/environment', () => ({
  environment: {
    env: 'test',
    serviceFee: 0.99,
    cardPaymentExpiryMinutes: 30,
  },
}));
vi.mock('../src/config/database', () => ({
  prisma: { order: { create: mocks.orderCreate } },
  isPrismaErrorWithCode: () => false,
}));
vi.mock('../src/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../src/services/cart.database.service', () => ({
  findCartByUser: mocks.findCart,
  clearCart: mocks.clearCart,
}));
vi.mock('../src/services/restaurant.service', () => ({
  getRestaurant: mocks.getRestaurant,
  getDish: mocks.getDish,
  assertDishCanBeOrdered: mocks.assertDishCanBeOrdered,
}));
vi.mock('../src/messaging/event-publisher', () => ({ publishEvent: mocks.publishEvent }));
vi.mock('../src/services/payment.service', () => ({
  paymentService: { createPaymentIntent: mocks.createPaymentIntent },
}));
vi.mock('../src/utils/mappers', () => ({ mapOrderToResponse: () => ({ id: 'order-1' }) }));

import cartRoutes from '../src/routes/v1/cart.routes';
import orderRoutes from '../src/routes/v1/order.routes';
import { errorHandler } from '../src/middleware/error-handler.middleware';
import { createOrderBeforePaymentIntent } from '../src/services/order.database.service';
import type { CreateOrderRequestBodyDTO } from '../src/dtos/order.dto';

const address = { line1: '1 Test St', city: 'London', postcode: 'N1', country: 'UK' };
const checkoutBody = { deliveryAddress: address, paymentMethod: 'cash' };
const directBody: CreateOrderRequestBodyDTO = {
  userId: 'user-1',
  restaurantId: 'restaurant-1',
  restaurantName: 'Trusted Restaurant',
  restaurantAddress: '2 Verified St',
  deliveryAddress: address,
  deliveryFee: 2.5,
  serviceFee: 0.99,
  discountAmount: 0,
  items: [
    {
      dishId: 'dish-1',
      dishName: 'Trusted Dish',
      unitPrice: 12,
      quantity: 2,
      modifiers: [],
    },
  ],
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = {
      type: req.path.startsWith('/orders') ? 'PLATFORM_ADMIN' : 'USER',
      userId: 'user-1',
      actorId: 'user-1',
    };
    next();
  });
  app.use('/cart', cartRoutes);
  app.use('/orders', orderRoutes);
  app.use(errorHandler);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
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
  mocks.findCart.mockResolvedValue({
    restaurantId: 'restaurant-1',
    items: [{ dishId: 'dish-1', quantity: 2, modifiers: [] }],
  });
  mocks.getRestaurant.mockResolvedValue({
    name: 'Trusted Restaurant',
    address: '2 Verified St',
    deliveryCharge: 2.5,
    minimumValue: 0,
    status: 'ACTIVE',
  });
  mocks.getDish.mockResolvedValue({
    id: 'dish-1',
    name: 'Trusted Dish',
    categoryId: 'category-1',
    price: 12,
    image: null,
  });
  mocks.orderCreate.mockResolvedValue({
    id: 'order-1',
    orderNumber: 'ORD-TEST',
    userId: 'user-1',
    restaurantId: 'restaurant-1',
    restaurantName: 'Trusted Restaurant',
    restaurantAddress: '2 Verified St',
    subtotal: 24,
    deliveryFee: 2.5,
    serviceFee: 0.99,
    discountAmount: 0,
    totalAmount: 27.49,
    paymentMethod: 'cash',
    paymentStatus: PaymentStatus.PENDING,
    status: OrderStatus.CONFIRMED,
    items: [],
    createdAt: new Date(),
    estimatedDeliveryAt: null,
  });
});

const post = (path: string, body: object) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('checkout HTTP boundary', () => {
  it.each([0, -1, 1_000_000])(
    'rejects client discountAmount %s with no side effects',
    async (amount) => {
      const response = await post('/cart/checkout', { ...checkoutBody, discountAmount: amount });
      expect(response.status).toBe(400);
      expect(mocks.findCart).not.toHaveBeenCalled();
      expect(mocks.orderCreate).not.toHaveBeenCalled();
      expect(mocks.clearCart).not.toHaveBeenCalled();
      expect(mocks.publishEvent).not.toHaveBeenCalled();
      expect(mocks.createPaymentIntent).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['promoCode', 'FREE'],
    ['deliveryFee', 0],
    ['serviceFee', 0],
    ['restaurantName', 'Fake'],
    ['restaurantAddress', 'Fake'],
    ['estimatedDeliveryAt', '2030-01-01T00:00:00.000Z'],
  ])('rejects client-owned %s', async (key, value) => {
    const response = await post('/cart/checkout', { ...checkoutBody, [key]: value });
    expect(response.status).toBe(400);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
    expect(mocks.clearCart).not.toHaveBeenCalled();
    expect(mocks.publishEvent).not.toHaveBeenCalled();
    expect(mocks.createPaymentIntent).not.toHaveBeenCalled();
  });

  it.each([
    ['cash', OrderStatus.CONFIRMED],
    ['card', OrderStatus.PENDING],
  ])('reprices %s checkout from menu and fees', async (method, status) => {
    const response = await post('/cart/checkout', { ...checkoutBody, paymentMethod: method });
    expect(response.status).toBe(201);
    expect(mocks.orderCreate).toHaveBeenCalledOnce();
    const write = mocks.orderCreate.mock.calls[0][0].data;
    expect(write).toMatchObject({
      subtotal: 24,
      deliveryFee: 2.5,
      serviceFee: 0.99,
      discountAmount: 0,
      totalAmount: 27.49,
      status,
      paymentMethod: method,
      restaurantName: 'Trusted Restaurant',
    });
    expect(write.promoCode).toBeUndefined();
    expect(write.estimatedDeliveryAt).toBeUndefined();
    expect(write.items.create[0]).toMatchObject({ unitPrice: 12, quantity: 2, lineTotal: 24 });
    expect(mocks.clearCart).toHaveBeenCalledOnce();
    expect(mocks.publishEvent).toHaveBeenCalledOnce();
  });

  it('accepts a zero-priced catalog dish with server-owned fees', async () => {
    mocks.getDish.mockResolvedValueOnce({
      id: 'dish-1',
      name: 'Complimentary Dish',
      categoryId: 'category-1',
      price: 0,
      image: null,
    });
    const response = await post('/cart/checkout', checkoutBody);
    expect(response.status).toBe(201);
    expect(mocks.orderCreate.mock.calls[0][0].data).toMatchObject({
      subtotal: 0,
      deliveryFee: 2.5,
      serviceFee: 0.99,
      discountAmount: 0,
      totalAmount: 3.49,
    });
  });
});

describe('direct order and shared service guard', () => {
  it('rejects a nonzero direct-order discount before persistence', async () => {
    const response = await post('/orders', { ...directBody, discountAmount: 24 });
    expect(response.status).toBe(400);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
    expect(mocks.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('rejects a direct-order promo before persistence', async () => {
    const response = await post('/orders', { ...directBody, promoCode: 'FREE' });
    expect(response.status).toBe(400);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
    expect(mocks.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('keeps the direct-order positive-price contract', async () => {
    const response = await post('/orders', {
      ...directBody,
      items: [{ ...directBody.items[0], unitPrice: 0 }],
    });
    expect(response.status).toBe(400);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it.each([
    { ...directBody, discountAmount: 24 },
    { ...directBody, promoCode: 'FREE' },
    { ...directBody, serviceFee: Number.POSITIVE_INFINITY },
    { ...directBody, deliveryFee: -1 },
    { ...directBody, items: [{ ...directBody.items[0], unitPrice: Number.NaN }] },
    { ...directBody, items: [{ ...directBody.items[0], quantity: -1 }] },
    {
      ...directBody,
      items: [
        {
          ...directBody.items[0],
          modifiers: [{ name: 'Add-on', option: 'Invalid', extraPrice: -1 }],
        },
      ],
    },
    { ...directBody, items: [{ ...directBody.items[0], unitPrice: 1e308, quantity: 2 }] },
  ])('blocks unsafe service input before Prisma writes: %#', async (input) => {
    await expect(
      createOrderBeforePaymentIntent(input, 'user-1', ActorType.USER)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
    expect(mocks.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('persists an undiscounted direct order', async () => {
    await createOrderBeforePaymentIntent(directBody, 'user-1', ActorType.USER);
    expect(mocks.orderCreate).toHaveBeenCalledOnce();
    expect(mocks.orderCreate.mock.calls[0][0].data).toMatchObject({
      subtotal: 24,
      discountAmount: 0,
      totalAmount: 27.49,
    });
  });

  it('persists a zero-priced direct order item when fees cover the total', async () => {
    await createOrderBeforePaymentIntent(
      { ...directBody, items: [{ ...directBody.items[0], unitPrice: 0 }] },
      'user-1',
      ActorType.USER
    );
    expect(mocks.orderCreate.mock.calls[0][0].data).toMatchObject({
      subtotal: 0,
      totalAmount: 3.49,
    });
  });
});
