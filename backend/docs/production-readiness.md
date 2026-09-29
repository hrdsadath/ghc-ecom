# Production readiness runbook

## Deployment

1. Build an immutable image from a reviewed commit with `npm ci`, Prisma generation,
   the full CI suite, and `npm run build`.
2. Back up the database and record the latest successful restore drill.
3. Apply migrations with `npx prisma migrate deploy` from a one-off release task.
4. Deploy the API and workers with the same image and secret version. Keep at least
   one previous image available.
5. Verify `/api/v1/health`, `/api/v1/ready`, the admin operations dashboard, Redis
   workers, a catalogue read, a cart quote, and an HDFC SmartGateway sandbox payment.
6. Increase traffic gradually while watching error rate, p95 latency, failed jobs,
   payment mismatches, webhook failures, refunds, and low stock.

## Rollback

- Roll application traffic back to the previous immutable image first.
- Database migrations are forward-only. Add a corrective migration; do not manually
  delete migration history or run destructive rollback SQL during an incident.
- Pause checkout if a payment/schema mismatch could create financial inconsistency.
  Keep webhooks accepted and durably stored for replay.
- Run reconciliation after recovery and record every manual correction in audit logs.

## Incident response

1. Declare severity and incident owner; preserve logs and request/event IDs.
2. Contain the fault by disabling the affected mutation or pausing its worker.
3. For payment incidents, compare local order/payment/refund records with the SmartGateway dashboard,
   replay only idempotent webhook/outbox work, and never manually mark captured
   without provider evidence.
4. For inventory incidents, stop checkout, reconcile reservations and movements, and
   reopen only after invariants pass.
5. Communicate customer impact, restore service, and write a blameless postmortem
   with prevention owners and dates.

## Supabase backup and restore drill

- Enable Point-in-Time Recovery for production in the Supabase dashboard and record
  retention, region, project, owner, and monthly restore-drill date.
- Restore the newest backup to an isolated non-production project.
- Point a one-off verifier at the restored `DIRECT_URL`; never reuse production
  service credentials in the drill.
- Verify migration history, row counts, representative order/payment/invoice links,
  RLS, and storage-object references. Destroy the isolated copy after evidence is
  retained.
- A dashboard screenshot is not a restore test. Record the restore start/end time,
  recovery point, verification output, RTO, RPO, and approver.

## Secret rotation and security

- Store secrets only in the deployment secret manager. Frontend builds receive only
  the public API base URL; payment public key is returned by the API per intent.
- Rotate Supabase service role, HDFC API key/webhook password, SMTP, Redis,
  courier, notification, and alert credentials one provider at a time.
- Deploy code accepting old and new webhook secrets during the short transition when
  the provider supports it; verify delivery, then revoke the old value.
- Run `npm run security:audit`, `npm run scan:secrets`, and the CI secret scanner on
  every change. The blocking audit covers packages shipped in the production image.
  Also review a full `npm audit` report during dependency maintenance; document and
  track development-tool findings that cannot be upgraded safely yet.
- Run an authenticated penetration test before launch and after material auth,
  checkout, upload, or administration changes. Track remediation and retest evidence.

## Load test

Run only against an isolated staging project with disposable catalogue/inventory:

```bash
k6 run \
  -e BASE_URL=https://staging-api.example.com \
  -e VARIANT_ID=STOCKED_VARIANT_UUID \
  -e ADMIN_TOKEN=SHORT_LIVED_ADMIN_JWT \
  -e HDFC_WEBHOOK_USERNAME=STAGING_WEBHOOK_USERNAME \n  -e HDFC_WEBHOOK_PASSWORD=STAGING_WEBHOOK_PASSWORD \
  test/load/ecommerce.js
```

The proposed starting gate is under 1% HTTP errors, catalogue/webhook p95 below
500 ms, and checkout/admin p95 below 1 second. Product and infrastructure owners
must approve final traffic volumes and targets before the gate can be marked passed.

If k6 is not installed locally, export the same variables and run
`npm run test:load:docker`. The official container writes its threshold evidence to
`artifacts/k6-summary.json`.

Run the passive OpenAPI security gate with `STAGING_API_URL=... npm run test:dast`.
It writes ZAP JSON and HTML evidence under `artifacts/`. Active and authenticated
penetration testing still requires explicit staging authorization.

## HDFC SmartGateway sandbox-to-production launch

1. Configure the sandbox credentials and register the HTTPS webhook endpoint with
   Basic credentials. Production rejects the sandbox base URL unless the isolated
   staging environment sets `ALLOW_TEST_PAYMENTS_IN_PRODUCTION=true`; never set that
   override in the live environment.
2. Enable the order and refund webhook events in the dashboard.
3. In the sandbox verify success (amount < ₹500), failure (₹500–₹699),
   pending-then-success (≥ ₹700), abandonment, duplicate delivery, delayed webhook,
   full refund, partial refund, and reconciliation.
4. Record staging sign-off. Generate a production API key, switch `HDFC_BASE_URL`
   to `https://smartgateway.hdfc.bank.in`, clear `HDFC_PAYMENT_PAGE_CLIENT_ID` (it
   defaults to the merchant ID), and keep sandbox and production records isolated.
5. Process a low-value live order with named approval, verify settlement and invoice,
   then increase traffic gradually. Roll back checkout availability on mismatch.

Record every gate using [`readiness-evidence-template.md`](readiness-evidence-template.md).
