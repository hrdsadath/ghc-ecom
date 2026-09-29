# GHC Ecommerce Backend

## Local setup

1. Copy `.env.example` to `.env`.
2. Replace every placeholder with development Supabase, HDFC SmartGateway sandbox, and SMTP credentials.
3. Install dependencies with `npm ci`.
4. Generate the client with `npm run prisma:generate`.
5. Apply migrations with `npx prisma migrate deploy`.
6. Start Redis and the API with `docker compose -f compose.dev.yml up`.

Swagger documentation is served at `http://localhost:3001/api/v1/docs`.

Production deployment, rollback, incident, backup/restore, security rotation,
load-test, and HDFC SmartGateway launch procedures are in
[`docs/production-readiness.md`](docs/production-readiness.md).

## Supabase Phase 2 setup

The migration in `prisma/migrations/20260723170000_auth_roles_addresses_audit` creates:

- profiles linked to `auth.users`;
- customer and staff roles;
- customer-owned addresses;
- immutable audit logs;
- a signup trigger that creates a profile and assigns the customer role;
- RLS policies for profile, role, and address access.

After applying the migration, bootstrap the first administrator through the Supabase SQL editor:

```sql
insert into public.user_roles (user_id, role, assigned_by)
values ('ADMIN_AUTH_USER_UUID', 'admin', 'ADMIN_AUTH_USER_UUID')
on conflict (user_id, role) do nothing;
```

All later role assignments should use the authenticated admin API:

```text
PUT /api/v1/admin/users/:userId/roles
```

Never place `SUPABASE_SERVICE_ROLE_KEY`, `HDFC_API_KEY`, or
`HDFC_WEBHOOK_PASSWORD` in the React application.
