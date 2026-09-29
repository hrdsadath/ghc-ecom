# Deployment guideline

This guide deploys:

- React/Vite frontend to Vercel;
- NestJS backend to Railway (recommended) or Render;
- PostgreSQL, Auth, and Storage to Supabase;
- Redis for BullMQ jobs and scheduled processing;
- HDFC SmartGateway and SMTP as external providers.

## 1. Production topology

Use one registrable domain with separate HTTPS subdomains:

```text
https://shop.example.com  -> Vercel frontend
https://api.example.com   -> Railway or Render backend
                            -> Supabase PostgreSQL/Auth/Storage
                            -> private Redis
```

This project uses `Secure`, `HttpOnly`, `SameSite=Lax` cookies. Custom subdomains
under the same site allow cookie authentication to work without weakening cookie
security. Unrelated `vercel.app` and `railway.app`/`onrender.com` domains are
cross-site; use the Vercel proxy described later if custom domains are not available.

## 2. Pre-deployment checks

From the repository root:

```bash
npm ci
npm run verify
npm run test:e2e --workspace=backend
npm run prisma:validate --workspace=backend
npm audit --audit-level=high
npm run scan:secrets --workspace=backend
```

Deploy frontend and backend from the same reviewed commit.

## 3. Supabase production setup

### 3.1 Create environments

Create separate Supabase projects for development, staging, and production. Do not
reuse production credentials in preview or staging deployments.

From the production project, collect:

- project URL;
- anon/publishable key;
- service-role/secret key;
- database password;
- database connection strings.

Map them to backend variables:

```env
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_OR_SECRET_KEY
```

The service-role/secret key must exist only in the backend environment.

### 3.2 Select database connections

For a persistent Railway or Render container:

- use the direct port `5432` connection when the host supports IPv6;
- use Supavisor session mode on port `5432` for IPv4-only hosting;
- use direct or session mode for `DIRECT_URL`, because Prisma migrations must not run
  through transaction pooling.

Example:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require
DIRECT_URL=postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require
```

If the runtime is later moved to serverless/autoscaling infrastructure, use
transaction mode port `6543` for `DATABASE_URL` with `pgbouncer=true`, while keeping
`DIRECT_URL` on direct/session mode.

### 3.3 Apply migrations

The backend deployment will run this as a pre-deploy command:

```bash
npx prisma migrate deploy
```

For a manual first deployment:

```bash
npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

Never run `prisma migrate dev` against staging or production.

The migrations create the application schema, RLS policies, signup/profile trigger,
roles, audit records, and the `product-images` and `private-documents` buckets.

### 3.4 Configure Supabase Auth

In **Authentication -> URL Configuration**, set:

```text
Site URL:
https://shop.example.com

Additional redirect URLs:
https://shop.example.com/auth
https://shop.example.com/auth/reset-password
```

Use exact production URLs instead of wildcards. Configure:

- minimum password length of at least 12;
- email confirmation;
- production SMTP;
- leaked-password protection when available;
- appropriate authentication rate limits.

### 3.5 Bootstrap the first administrator

Register the administrator through the deployed storefront, copy the user UUID from
Supabase Authentication, then run in the SQL Editor:

```sql
insert into public.user_roles (user_id, role, assigned_by)
values (
  'ADMIN_AUTH_USER_UUID',
  'admin',
  'ADMIN_AUTH_USER_UUID'
)
on conflict (user_id, role) do nothing;
```

All later role assignments should use the authenticated admin API.

### 3.6 Production checks

- Run Supabase Security Advisor.
- Confirm RLS is enabled and policies exist.
- Configure backups/PITR.
- Test a database restore.
- Add a second organization owner.
- Confirm public/private storage bucket behavior.
- Test signup, confirmation, login, refresh, logout, and password recovery.

## 4. Deploy the backend to Railway

Railway is the preferred backend target for this repository.

### 4.1 Create the service

1. Push the repository to GitHub.
2. In Railway, create an empty project.
3. Add a service from the GitHub repository.
4. Set the service root directory to `/backend`.
5. Railway should detect `/backend/Dockerfile`.
6. Set the production branch to `main`.

### 4.2 Add Redis

Add a Redis service to the same Railway project. Use its private generated
`REDIS_URL`. Do not create a public Redis endpoint.

### 4.3 Add backend variables

Copy every required variable from `backend/.env.example` into Railway Variables.
Core production values:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3001

FRONTEND_ORIGIN=https://shop.example.com
# Optional: additional exact credentialed CORS origins, comma-separated.
FRONTEND_ORIGINS=https://admin.example.com
# Set true only for deliberate local-browser access to the production API.
ALLOW_LOCALHOST_CORS_IN_PRODUCTION=false
API_PUBLIC_URL=https://api.example.com

CSRF_SECRET=PASTE_A_SECURE_RANDOM_VALUE
SESSION_REFRESH_TTL_SECONDS=2592000

TRUST_PROXY_HOPS=1
ENABLE_SWAGGER=false

DATABASE_URL=YOUR_SUPABASE_RUNTIME_CONNECTION
DIRECT_URL=YOUR_SUPABASE_MIGRATION_CONNECTION
REDIS_URL=YOUR_PRIVATE_RAILWAY_REDIS_URL

SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_OR_SECRET_KEY

HDFC_ENABLED=true
HDFC_BASE_URL=https://smartgateway.hdfcuat.bank.in
HDFC_MERCHANT_ID=REPLACE
HDFC_API_KEY=REPLACE
HDFC_PAYMENT_PAGE_CLIENT_ID=hdfcmaster
HDFC_WEBHOOK_USERNAME=REPLACE
HDFC_WEBHOOK_PASSWORD=REPLACE

EMAIL_FROM="Glockery Home Centre <orders@YOUR_VERIFIED_DOMAIN>"
RESEND_API_KEY=re_REPLACE

SHIPPING_PROVIDER_NAME=manual
RETURN_WINDOW_DAYS=30
```

Generate the CSRF secret locally:

```bash
openssl rand -base64 48
```

All backend replicas must use the same `CSRF_SECRET`.

The Resend key must be stored only in the backend secret manager. Verify the sender domain
in Resend before production testing. Hosted Supabase signup and password-recovery emails
use the branded sources in `supabase/templates/`; follow that folder's README to install
them in **Authentication → Email Templates**.

### 4.4 Configure deployment

In Railway **Settings -> Deploy**, configure:

```text
Pre-deploy command: npx prisma migrate deploy
Healthcheck path:   /api/v1/ready
Healthcheck timeout: 300 seconds
Restart policy:     Always
```

The pre-deploy command must finish successfully before Railway promotes the new
deployment.

### 4.5 Add backend domain

In **Settings -> Networking -> Custom Domain**, add:

```text
api.example.com
```

Add Railway's CNAME and TXT verification records to the DNS provider. Wait for TLS
and domain verification, then check:

```bash
curl -fsS https://api.example.com/api/v1/health
curl -fsS https://api.example.com/api/v1/ready
```

## 5. Render backend alternative

If using Render:

1. Create a new Web Service from the GitHub repository.
2. Choose Docker runtime.
3. Set root directory to `backend`.
4. Use `backend/Dockerfile`.
5. Set health check path to `/api/v1/ready`.
6. Add an always-on Render Key Value/Redis service.
7. Add the same backend environment variables.
8. Set pre-deploy command to `npx prisma migrate deploy`.
9. Add `api.example.com` as the custom domain.

Use an always-on paid service. Free spin-down is not suitable for BullMQ workers,
payment reconciliation, scheduled operations, or production availability.

## 6. Deploy the frontend to Vercel

### 6.1 Import the project

In Vercel:

1. Import the GitHub repository.
2. Set root directory to `frontend`.
3. Select Vite as the framework.
4. Configure:

```text
Install command: npm ci
Build command:   npm run build
Output directory: dist
Node.js version: 24
Production branch: main
```

### 6.2 Add frontend environment

Use the same-origin API proxy in production:

```env
VITE_API_URL=/api/v1
```

In the Vercel environment-variable form, enter `VITE_API_URL` in the key field and
only `/api/v1` in the value field. Do not paste the complete assignment into the
value field.

This is the only required frontend environment variable. Never put Supabase
service-role keys, database URLs, HDFC SmartGateway API key/webhook password, SMTP credentials, or
`CSRF_SECRET` in Vercel.

### 6.3 Add SPA routing and security headers

Create `frontend/vercel.json` before deployment:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-BACKEND.up.railway.app/api/:path*"
    },
    {
      "source": "/:path*",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self';"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), payment=(self)"
        }
      ]
    }
  ]
}
```

Replace `YOUR-BACKEND` with the Railway backend service name. The committed
configuration already contains this repository's current Railway service URL.

### 6.4 Add frontend domain

In Vercel **Settings -> Domains**, add:

```text
shop.example.com
```

Create the DNS records shown by Vercel. After verification, redeploy so the final
production environment uses the correct `VITE_API_URL`.

## 7. Railway-generated backend domain

Do not call the Railway/Render URL directly from the browser. Proxy `/api` through
Vercel so session cookies remain first-party and the browser sees one origin.

Set:

```env
VITE_API_URL=/api/v1
```

Use this rewrite in `frontend/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-BACKEND.up.railway.app/api/:path*"
    },
    {
      "source": "/:path*",
      "destination": "/index.html"
    }
  ]
}
```

Backend variables then become:

```env
FRONTEND_ORIGIN=https://YOUR-FRONTEND.vercel.app
API_PUBLIC_URL=https://YOUR-FRONTEND.vercel.app
```

Do not enable Vercel rewrite caching for `/api/*` or `/api/v1/auth/*`.

## 8. HDFC SmartGateway and email

Start with the SmartGateway sandbox (`https://smartgateway.hdfcuat.bank.in`,
`HDFC_PAYMENT_PAGE_CLIENT_ID=hdfcmaster`). In the dashboard (Payments → Settings →
Webhook) configure:

```text
https://api.example.com/api/v1/webhooks/hdfc
```

with the same Basic username/password as `HDFC_WEBHOOK_USERNAME` /
`HDFC_WEBHOOK_PASSWORD`, and enable the order and refund events. The payment
return URL defaults to `https://shop.example.com/checkout/result`.

Test successful, failed, abandoned, pending-then-successful, duplicate and delayed
webhook payments plus full and partial refunds before switching to the production
base URL (`https://smartgateway.hdfc.bank.in`) and production API key.
partial refunds before switching to live keys.

Configure SPF, DKIM, and DMARC for the production email sender.

## 9. Deployment order

1. Create production Supabase project.
2. Configure Supabase database, Auth, Storage, SMTP, and backups.
3. Create Railway/Render backend service.
4. Add private Redis.
5. Add backend environment variables.
6. Run the Prisma pre-deploy migration.
7. Attach and verify `api.example.com`.
8. Confirm API health and readiness.
9. Create Vercel project.
10. Add `VITE_API_URL`.
11. Attach and verify `shop.example.com`.
12. Update Supabase Site URL and redirect allowlist.
13. Configure the HDFC SmartGateway webhook.
14. Register and bootstrap the first administrator.
15. Complete staging and production smoke tests.

## 10. Final verification

Run:

```bash
curl -fsS https://api.example.com/api/v1/health
curl -fsS https://api.example.com/api/v1/ready
curl -I https://shop.example.com
```

Verify in the browser:

- registration and email confirmation;
- login, refresh, logout, and password recovery;
- `Secure`, `HttpOnly`, `SameSite=Lax` auth cookies;
- no access/refresh tokens in auth JSON responses;
- public catalogue and product images;
- guest and authenticated carts;
- checkout and HDFC SmartGateway sandbox payment;
- payment webhook processing;
- order email and invoice;
- admin authorization;
- cancellation, return, and refund flows;
- mobile layout at 320 px and 375 px widths.

## 11. Rollback

- Roll back frontend and backend to the previous successful deployment from the same
  commit.
- Do not edit or reverse applied Prisma migrations.
- Create a corrective forward migration when schema repair is required.
- Keep payment webhooks available while application traffic is rolled back.
- Reconcile payments, refunds, inventory, and orders before reopening checkout after
  a payment-related incident.

Additional references:

- `README.md`
- `docs/SETUP.md`
- `docs/INTEGRATIONS.md`
- `docs/DEPLOYMENT.md`
- `backend/docs/production-readiness.md`
- `security_best_practices_report.md`
