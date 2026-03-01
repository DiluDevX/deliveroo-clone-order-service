# deliveroo-clone-order-service

A Deliveroo clone order service built with TypeScript/Express, featuring security-first design,
full type safety, and a complete development workflow.

## Features

- **TypeScript** with strict mode for full type safety
- **Express.js** web framework
- **Prisma ORM** with PostgreSQL
- **Zod** for runtime input validation and environment variable validation
- **Pino** structured logging (with pretty-printing in development)
- **Security-first**: bcrypt password hashing, JWT authentication, timing-safe API key comparison
- **Soft deletes** for data recovery
- **Rate limiting** with configurable limiters
- **Conventional Commits** enforced via commitlint and Husky
- **Docker** multi-stage build support
- **GitHub Actions** CI/CD workflows

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your values (DATABASE_URL, JWT_SECRET, etc.)

# 3. Generate Prisma client
npm run prisma:generate

# 4. Run database migrations
npm run prisma:migrate:new

# 5. Start development server
npm run dev
```

## Folder Structure

```
project-root/
├── src/
│   ├── config/           # Environment and database configuration
│   ├── controllers/      # Route handler functions
│   ├── dtos/             # Data Transfer Object type definitions
│   ├── middleware/       # Express middleware (validation, auth, rate-limit, logging)
│   ├── routes/           # Express route definitions
│   ├── schema/           # Zod validation schemas
│   ├── services/         # Business logic and database services
│   ├── types/            # Global TypeScript types
│   ├── utils/            # Utility functions (errors, logger, jwt, password, html)
│   └── server.ts         # Application entry point
├── prisma/
│   └── schema.prisma     # Prisma data model
├── .github/workflows/    # CI/CD pipeline definitions
├── .husky/               # Git hooks (pre-commit, commit-msg)
├── Dockerfile            # Multi-stage Docker build
├── docker-entrypoint.sh  # Container startup script
└── ...config files
```

## API Endpoints

All routes are prefixed with `/api/v1`.

### Health

| Method | Path             | Description  |
| ------ | ---------------- | ------------ |
| GET    | `/api/v1/health` | Health check |

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

### Users (Example Resource)

| Method | Path                | Description      | Body             |
| ------ | ------------------- | ---------------- | ---------------- |
| GET    | `/api/v1/users`     | List all users   | -                |
| GET    | `/api/v1/users/:id` | Get user by ID   | -                |
| POST   | `/api/v1/users`     | Create a user    | See schema below |
| PATCH  | `/api/v1/users/:id` | Update a user    | See schema below |
| DELETE | `/api/v1/users/:id` | Soft-delete user | -                |

**Create User Body:**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "password": "SecurePass1"
}
```

## Environment Variables

| Variable         | Required | Default        | Description                       |
| ---------------- | -------- | -------------- | --------------------------------- |
| `NODE_ENV`       | No       | `development`  | `development` or `production`     |
| `PORT`           | No       | `3000`         | HTTP server port                  |
| `DATABASE_URL`   | **Yes**  | -              | PostgreSQL connection string      |
| `JWT_SECRET`     | **Yes**  | -              | JWT signing secret (min 32 chars) |
| `JWT_EXPIRY`     | No       | `3600`         | JWT expiry in seconds             |
| `SERVICE_NAME`   | No       | `microservice` | Service name used in logs         |
| `LOG_LEVEL`      | No       | `info`         | Pino log level                    |
| `DOPPLER_TOKEN`  | No       | -              | Doppler secrets manager token     |
| `DOPPLER_CONFIG` | No       | -              | Doppler config name               |

## Development Commands

```bash
npm run dev               # Start with nodemon (hot reload)
npm run build             # Compile TypeScript to dist/
npm run start:development # Run compiled app
npm run start:production  # Run compiled app (production)
npm run lint:check        # Check for lint errors
npm run lint:fix          # Auto-fix lint errors
npm run format:check      # Check formatting
npm run format:fix        # Auto-fix formatting
npm run types:check       # Type-check without emitting
npm run prisma:generate   # Generate Prisma client
npm run prisma:migrate:new# Create and run a new migration
```

## Docker

```bash
# Build the image
docker build -t my-service .

# Run the container
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=your-32-char-secret \
  my-service
```

## Deployment

The repository includes three GitHub Actions workflows:

- **`pr-quality-check.yml`**: Runs lint, format, type-check and build on every PR.
- **`release.yml`**: Runs `semantic-release` on pushes to `main` to auto-generate
  changelogs and GitHub releases.
- **`deploy-ec2.yml`**: Manually triggered workflow that builds a Docker image,
  pushes it to Amazon ECR, and deploys it to an EC2 instance via SSH.

### Required Secrets for Deployment

```
AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
ECR_REPOSITORY
EC2_HOST, EC2_USER, EC2_SSH_KEY
```
