# Order Service Architecture

## Purpose

The order service owns carts, cart items, order creation, order payment state, order status, driver assignment, and order history. Checkout is implemented here: it reads the active cart, calculates trusted totals from service-side pricing, creates a pending order, clears the cart, and returns the created order.

## Runtime

- Runtime: Node.js >= 24
- Framework: Express 5
- Language: TypeScript
- Database: MongoDB via Prisma
- Default local port in .env.example: 3000, but recommended system port is 4002
- Entry point: src/server.ts

## Install and Run

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:push
npm run dev
```

Production-style local run:

```bash
npm run build
npm run start:development
```

Useful checks:

```bash
npm run types:check
npm run lint:check
npm run format:check
```

## Required Environment

```env
PORT=4002
NODE_ENV=development
SERVICE_NAME=deliveroo-clone-order-service
DATABASE_URL=mongodb://localhost:27017/order_service
BFF_API_KEY=shared-order-service-key
LOG_LEVEL=info
APP_VERSION=1.0.0
BASE_URL=http://localhost:4002
RESEND_API_KEY=re_development_key
PAYMENT_SERVICE_URL=http://localhost:4003
PAYMENT_SERVICE_API_KEY=shared-payment-service-key
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=1000
```

The BFF's `ORDER_SERVICE_API_KEY` must equal this service's `BFF_API_KEY`.

## Database

Prisma schema: prisma/schema.prisma

Main concepts:

- Cart
- CartItem
- CartItemModifier
- Order
- OrderItem
- OrderStatusHistory
- Payment reference/status fields through order creation
- Payment status synchronization from payment service

Commands:

```bash
npm run prisma:generate
npm run prisma:push
npm run prisma:studio
```

## Route Mounts

src/routes/index.ts mounts:

| Mount      | Purpose                              |
| ---------- | ------------------------------------ |
| /v1/cart   | Cart and checkout                    |
| /v1/orders | Order querying and state transitions |

All routes require the internal service API key through `apiKeyMiddleware` at the router level.

## Required Actor Headers

The service uses actor-context.middleware.ts. Cart and checkout require:

```http
x-user-id: <authenticated user id>
```

Optional but recommended:

```http
x-actor-id: <authenticated actor id>
x-actor-user-id: <authenticated user id>
x-actor-type: USER | RESTAURANT | DRIVER | SYSTEM | PLATFORM_ADMIN
x-actor-restaurant-id: <verified restaurant assignment for restaurant actors>
x-actor-restaurant-role: employee | super_admin | admin | finance
```

Current fallback is SYSTEM when x-actor-type is missing, but cart checkout still requires x-user-id. The browser should not provide these. The BFF should derive them from auth and inject them.

All cart and checkout routes require a `USER` actor. Restaurant staff and platform administrators
cannot create or modify customer carts. Direct order creation is reserved for platform/system actors;
customer orders must be created through server-priced cart checkout.

## Cart Routes

| Method | Path                       | Body                     | Notes                                 |
| ------ | -------------------------- | ------------------------ | ------------------------------------- |
| GET    | /v1/cart/                  | none                     | Gets current user's active cart       |
| POST   | /v1/cart/                  | AddItemToCartRequestBody | Adds item to current user's cart      |
| POST   | /v1/cart/sync              | SyncCartRequestBody      | Replaces server cart with client cart |
| PUT    | /v1/cart/items/:cartItemId | { quantity }             | Quantity must be positive             |
| DELETE | /v1/cart/items/:cartItemId | none                     | Removes item                          |
| DELETE | /v1/cart/                  | none                     | Clears cart                           |
| POST   | /v1/cart/checkout          | CheckoutRequestBody      | Converts cart into order              |

### Add Item Body

```json
{
  "restaurantId": "restaurant-id",
  "dishId": "dish-id",
  "dishName": "Margherita Pizza",
  "dishImageUrl": "https://example.com/pizza.jpg",
  "unitPrice": 12.99,
  "quantity": 1,
  "modifiers": []
}
```

The service rejects adding items from a different restaurant while a cart exists.

### Sync Cart Body

Use this for login/session cart reconciliation when the browser has a local cart. It replaces the user's active server cart with the submitted items in one request.

```json
{
  "restaurantId": "restaurant-id",
  "items": [
    {
      "dishId": "dish-id",
      "quantity": 2,
      "modifiers": []
    }
  ]
}
```

The service validates dishes against the restaurant service and stores current server-side dish names, images, and prices. Frontend item names and prices are not trusted.

### Checkout Body

Current schema accepts:

```json
{
  "deliveryAddress": {
    "line1": "123 Main St",
    "city": "London",
    "postcode": "SW1A 1AA",
    "country": "UK"
  },
  "restaurantName": "Pizza Shop",
  "restaurantAddress": "1 High Street",
  "deliveryFee": 5,
  "serviceFee": 0.99,
  "discountAmount": 0,
  "promoCode": "OPTIONAL",
  "estimatedDeliveryAt": "2026-05-02T12:00:00.000Z",
  "paymentMethod": "card"
}
```

Important: paymentMethod currently must be `card` or `cash`. The frontend and payment service use different values. Normalize this at the BFF or change all services to one enum.

## Order Routes

| Method | Path                                          | Purpose                                  |
| ------ | --------------------------------------------- | ---------------------------------------- |
| GET    | /v1/orders/                                   | List orders with filters                 |
| GET    | /v1/orders/:orderId                           | Get one order                            |
| POST   | /v1/orders/                                   | Create order directly                    |
| GET    | /v1/orders/restaurant/:restaurantId           | List by restaurant                       |
| GET    | /v1/orders/restaurant/:restaurantId/summary   | Restaurant dashboard summary             |
| GET    | /v1/orders/restaurant/:restaurantId/analytics | Six-month restaurant analytics           |
| GET    | /v1/orders/driver/:driverId                   | List by driver                           |
| PATCH  | /v1/orders/:orderId/cancel                    | Cancel order                             |
| PATCH  | /v1/orders/:orderId/status                    | Update order status                      |
| PATCH  | /v1/orders/:orderId/assign-driver             | Assign driver                            |
| POST   | /v1/orders/:orderId/prepare-payment           | Validate order and create payment intent |
| POST   | /v1/orders/:orderId/payment-status            | Sync payment status from payment service |

Use direct order creation for admin/system use cases. Use cart checkout for the customer app.

Restaurant order, summary, and analytics routes require verified actor context. Restaurant actors
may only access the restaurant id assigned by auth-service; platform admins may access any
restaurant. Restaurant staff with an operational role may move orders from confirmed to preparing
and from preparing to ready. Only the assigned driver may move a ready order to out for delivery and
then delivered. Platform and trusted system actors retain operational override access.

Dashboard and analytics revenue includes recognized orders (`CONFIRMED` through `DELIVERED`) and
excludes pending payment attempts, cancellations, and refunds. Reporting periods currently use UTC
because restaurant timezone data is not yet stored. Dashboard customer counts are unique recognized
customers from the latest 30-day reporting window. Compound order indexes support restaurant/date
and restaurant/status/date reporting queries; run `npm run prisma:push` after schema changes.

## Checkout Flow Inside Service

1. Read `x-user-id` from actor context.
2. Load active cart for user.
3. Reject if cart is missing or empty.
4. Resolve item prices and totals inside the service.
5. Create order with copied cart items, trusted totals, and `paymentStatus = PENDING`.
6. Create initial order status history.
7. Clear cart.
8. Return created order response.

## Payment Integration

The order service owns the order-side payment contract. The BFF should call `/v1/orders/:orderId/prepare-payment` after checkout, not call payment service with frontend-provided totals.

Current card flow:

1. Checkout creates a `PENDING` order with trusted totals.
2. BFF calls `POST /v1/orders/:orderId/prepare-payment`.
3. Order service validates that the order belongs to the actor, is payable, and has trusted totals.
4. Order service calls payment service with trusted amount, user, restaurant, currency, and commission data.
5. Order service stores the returned `paymentId` and marks `paymentStatus = PROCESSING`.
6. Frontend confirms the Stripe PaymentIntent with Stripe.js.
7. Payment service receives either the frontend confirm call or Stripe webhook.
8. Payment service calls `POST /v1/orders/:orderId/payment-status`.
9. Order service verifies the `paymentId` matches the order and idempotently updates payment status.
10. When payment status becomes `SUCCEEDED`, a `PENDING` order is moved to `CONFIRMED`.

### Payment Status Sync Body

This endpoint is for internal payment-service calls only:

```json
{
  "paymentId": "payment-service-payment-id",
  "paymentStatus": "SUCCEEDED"
}
```

Allowed statuses are `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`, and `CANCELLED`.

The service rejects updates when the stored `paymentId` does not match. Duplicate delivery of the same status is safe and returns the current order.

## Smoke Test Through BFF

Assuming BFF injects x-user-id:

```bash
curl -X POST http://localhost:4000/api/cart \
  -H 'content-type: application/json' \
  -H 'x-api-key: frontend-bff-key' \
  -H 'authorization: Bearer <accessToken>' \
  -d '{"restaurantId":"r1","dishId":"d1","dishName":"Pizza","unitPrice":12.99,"quantity":1,"modifiers":[]}'
```

Direct service smoke test:

```bash
curl -X GET http://localhost:4002/v1/cart/ \
  -H 'x-api-key: shared-order-service-key' \
  -H 'x-user-id: user-id' \
  -H 'x-actor-id: user-id' \
  -H 'x-actor-type: USER'
```

## Merge-Readiness Checklist

- [ ] BFF injects actor headers; browser does not send x-user-id.
- [ ] Checkout payment method enum is aligned with frontend and payment service.
- [ ] Payment service `ORDER_SERVICE_API_KEY` equals this service's `BFF_API_KEY`.
- [ ] Stripe webhook is configured to call payment service.
- [ ] Pickup order handling is defined. Current deliveryAddress schema requires fields.
- [ ] API response DTOs are shared/generated or copied consistently to frontend.
