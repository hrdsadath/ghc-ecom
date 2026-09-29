# Glockery Home Centre ecommerce

Production-oriented ecommerce monorepo for Glockery's Next.js storefront and NestJS API.

## Repository layout

```text
.
├── frontend/            Next.js App Router storefront and administration UI
├── backend/             NestJS API, Prisma schema, workers, and tests
├── docs/                Architecture, setup, integrations, and deployment guides
├── .github/workflows/   Frontend and backend CI
├── compose.prod.yml     Single-host production reference stack
└── package.json         Workspace-level developer commands
```

## Fast start

Requirements: Node.js 24, npm 11, Docker, Supabase project, Redis, and an HDFC
SmartGateway sandbox merchant account.

```bash
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
docker compose -f backend/compose.dev.yml up -d redis
npm run prisma:generate --workspace=backend
npm run prisma:migrate --workspace=backend
```

Run API and UI in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Storefront: `http://localhost:3000`

API: `http://localhost:3001/api/v1`

Swagger: `http://localhost:3001/api/v1/docs` when `ENABLE_SWAGGER=true`.

## Quality gates

```bash
npm run verify
npm run test:e2e --workspace=backend
npm run prisma:validate --workspace=backend
```

Read [local setup](docs/SETUP.md), [integration setup](docs/INTEGRATIONS.md),
[architecture](docs/ARCHITECTURE.md), and [deployment](docs/DEPLOYMENT.md) before
launching.

Browser sessions use backend-managed `HttpOnly` cookies plus signed CSRF tokens.
Generate a unique production `CSRF_SECRET`; never expose Supabase session credentials
to frontend code.
