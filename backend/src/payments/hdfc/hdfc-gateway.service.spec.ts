import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order } from '@prisma/client';
import { HdfcGatewayService } from './hdfc-gateway.service';

describe('HdfcGatewayService', () => {
  const settings: Record<string, unknown> = {
    HDFC_ENABLED: true,
    HDFC_BASE_URL: 'https://smartgateway.hdfcuat.bank.in/',
    HDFC_MERCHANT_ID: 'SG1234',
    HDFC_API_KEY: 'test-api-key',
    HDFC_PAYMENT_PAGE_CLIENT_ID: 'hdfcmaster',
    HDFC_RESELLER_ID: 'hdfc_reseller',
    HDFC_WEBHOOK_USERNAME: 'glockery',
    HDFC_WEBHOOK_PASSWORD: 'webhook-password-123',
    FRONTEND_ORIGIN: 'https://www.glockery.com',
    OUTBOUND_TIMEOUT_MS: 1_000,
  };
  const config = (overrides: Record<string, unknown> = {}): ConfigService => {
    const values = { ...settings, ...overrides };
    return {
      get: (key: string) => values[key],
      getOrThrow: (key: string) => {
        if (values[key] === undefined) throw new Error(`missing ${key}`);
        return values[key];
      },
    } as unknown as ConfigService;
  };
  const order = {
    id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    orderNumber: 'GHC-TEST-1',
    userId: null,
    currency: 'INR',
    totalPaise: 12_750,
    hdfcOrderId: 'GHCMF0ABCDE12345678',
  } as Order;
  const customer = {
    id: `guest${order.hdfcOrderId}`,
    email: 'buyer@example.com',
    phone: '9876543210',
    firstName: 'Asha',
    lastName: 'Menon',
  };

  let fetchMock: jest.SpyInstance;
  const respond = (status: number, body: unknown): jest.SpyInstance =>
    fetchMock.mockResolvedValue(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('creates a session with Basic auth, merchant headers and a storefront return URL', async () => {
    respond(200, {
      status: 'NEW',
      id: 'ordeh_1',
      order_id: order.hdfcOrderId,
      payment_links: {
        web: 'https://smartgateway.hdfcuat.bank.in/orders/ordeh_1/payment-page',
        expiry: '2026-09-23T12:00:00Z',
      },
    });

    const session = await new HdfcGatewayService(config()).createSession(order, customer);

    expect(session.paymentUrl).toBe(
      'https://smartgateway.hdfcuat.bank.in/orders/ordeh_1/payment-page',
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://smartgateway.hdfcuat.bank.in/session');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: `Basic ${Buffer.from('test-api-key').toString('base64')}`,
      'content-type': 'application/json',
      'x-merchantid': 'SG1234',
      'x-customerid': customer.id,
      'x-resellerid': 'hdfc_reseller',
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      order_id: order.hdfcOrderId,
      amount: '127.50',
      currency: 'INR',
      customer_id: customer.id,
      customer_email: 'buyer@example.com',
      customer_phone: '9876543210',
      payment_page_client_id: 'hdfcmaster',
      action: 'paymentPage',
      return_url: 'https://www.glockery.com/checkout/result',
      first_name: 'Asha',
      last_name: 'Menon',
      udf6: order.orderNumber,
      udf7: order.id,
    });
  });

  it('rejects a session response without an HTTPS payment link', async () => {
    respond(200, { status: 'NEW', payment_links: { web: 'http://evil.example/pay' } });

    await expect(
      new HdfcGatewayService(config()).createSession(order, customer),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('surfaces SmartGateway error codes without leaking the API key', async () => {
    respond(401, { status: 'error', error_code: 'access_denied' });

    const failure = new HdfcGatewayService(config()).createSession(order, customer);

    await expect(failure).rejects.toThrow('HTTP 401 (access_denied)');
    await expect(failure).rejects.not.toThrow('test-api-key');
  });

  it('refuses to call the gateway when it is disabled', async () => {
    await expect(
      new HdfcGatewayService(config({ HDFC_ENABLED: false })).createSession(order, customer),
    ).rejects.toThrow('HDFC gateway is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads order status and maps CHARGED to a captured payment', async () => {
    respond(200, {
      order_id: order.hdfcOrderId,
      status: 'CHARGED',
      status_id: 21,
      amount: 127.5,
      txn_uuid: 'eulwh5QbZSBvw35eWnH',
      payment_method_type: 'UPI',
      customer_email: 'buyer@example.com',
      card: { card_isin: '411111' },
    });

    const status = await new HdfcGatewayService(config()).getOrderStatus(order);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://smartgateway.hdfcuat.bank.in/orders/${order.hdfcOrderId}`);
    expect(init.method).toBe('GET');
    expect(status).toMatchObject({
      orderId: order.hdfcOrderId,
      status: 'CHARGED',
      statusId: 21,
      outcome: 'captured',
      amountPaise: 12_750,
      transactionId: 'eulwh5QbZSBvw35eWnH',
      paymentMethod: 'UPI',
    });
    expect(status.raw).not.toHaveProperty('customer_email');
    expect(status.raw).not.toHaveProperty('card');
  });

  it.each([
    ['AUTHENTICATION_FAILED', 'failed'],
    ['AUTHORIZATION_FAILED', 'failed'],
    ['JUSPAY_DECLINED', 'failed'],
    ['AUTO_REFUNDED', 'failed'],
    ['NEW', 'pending'],
    ['PENDING_VBV', 'pending'],
    ['AUTHORIZING', 'pending'],
    ['STARTED', 'pending'],
  ])('maps %s to %s', (status, outcome) => {
    expect(HdfcGatewayService.normalizeStatus({ status }).outcome).toBe(outcome);
  });

  it('does not invent an amount when the status response omits it', () => {
    expect(HdfcGatewayService.normalizeStatus({ status: 'CHARGED' }).amountPaise).toBeNull();
    expect(
      HdfcGatewayService.normalizeStatus({ status: 'CHARGED', amount: null }).amountPaise,
    ).toBeNull();
  });

  it('accepts only the configured webhook Basic credentials', () => {
    const gateway = new HdfcGatewayService(config());
    const basic = (value: string): string => `Basic ${Buffer.from(value).toString('base64')}`;

    expect(gateway.verifyWebhookAuthorization(basic('glockery:webhook-password-123'))).toBe(true);
    expect(gateway.verifyWebhookAuthorization(basic('glockery:wrong'))).toBe(false);
    expect(gateway.verifyWebhookAuthorization('Bearer token')).toBe(false);
    expect(gateway.verifyWebhookAuthorization(undefined)).toBe(false);
    expect(
      new HdfcGatewayService(
        config({ HDFC_WEBHOOK_USERNAME: undefined }),
      ).verifyWebhookAuthorization(basic('glockery:webhook-password-123')),
    ).toBe(false);
  });

  it('never shares a SmartGateway customer id between guests', () => {
    expect(HdfcGatewayService.customerIdFor({ userId: null, hdfcOrderId: 'GHC1' })).toBe(
      'guestGHC1',
    );
    expect(HdfcGatewayService.customerIdFor({ userId: 'user-1', hdfcOrderId: 'GHC1' })).toBe(
      'user-1',
    );
  });
});
