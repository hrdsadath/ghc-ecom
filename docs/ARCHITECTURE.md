# Architecture

## System shape

```text
Browser
  │ HTTPS
  ▼
Next.js server / CDN ── SSR pages, cached catalogue reads, immutable static assets
  │ /api/v1
  ▼
NestJS API
  ├── Supabase Auth + Storage
  ├── PostgreSQL through Prisma
  ├── Redis + BullMQ workers
  ├── HDFC SmartGateway payments/webhooks
  ├── SMTP / notification provider
  └── Shipping provider
```

Frontend and backend deploy independently but share one versioned repository. Browser
talks only to API; service-role, payment, SMTP, and provider secrets stay server-side.
In production, Nginx exposes the API under the storefront origin.

## Browser authentication boundary

Normal Supabase access and refresh tokens exist only in backend-set cookies.
Production cookies are `Secure`, `HttpOnly`, `SameSite=Lax`, host-only, and never
returned in JSON. The frontend keeps only public user data and a signed CSRF token in
memory. Every state-changing cookie-authenticated request must send `x-csrf-token`.

The backend still accepts bearer access tokens for non-browser API clients. CSRF is
not required for those clients because browsers do not attach bearer headers
automatically.

## Backend boundaries

Backend uses feature modules: auth, catalogue, cart, checkout, payments, orders,
inventory, fulfilment, promotions, notifications, audit, operations, and health.
Controllers validate transport input; services own business rules; Prisma owns
persistence. External integrations live behind dedicated services. Payment and
notification work uses durable queues and idempotent records.

## Frontend boundaries

Frontend uses pages for route composition, components for reusable UI, contexts for
session/cart/wishlist state, `lib/api.ts` as transport boundary, and `types/` as API
contracts. Route-level lazy loading keeps administration code out of initial
storefront bundle.

## Scale path

1. Run multiple stateless API replicas behind load balancer.
2. Keep Redis and PostgreSQL managed and private.
3. Run BullMQ workers as separate process/deployment when queue load grows.
4. Serve frontend through CDN with immutable hashed assets.
5. Add read replicas/search service only after measured catalogue query pressure.
6. Generate API types from OpenAPI to remove frontend/backend contract duplication.

## Non-negotiable invariants

- Server calculates price, tax, discount, inventory, payment, and refund state.
- Payment outcomes always come from the server-to-server SmartGateway Order Status API; webhooks use timing-safe Basic credential checks.
- Public resource IDs are UUIDs.
- Database migrations are forward-only and run once per release.
- Health is split into liveness (`/health`) and dependency readiness (`/ready`).
- Logs carry `x-request-id`; secrets and bearer tokens must never be logged.
- Auth responses and recovery routes are non-cacheable.
- One-time password recovery credentials are removed from the URL immediately after
  being read, kept only in component memory, exchanged through an unprivileged
  Supabase session over HTTPS, and followed by global session revocation.
