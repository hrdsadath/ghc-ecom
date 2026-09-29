# Integration setup

## Supabase

1. Create separate development, staging, and production projects.
2. Copy project URL, anon key, and service-role key into backend secret store.
3. Use transaction-pooler URL for `DATABASE_URL`; use direct port 5432 URL for
   `DIRECT_URL`.
4. Run `npx prisma migrate deploy --schema backend/prisma/schema.prisma`.
5. Confirm migrations created `product-images` public bucket and
   `private-documents` private bucket.
6. Create first admin with SQL in `backend/README.md`; use admin API for later role
   changes.
7. In Supabase Auth URL configuration add both:
   `https://YOUR_STORE/auth` and
   `https://YOUR_STORE/auth/reset-password`.
8. Set the production Site URL and allow only explicit development, staging, and
   production redirect URLs; avoid production wildcards.
9. Configure a minimum password length of at least 12 and enable leaked-password
   protection when the Supabase plan supports it.
10. Verify password recovery updates the credential, revokes existing sessions, and
    removes the recovery fragment from the address bar.
11. Verify RLS with anon/customer tokens. Never expose service-role key to frontend.

## HDFC SmartGateway

HDFC SmartGateway (Juspay-powered, Basic Auth API) is the only payment gateway; it
replaced Razorpay and the earlier FSS scaffold. Production refuses to start unless
`HDFC_ENABLED=true`. API reference:
<https://smartgateway.hdfc.bank.in/docs/smartgateway-api-ref-basicauth/docs/overview/integration-architecture>

1. Get the Merchant ID from the bank and create an API key in the SmartGateway
   dashboard (Payments → Settings → Security → API Keys). Keep the key server-side.
2. Configure the backend (sandbox shown):

   ```env
   HDFC_ENABLED=true
   HDFC_BASE_URL=https://smartgateway.hdfcuat.bank.in
   HDFC_MERCHANT_ID=YOUR_MERCHANT_ID
   HDFC_API_KEY=YOUR_API_KEY
   HDFC_PAYMENT_PAGE_CLIENT_ID=hdfcmaster
   HDFC_WEBHOOK_USERNAME=glockeryhooks
   HDFC_WEBHOOK_PASSWORD=long-random-secret
   ```

   For production switch `HDFC_BASE_URL` to `https://smartgateway.hdfc.bank.in`,
   use the production API key, and clear `HDFC_PAYMENT_PAGE_CLIENT_ID` so it
   defaults to the merchant ID.
3. In the dashboard (Payments → Settings → Webhook) set the webhook URL to
   `https://YOUR_API/api/v1/webhooks/hdfc` (production:
   `https://www.glockery.com/api/v1/webhooks/hdfc`) with the same username and
   password, and enable the order and refund events.
4. The session `return_url` defaults to `FRONTEND_ORIGIN + /checkout/result`
   (HTTPS, no query string, no further redirect, as SmartGateway requires). Override
   with `HDFC_RETURN_URL` only if the storefront lives elsewhere.
5. The storefront needs no configuration or CSP allowance: the browser navigates
   to the SmartGateway payment link (iframes are not supported).
6. Flow: `POST /checkout/hdfc/intent` creates a pending order with an
   alphanumeric `hdfcOrderId` (under 21 characters) and calls the Session API;
   the browser opens `payment_links.web`; SmartGateway returns the customer to
   `/checkout/result?order_id=…`; the page calls `POST /payments/hdfc/status`,
   which runs the server-to-server Order Status API, verifies the order id and
   amount, and confirms or fails the order idempotently. Return-URL parameters and
   webhook payloads are never trusted on their own: both only trigger the same
   Order Status check. Webhooks are authenticated with the dashboard Basic
   credentials; a failed status check answers non-200 so SmartGateway retries.
   Webhooks are stored in `webhook_events` (deduplicated by SmartGateway event id)
   and processed by the payment queue. Pending orders are reconciled every five
   minutes (`POST /admin/payments/reconcile` runs it on demand).
7. Status mapping: `CHARGED` confirms; `AUTHENTICATION_FAILED`,
   `AUTHORIZATION_FAILED`, `JUSPAY_DECLINED`, `AUTO_REFUNDED` and `VOIDED` fail the
   order; everything else (`NEW`, `PENDING_VBV`, `AUTHORIZING`, …) stays pending
   until the quote's payment window closes. A charge that lands after the order
   failed is recorded and logged for a manual refund.
8. Refunds use the Refund Order API with a `unique_request_id` derived from the
   refund idempotency key, so retries cannot refund twice; pending refunds are
   reconciled from the Order Status API every five minutes. Orders paid through
   Razorpay before the switch keep their ids in `legacy_razorpay_references` and
   must be refunded manually.
9. Sandbox testing: amounts under ₹500 succeed, ₹500–₹699 fail, ₹700 and above go
   pending then succeed; UPI `success@upi` / `failure@upi`; card
   `4012 0000 0000 1097`, any future expiry and CVV, OTP `000000`.

### Local sandbox testing

SmartGateway must reach the return page and the webhook over HTTPS, so run one
tunnel to the storefront (`next dev` proxies `/api/*` to the API, so the tunnel
covers both). Use the tunnel URL for the whole test; cart tokens and cookies are
per-origin.

1. `ngrok http 3000` (a free static domain keeps the URL stable between runs).
2. `backend/.env`: `FRONTEND_ORIGIN=https://TUNNEL`, `FRONTEND_ORIGINS=http://localhost:3000`,
   plus the sandbox `HDFC_*` values above.
3. `frontend/.env.local`: `ALLOWED_DEV_ORIGINS=TUNNEL_HOSTNAME`.
4. Dashboard webhook URL: `https://TUNNEL/api/v1/webhooks/hdfc`.
5. Restart both dev servers, open `https://TUNNEL`, and pay with the sandbox data above.

## Redis and BullMQ

- Use TLS/authenticated managed Redis in production.
- Configure `REDIS_URL`; do not expose Redis publicly.
- Use `noeviction` for payment/notification queues.
- Monitor failed jobs, retry count, queue depth, and oldest-job age.
- Scale workers separately from HTTP API when traffic requires it.

## Email and notifications

- Set `EMAIL_FROM` and `RESEND_API_KEY`. Transactional order emails use Resend's HTTPS
  `POST /emails` API, so they work on Railway plans that block outbound SMTP.
- Use a verified Glockery sender such as
  `EMAIL_FROM="Glockery Home Centre <orders@YOUR_VERIFIED_DOMAIN>"`.
- Verify sender domain SPF, DKIM, and DMARC before launch.
- Install the hosted Supabase signup and recovery templates from
  `supabase/templates/README.md`. Supabase Auth owns those two delivery flows; the Nest
  notification worker owns order confirmation and cancellation emails.
- Supabase requires custom SMTP before hosted Auth templates are editable. Configure
  Resend SMTP (`smtp.resend.com`, port `465`, username `resend`, API key as password)
  in Supabase only. Railway never opens that SMTP connection.
- Disable link tracking for Supabase authentication messages so confirmation and recovery
  URLs are not rewritten.
- Optional non-email channel uses `NOTIFICATION_WEBHOOK_URL` and bearer token.
- All provider calls have bounded timeouts; configure retries through durable outbox,
  not an unbounded request loop.

## Shipping provider

- `SHIPPING_PROVIDER_NAME=manual` works without external URL.
- For provider mode set HTTPS `SHIPPING_PROVIDER_URL` and scoped token.
- Provider endpoint must accept `POST /shipments` and return optional `id`,
  `trackingNumber`, and `carrier`.
- Test duplicate fulfilment actions and provider timeout behavior in staging.

## Alerting

Set `ALERT_WEBHOOK_URL` and token for operational alerts. Route alerts to monitored
channel. Alert receiver should return 2xx quickly; backend records provider failures
without blocking API traffic.
