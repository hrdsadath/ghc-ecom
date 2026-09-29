/* global __ENV, __VU, __ITER */
import encoding from 'k6/encoding';
import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  scenarios: {
    catalogue: {
      executor: 'constant-vus',
      exec: 'catalogue',
      vus: Number(__ENV.CATALOGUE_VUS || 10),
      duration: __ENV.DURATION || '30s',
    },
    cart_checkout: {
      executor: 'constant-vus',
      exec: 'cartCheckout',
      vus: Number(__ENV.CHECKOUT_VUS || 3),
      duration: __ENV.DURATION || '30s',
    },
    webhooks: {
      executor: 'constant-arrival-rate',
      exec: 'webhook',
      rate: Number(__ENV.WEBHOOK_RPS || 2),
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: 2,
    },
    admin_search: {
      executor: 'constant-vus',
      exec: 'adminSearch',
      vus: Number(__ENV.ADMIN_VUS || 2),
      duration: __ENV.DURATION || '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{flow:catalogue}': ['p(95)<500'],
    'http_req_duration{flow:checkout}': ['p(95)<1000'],
    'http_req_duration{flow:webhook}': ['p(95)<500'],
    'http_req_duration{flow:admin}': ['p(95)<1000'],
  },
};

export function catalogue() {
  const response = http.get(`${baseUrl}/api/v1/products?limit=20`, {
    tags: { flow: 'catalogue' },
  });
  check(response, { 'catalogue succeeds': (result) => result.status === 200 });
  sleep(0.2);
}

export function cartCheckout() {
  if (!__ENV.VARIANT_ID) return;
  const created = http.post(`${baseUrl}/api/v1/carts`, null, {
    tags: { flow: 'checkout' },
  });
  if (created.status !== 201) return;
  const body = created.json();
  const headers = {
    'content-type': 'application/json',
    'x-cart-token': body.guestToken,
  };
  http.put(
    `${baseUrl}/api/v1/carts/${body.cart.id}/items`,
    JSON.stringify({ variantId: __ENV.VARIANT_ID, quantity: 1 }),
    { headers, tags: { flow: 'checkout' } },
  );
  const quote = http.post(
    `${baseUrl}/api/v1/checkout/quote`,
    JSON.stringify({
      cartId: body.cart.id,
      contactEmail: 'load-test@example.com',
      shippingAddress: {
        recipientName: 'Load Test',
        phone: '9876543210',
        line1: 'Load Test Street',
        line2: '',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411001',
        country: 'IN',
      },
    }),
    { headers, tags: { flow: 'checkout' } },
  );
  check(quote, { 'checkout quote succeeds': (result) => result.status === 201 });
}

export function webhook() {
  if (!__ENV.HDFC_WEBHOOK_USERNAME || !__ENV.HDFC_WEBHOOK_PASSWORD) return;
  // Unknown order ids are stored and acknowledged without calling SmartGateway.
  const payload = JSON.stringify({
    id: `evt_load_${__VU}_${__ITER}_${Date.now()}`,
    event_name: 'DIAGNOSTIC_LOAD_TEST',
    content: { order: { order_id: `LOAD${__VU}X${__ITER}` } },
  });
  const credentials = encoding.b64encode(
    `${__ENV.HDFC_WEBHOOK_USERNAME}:${__ENV.HDFC_WEBHOOK_PASSWORD}`,
  );
  const response = http.post(`${baseUrl}/api/v1/webhooks/hdfc`, payload, {
    headers: {
      'content-type': 'application/json',
      authorization: `Basic ${credentials}`,
    },
    tags: { flow: 'webhook' },
  });
  check(response, { 'webhook accepted': (result) => result.status === 200 });
}

export function adminSearch() {
  if (!__ENV.ADMIN_TOKEN) return;
  const response = http.get(`${baseUrl}/api/v1/admin/orders?limit=25`, {
    headers: { authorization: `Bearer ${__ENV.ADMIN_TOKEN}` },
    tags: { flow: 'admin' },
  });
  check(response, { 'admin search succeeds': (result) => result.status === 200 });
  sleep(0.2);
}
