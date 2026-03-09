# Deliveroo Clone - Order Service

A production-ready TypeScript/Express Node.js microservice for managing orders in a Deliveroo clone. Part of a larger microservices architecture with a BFF (Backend for Frontend) gateway.

## System Architecture

```
┌─────────────┐
│  Frontend   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│        Main API (BFF Gateway)        │
│    - Request aggregation             │
│    - Auth validation                 │
│    - Route to services                │
└──────┬───────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend Services                         │
├──────────┬──────────┬──────────┬──────────┬───────────────┤
│  Order   │  Cart    │ Payment   │  Auth    │ Notification  │
│ Service  │ Service  │ Service   │ Service  │   Service     │
└──────────┴──────────┴──────────┴──────────┴───────────────┘
```

## Features

- ⚡ **Express.js** - Fast, unopinionated web framework
- 🔷 **TypeScript** - Type safety and better developer experience (strict mode)
- 🗄️ **Prisma** - Next-generation ORM for PostgreSQL (AWS RDS ready)
- ✅ **Zod Validation** - Type-safe schema validation for all requests and environment variables
- 📊 **Pino Logging** - Structured JSON logging for production (pretty in development)
- 🔐 **JWT Authentication** - Secure API access with JWT tokens
- 🔑 **API Key Validation** - Secure microservice-to-microservice communication
- 🛡️ **Security Best Practices** - Bcrypt password hashing, rate limiting, timing-safe comparisons, soft deletes
- 🐳 **Docker** - Production and development containers with multi-stage builds
- 🚀 **GitHub Actions** - CI/CD pipeline with quality checks, Semantic Release, and AWS EC2 deployment
- 📝 **Conventional Commits** - Enforced via commitlint and Husky for consistent commit messages

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 12+ (local or AWS RDS)
- Doppler account (for secret management)

### 1. Clone and setup

```bash
git clone https://github.com/DiluDevX/deliveroo-clone-order-service.git
cd deliveroo-clone-order-service
npm install
```

### 2. Set up environment

```bash
# Configure Doppler CLI
doppler auth
doppler setup

# Or use .env file
cp .env.example .env
# Edit with your database URL and secrets
```

### 3. Start database

```bash
# If using local PostgreSQL
createdb order_db

# Or use Docker
docker compose -f docker-compose.dev.yaml up -d db
```

### 4. Run migrations

```bash
doppler run -- npx prisma migrate dev
# OR
npm run prisma:migrate:new
```

### 5. Start development server

```bash
npm run dev
```

Visit:

- API: http://localhost:3000
- Health Check: http://localhost:3000/health
- Prisma Studio: `npm run prisma:studio`

## Project Structure

```
deliveroo-clone-order-service/
├── .github/
│   └── workflows/
│       ├── pr-quality-check.yml    # Lint, format, type check
│       ├── release.yml             # Semantic release
│       └── deploy-ec2.yml          # AWS EC2 deployment
├── prisma/
│   ├── schema.prisma               # Database schema
│   └── migrations/                 # Database migrations
├── src/
│   ├── config/                     # environment.ts (typed singleton), database.ts (Prisma client)
│   ├── controllers/                # common.controller.ts + v1/<domain>.controller.ts
│   ├── dtos/                       # TypeScript interfaces inferred from Zod schemas
│   ├── middleware/                 # validate, error-handler, rate-limiter, api-key
│   ├── routes/                     # index.ts + common.routes.ts + v1/<domain>.routes.ts
│   ├── schema/                     # Zod validation schemas (common + per-domain)
│   ├── services/                   # <domain>.database.service.ts — all Prisma queries live here
│   │   └── payment.service.ts      # Payment service integration (HTTP)
│   ├── types/                      # TypeScript types
│   ├── utils/                      # constants.ts, errors.ts, logger.ts
│   └── index.ts                    # Entry point: connect DB, start HTTP, graceful shutdown
├── Dockerfile                      # Production Docker image
├── docker-entrypoint.sh
├── package.json
├── tsconfig.json
└── README.md
```

## Service Communication

The order service communicates with other services:

| Service      | Communication Method | Description                         |
| ------------ | -------------------- | ----------------------------------- |
| Payment      | Direct HTTP          | Creates payments, confirms, refunds |
| Auth         | JWT + API Key        | Token validation                    |
| Notification | Event-based (future) | Order status updates                |

### Payment Service Integration

The order service makes direct HTTP calls to the payment service:

```typescript
// src/services/payment.service.ts
const PAYMENT_SERVICE_URL = environment.paymentServiceUrl;

const response = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/create-intent`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': environment.paymentServiceApiKey,
  },
  body: JSON.stringify({ amount, currency, metaData }),
});
```

Environment variables required:

```bash
PAYMENT_SERVICE_URL=http://localhost:3001
PAYMENT_SERVICE_API_KEY=your-payment-service-api-key
```

## API Endpoints

All routes are prefixed with `/api/v1` and follow a standardized response envelope:

```json
{
  "success": boolean,
  "message": string,
  "data": { ... }
}
```

### Health Checks

| Method | Path            | Description                   |
| ------ | --------------- | ----------------------------- |
| GET    | `/health`       | Basic health check            |
| GET    | `/health/ready` | Readiness (includes DB check) |
| GET    | `/health/live`  | Liveness probe (Kubernetes)   |

**Response:**

```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "status": "ok",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "uptime": 123.45
  }
}
```

### Orders

| Method | Path                 | Description       | Body             |
| ------ | -------------------- | ----------------- | ---------------- |
| GET    | `/api/v1/orders`     | List all orders   | -                |
| POST   | `/api/v1/orders`     | Create an order   | See schema below |
| GET    | `/api/v1/orders/:id` | Get order by ID   | -                |
| PATCH  | `/api/v1/orders/:id` | Update an order   | See schema below |
| DELETE | `/api/v1/orders/:id` | Soft-delete order | -                |

### Carts

| Method | Path                          | Description      | Body             |
| ------ | ----------------------------- | ---------------- | ---------------- |
| GET    | `/api/v1/carts`               | Get user cart    | -                |
| POST   | `/api/v1/carts`               | Create cart      | See schema below |
| POST   | `/api/v1/carts/items`         | Add item to cart | See schema below |
| PATCH  | `/api/v1/carts/items/:itemId` | Update item      | See schema below |
| DELETE | `/api/v1/carts/items/:itemId` | Remove item      | -                |
| DELETE | `/api/v1/carts`               | Clear cart       | -                |
| POST   | `/api/v1/carts/checkout`      | Checkout cart    | See schema below |

**Create Order Body:**

```json
{
  "restaurantId": "clx5s8z2a000108l2e4q3f6g7",
  "items": [
    {
      "menuItemId": "clx5s8z2a000208l2e4q3f6g8",
      "quantity": 2
    }
  ]
}
```

**Error Responses:**

- `400 Bad Request`: Invalid input data.
- `401 Unauthorized`: Missing or invalid JWT.
- `404 Not Found`: Resource not found.
- `500 Internal Server Error`: Server error.

## Environment Variables

Environment variables are validated using Zod at startup. Never access `process.env` directly — use the `environment` singleton from `src/config/environment.ts`.

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/order_db

# JWT
JWT_ACCESS_SECRET=your-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

# API Security
API_KEY=your-api-key

# Payment Service Integration
PAYMENT_SERVICE_URL=http://localhost:3001
PAYMENT_SERVICE_API_KEY=your-payment-service-api-key

# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
SERVICE_NAME=deliveroo-order-service

# Doppler (optional)
DOPPLER_TOKEN=your-doppler-token
DOPPLER_CONFIG=dev
```

## Common Commands

```bash
npm run dev                  # Start dev server with nodemon (hot reload via ts-node)
npm run build                # Compile TypeScript → dist/
npm run start:development    # Run compiled server (dev)
npm run start:production     # Run compiled server (prod)

npm run lint:check           # ESLint check
npm run lint:fix             # ESLint auto-fix
npm run format:check         # Prettier check
npm run format:fix           # Prettier auto-fix
npm run types:check          # Type-check without emitting

npm run prisma:generate      # Generate Prisma client
npm run prisma:migrate:new   # Create + run a new migration (dev)
npm run prisma:migrate       # Run pending migrations (deploy/production)
npm run prisma:studio        # Open Prisma Studio
npm run prisma:push          # Push schema to DB without migration (prototyping)

npm run release              # Run semantic-release
npm run release:dry-run      # Preview release without publishing
```

## Docker

### Build and Run

```bash
# Build the image (multi-stage)
docker build -t order-service .

# Run the container
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=your-32-char-secret \
  order-service
```

### Production Optimizations

- Multi-stage build reduces final image size.
- Non-root user for security.
- Health checks included.

## Deployment

### GitHub Secrets Configuration

Go to **Repository Settings → Secrets and variables → Actions** and add these secrets:

#### Required Secrets

| Secret                  | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `AWS_ACCESS_KEY_ID`     | AWS IAM user with EC2 and ECR permissions      |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM user secret key                        |
| `EC2_HOST`              | Public IP or DNS of your EC2 instance          |
| `EC2_USER`              | SSH username (e.g., `ec2-user`, `ubuntu`)      |
| `EC2_SSH_KEY`           | Private SSH key for EC2 authentication         |
| `RELEASE_TOKEN`         | GitHub Personal Access Token with `repo` scope |

#### Required Variables

| Variable         | Description                   | Example                        |
| ---------------- | ----------------------------- | ------------------------------ |
| `AWS_REGION`     | AWS region                    | `us-east-1`                    |
| `ECR_REPOSITORY` | ECR repository name           | `deliveroo-order-service`      |
| `CONTAINER_NAME` | Docker container name         | `order-service`                |
| `CONTAINER_PORT` | Container port                | `3000`                         |
| `SECRET`         | AWS Secrets Manager secret ID | `deliveroo-order-service/prod` |

### AWS Secrets Manager Setup

Create a secret in AWS Secrets Manager with all required environment variables:

1. Go to **AWS Console → Secrets Manager → Store a new secret**
2. Choose **Other type of secret (key/value)**
3. Add all required keys:

```json
{
  "DATABASE_URL": "postgresql://user:password@host:5432/dbname",
  "JWT_ACCESS_SECRET": "your-jwt-secret-min-32-chars",
  "JWT_ACCESS_EXPIRES_IN": "15",
  "JWT_REFRESH_SECRET": "your-refresh-secret",
  "JWT_REFRESH_EXPIRES_IN": "7",
  "API_KEY": "your-api-key",
  "PAYMENT_SERVICE_URL": "http://payment-service:3001",
  "PAYMENT_SERVICE_API_KEY": "your-payment-api-key",
  "SERVICE_NAME": "deliveroo-order-service",
  "PORT": "3000",
  "NODE_ENV": "production",
  "LOG_LEVEL": "info"
}
```

4. Name the secret (e.g., `deliveroo-order-service/prod`) - use this as the `SECRET` variable in GitHub.

### IAM Policy for Deploy User

Create an IAM user with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:GetRepositoryPolicy",
        "ecr:DescribeRepositories",
        "ecr:ListImages",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:region:account:secret:deliveroo-order-service/*"
    }
  ]
}
```

### CI/CD Pipelines

#### PR Quality Check

Runs on pull requests to `main` and `develop`:

- ✅ **lint-check** - ESLint validation (parallel)
- ✅ **format-check** - Prettier code style (parallel)
- ✅ **types-check** - TypeScript compilation (parallel)

#### Release

- 📦 Semantic versioning
- 📝 Changelog generation
- 🏷️ Git tag creation

#### Deploy to EC2

Runs on release publish or manual trigger:

- 🐳 Build and push Docker image to AWS ECR
- 🚀 SSH into EC2 instance
- 📥 Pull latest image from ECR
- 🔄 Deploy container with Doppler secrets
- ✅ Restart with `--restart unless-stopped`

### Deployment Environments

- **Development**: Pre-release tags (dev branch)
- **Production**: Release tags (main branch)

### Notes

- Follow **Conventional Commits** for auto-generated changelogs.
- Use `npm run release:dry-run` to preview releases locally.

---

## Architecture

**Layered Express architecture:** Routes → Middleware → Controllers → Services → DB

### Key Patterns

- **Request flow:** Rate limiter → JSON body parser → routes → global error handler
- **Validation:** Zod schemas in `src/schema/`; applied via `validateBody`, `validateQuery`, `validateParams` middleware
- **Response envelope:** `{ success: boolean, message: string, data?: T }`
- **Error handling:** All errors forwarded via `next(error)`; custom `AppError` subclasses in `src/utils/errors.ts`
- **DB access:** Only inside `*.database.service.ts`; all queries filter `deletedAt: null` for soft deletes
- **Environment:** Typed singleton in `src/config/environment.ts`, validated at startup — never `process.env` directly elsewhere
- **API versioning:** Routes under `/v1/` (add `/v2/` when breaking changes are needed)
- **Logging:** Pino only — never `console.log`; `service` and `env` injected on every log line

### Service-to-Service Communication

- **Direct HTTP** between backend services (order → payment)
- **API Key authentication** for service-to-service calls via `X-Api-Key` header
- **BFF Gateway** (Main API) handles frontend requests and aggregates responses
- **Event-based** communication (future) for async operations like notifications

---

## Database & Migrations

- **Migrations (dev):** `npm run prisma:migrate:new` — interactive, creates + runs migration
- **Migrations (deploy):** `npm run prisma:migrate` — runs pending migrations non-interactively
- **Client generation:** `npm run prisma:generate` — must run after any `schema.prisma` change
- **Soft deletes:** All models should include `deletedAt DateTime?`; services always filter `deletedAt: null`
- Always add both a migration and update the Prisma schema together

---

## Rules

Detailed conventions are auto-loaded from `.claude/rules/`:

| Rule File               | Covers                                                     |
| ----------------------- | ---------------------------------------------------------- |
| `typescript.md`         | Strict mode, type safety, Zod inference, code quality      |
| `naming-conventions.md` | Files, controllers, services, DTOs, schemas, errors        |
| `error-handling.md`     | AppError hierarchy, controller pattern, HTTP status codes  |
| `logging.md`            | Pino logger usage, structured format, never console.log    |
| `testing.md`            | Test setup, patterns, coverage targets, tooling guidance   |
| `security.md`           | Secrets, input validation, auth, timing-safe comparisons   |
| `git-workflow.md`       | Conventional commits, branches, Husky pre-commit, npm only |

---

## Security Best Practices

✅ **Authentication**

- JWT tokens with expiration
- Refresh token rotation
- Secure password hashing (bcrypt)
- Timing-safe token comparison

✅ **Input Validation**

- Zod schema validation on all inputs
- HTML escaping for XSS prevention
- Rate limiting on auth endpoints

✅ **Logging & Monitoring**

- Structured JSON logging (Pino)
- No sensitive data logged (emails, passwords, tokens)
- Request/response logging middleware

✅ **Database**

- Soft deletes for data retention
- Partial unique indexes for soft-deleted records
- Connection pooling via Prisma

✅ **Docker**

- Non-root user execution
- Minimal attack surface
- Secret management via Doppler

✅ **Service Communication**

- API Key validation for inter-service calls
- HTTPS in production
- Minimal service exposure

---

## License

ISC
