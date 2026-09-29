# Local setup

## 1. Requirements

- Node.js 24 and npm 11
- Docker Engine with Compose
- Supabase project
- HDFC SmartGateway sandbox merchant account
- SMTP sandbox such as Mailtrap, Resend SMTP, or provider test tenant

Use `nvm use` from repository root.

## 2. Install

```bash
npm ci
cp frontend/.env.local.example frontend/.env.local
cp backend/.env.example backend/.env
```

Fill `backend/.env`; never put service-role, payment secret, SMTP password, webhook
token, session token, or CSRF secret in any `NEXT_PUBLIC_*` variable. Generate the CSRF
secret with a cryptographically secure generator:

```bash
openssl rand -base64 48
```

Development has a fail-safe local default, but production startup rejects that value
and all documented placeholders.

## 3. Infrastructure and database

```bash
docker compose -f backend/compose.dev.yml up -d redis
npm run prisma:generate --workspace=backend
npm run prisma:validate --workspace=backend
npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

Use `prisma migrate dev` only while authoring a new local migration. Staging and
production use `prisma migrate deploy`.

## 4. Run

Terminal one:

```bash
npm run dev:backend
```

Terminal two:

```bash
npm run dev:frontend
```

For device testing on LAN, keep the Next.js host enabled and set `FRONTEND_ORIGIN` to the
exact primary device-facing origin. To allow other exact browser origins, set
`FRONTEND_ORIGINS` to a comma-separated list; the primary `FRONTEND_ORIGIN` is always
included. Never use wildcard CORS. Browser auth uses credentialed `HttpOnly` cookies,
so use stable hostnames rather than alternating between `localhost`, `127.0.0.1`, and a
LAN IP.

Production rejects localhost origins by default. For a deliberate local-to-production
testing setup, add the localhost origin to `FRONTEND_ORIGINS` and set
`ALLOW_LOCALHOST_CORS_IN_PRODUCTION=true`.

## 5. Verify

```bash
npm run verify
npm run test:e2e --workspace=backend
curl http://localhost:3001/api/v1/health
curl http://localhost:3001/api/v1/ready
```

`ready` returns 503 until PostgreSQL and Redis are reachable.

## Environment ownership

Frontend:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Public browser API base URL; `/api/v1` in same-origin production |
| `BACKEND_ORIGIN` | Private origin used by Server Components and the API rewrite |
| `NEXT_PUBLIC_SITE_URL` | Canonical public storefront origin |

Backend values are documented in `backend/.env.example`. Production should set
`NODE_ENV=production`, `ENABLE_SWAGGER=false`, exact `FRONTEND_ORIGIN`, any additional
exact HTTPS origins in `FRONTEND_ORIGINS`, and correct `TRUST_PROXY_HOPS`.
`CSRF_SECRET` must be unique per environment and at least 32 characters.
`SESSION_REFRESH_TTL_SECONDS` controls browser refresh-cookie lifetime; the default is
30 days.
