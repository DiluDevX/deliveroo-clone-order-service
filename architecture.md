# Order Service Architecture

## Purpose

The order service owns carts, cart items, order creation, order status, driver assignment, and order history. Checkout is implemented here: it reads the active cart, creates an order, optionally creates a payment record, clears the cart, and returns the created order.

## Runtime

- Runtime: Node.js >= 24
- Framework: Express 5
- Language: TypeScript
- Database: PostgreSQL via Prisma
- Default local port in .env.example: 3000, but recommended system port is 4002
- Entry point: src/server.ts

## Install and Run

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
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
DATABASE_URL=postgresql://user:password@localhost:5432/order_service_db
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

Commands:

```bash
npm run prisma:generate
npm run prisma:migrate:new
npm run prisma:migrate
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
x-actor-type: USER | RESTAURANT | DRIVER | SYSTEM
```

Current fallback is SYSTEM when x-actor-type is missing, but cart checkout still requires x-user-id. The browser should not provide these. The BFF should derive them from auth and inject them.

## Cart Routes

| Method | Path                       | Body                     | Notes                            |
| ------ | -------------------------- | ------------------------ | -------------------------------- |
| GET    | /v1/cart/                  | none                     | Gets current user's active cart  |
| POST   | /v1/cart/                  | AddItemToCartRequestBody | Adds item to current user's cart |
| PUT    | /v1/cart/items/:cartItemId | { quantity }             | Quantity must be positive        |
| DELETE | /v1/cart/items/:cartItemId | none                     | Removes item                     |
| DELETE | /v1/cart/                  | none                     | Clears cart                      |
| POST   | /v1/cart/checkout          | CheckoutRequestBody      | Converts cart into order         |

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

| Method | Path                                | Purpose                  |
| ------ | ----------------------------------- | ------------------------ |
| GET    | /v1/orders/                         | List orders with filters |
| GET    | /v1/orders/:orderId                 | Get one order            |
| POST   | /v1/orders/                         | Create order directly    |
| GET    | /v1/orders/restaurant/:restaurantId | List by restaurant       |
| GET    | /v1/orders/driver/:driverId         | List by driver           |
| PATCH  | /v1/orders/:orderId/cancel          | Cancel order             |
| PATCH  | /v1/orders/:orderId/status          | Update order status      |
| PATCH  | /v1/orders/:orderId/assign-driver   | Assign driver            |

Use direct order creation for admin/system use cases. Use cart checkout for the customer app.

## Checkout Flow Inside Service

1. Read `x-user-id` from actor context.
2. Load active cart for user.
3. Reject if cart is missing or empty.
4. If `paymentMethod === card`, call payment service through src/services/payment.service.ts.
5. Create order with copied cart items.
6. Create initial order status history.
7. Clear cart.
8. Return created order response.

## Payment Integration

The order service has its own payment client for card checkout. This overlaps with the frontend calling payment service after checkout.

Pick one owner:

- Option A: order checkout owns payment creation and returns payment client secret/status.
- Option B: checkout creates order only, frontend/BFF then calls payment service.

Do not do both, or duplicate payment records will be created.

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
- [ ] Decide whether order service or payment service endpoint owns payment creation.
- [ ] Pickup order handling is defined. Current deliveryAddress schema requires fields.
- [ ] API response DTOs are shared/generated or copied consistently to frontend.
