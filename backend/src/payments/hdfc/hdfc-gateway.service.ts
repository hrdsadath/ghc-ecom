import { timingSafeEqual } from 'node:crypto';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order } from '@prisma/client';

const DEFAULT_OUTBOUND_TIMEOUT_MS = 10_000;

/** SmartGateway order statuses (see "Transaction Status" in the HDFC docs). */
const CHARGED_STATUSES = new Set(['CHARGED']);
const FAILED_STATUSES = new Set([
  'AUTHENTICATION_FAILED',
  'AUTHORIZATION_FAILED',
  'JUSPAY_DECLINED',
  // Funds were returned automatically, so the order must not be fulfilled.
  'AUTO_REFUNDED',
  'VOIDED',
]);

const REDACTED_STATUS_FIELDS = new Set([
  'customer_email',
  'customer_phone',
  'card',
  'payment_links',
]);

export type HdfcOutcome = 'captured' | 'failed' | 'pending';

export interface HdfcCustomer {
  id: string;
  email: string;
  phone: string;
  firstName?: string;
  lastName?: string;
}

export interface HdfcSession {
  /** SmartGateway's internal order id (`ordeh_…`). */
  id: string | null;
  orderId: string;
  status: string;
  paymentUrl: string;
  expiresAt: string | null;
}

export type HdfcRefundOutcome = 'processed' | 'pending' | 'failed';

export interface HdfcRefund {
  /** Our `unique_request_id` for the refund. */
  uniqueRequestId: string;
  status: string;
  outcome: HdfcRefundOutcome;
  amountPaise: number | null;
  reference: string | null;
  raw: Record<string, unknown>;
}

export interface HdfcOrderStatus {
  orderId: string;
  status: string;
  statusId: number | null;
  outcome: HdfcOutcome;
  amountPaise: number | null;
  /** Transaction reference used as the unique local payment id. */
  transactionId: string | null;
  paymentMethod: string | null;
  errorMessage: string | null;
  refunds: HdfcRefund[];
  raw: Record<string, unknown>;
}

/**
 * HDFC SmartGateway API client (Basic Auth flavour).
 *
 * Flow: Session API → customer pays on the hosted payment page → browser returns
 * to the storefront `return_url` → server-to-server Order Status API is
 * authoritative. Webhooks are a second trigger for the same Order Status check.
 */
@Injectable()
export class HdfcGatewayService {
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly merchantId?: string;
  private readonly apiKey?: string;
  private readonly paymentPageClientId?: string;
  private readonly resellerId?: string;
  private readonly returnUrl: string;
  private readonly webhookUsername?: string;
  private readonly webhookPassword?: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.enabled = config.get<boolean>('HDFC_ENABLED') ?? false;
    this.baseUrl = (
      config.get<string>('HDFC_BASE_URL') ?? 'https://smartgateway.hdfcuat.bank.in'
    ).replace(/\/+$/, '');
    this.merchantId = config.get<string>('HDFC_MERCHANT_ID');
    this.apiKey = config.get<string>('HDFC_API_KEY');
    this.paymentPageClientId = config.get<string>('HDFC_PAYMENT_PAGE_CLIENT_ID') ?? this.merchantId;
    this.resellerId = config.get<string>('HDFC_RESELLER_ID');
    // SmartGateway requires a return URL without query parameters that does not
    // redirect again, so the customer lands directly on the storefront result page.
    const frontendOrigin = config.getOrThrow<string>('FRONTEND_ORIGIN').replace(/\/+$/, '');
    this.returnUrl = config.get<string>('HDFC_RETURN_URL') ?? `${frontendOrigin}/checkout/result`;
    this.webhookUsername = config.get<string>('HDFC_WEBHOOK_USERNAME');
    this.webhookPassword = config.get<string>('HDFC_WEBHOOK_PASSWORD');
    this.timeoutMs = config.get<number>('OUTBOUND_TIMEOUT_MS') ?? DEFAULT_OUTBOUND_TIMEOUT_MS;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Session API: registers the order with SmartGateway and returns the hosted page link. */
  async createSession(order: Order, customer: HdfcCustomer): Promise<HdfcSession> {
    if (!order.hdfcOrderId) {
      throw new Error('Order has no HDFC order ID');
    }
    const { paymentPageClientId } = this.requireConfiguration();
    const body: Record<string, string> = {
      order_id: order.hdfcOrderId,
      amount: HdfcGatewayService.rupees(order.totalPaise),
      currency: order.currency,
      customer_id: customer.id,
      customer_email: customer.email,
      customer_phone: customer.phone,
      payment_page_client_id: paymentPageClientId,
      action: 'paymentPage',
      return_url: this.returnUrl,
      description: `Glockery order ${order.orderNumber}`,
      // UDFs 1-5 reject special characters; 6-10 accept them.
      udf6: order.orderNumber,
      udf7: order.id,
    };
    if (customer.firstName) body.first_name = customer.firstName;
    if (customer.lastName) body.last_name = customer.lastName;

    const response = await this.request('POST', '/session', customer.id, {
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
    const paymentLinks = response.payment_links as Record<string, unknown> | undefined;
    const paymentUrl = typeof paymentLinks?.web === 'string' ? paymentLinks.web : '';
    if (!/^https:\/\//i.test(paymentUrl)) {
      throw new BadGatewayException('HDFC session response did not include a payment link');
    }
    return {
      id: HdfcGatewayService.text(response.id),
      orderId: HdfcGatewayService.text(response.order_id) ?? order.hdfcOrderId,
      status: HdfcGatewayService.text(response.status) ?? 'NEW',
      paymentUrl,
      expiresAt: HdfcGatewayService.text(paymentLinks?.expiry),
    };
  }

  /** Order Status API: the only source of truth for a payment outcome. */
  async getOrderStatus(order: Pick<Order, 'hdfcOrderId' | 'userId'>): Promise<HdfcOrderStatus> {
    if (!order.hdfcOrderId) {
      throw new Error('Order has no HDFC order ID');
    }
    const response = await this.request(
      'GET',
      `/orders/${encodeURIComponent(order.hdfcOrderId)}`,
      HdfcGatewayService.customerIdFor(order),
    );
    return HdfcGatewayService.normalizeStatus(response);
  }

  /**
   * Refund Order API. `uniqueRequestId` must be under 21 characters and is never
   * reused, so a retried call cannot refund twice. Returns the updated order.
   */
  async createRefund(
    order: Pick<Order, 'hdfcOrderId' | 'userId'>,
    uniqueRequestId: string,
    amountPaise: number,
  ): Promise<HdfcOrderStatus> {
    if (!order.hdfcOrderId) {
      throw new Error('Order has no HDFC order ID');
    }
    const response = await this.request(
      'POST',
      `/orders/${encodeURIComponent(order.hdfcOrderId)}/refunds`,
      HdfcGatewayService.customerIdFor(order),
      {
        contentType: 'application/x-www-form-urlencoded',
        body: new URLSearchParams({
          unique_request_id: uniqueRequestId,
          amount: HdfcGatewayService.rupees(amountPaise),
        }).toString(),
      },
    );
    return HdfcGatewayService.normalizeStatus(response);
  }

  /** Validates the Basic credentials SmartGateway sends with every webhook. */
  verifyWebhookAuthorization(header: string | undefined): boolean {
    if (!this.webhookUsername || !this.webhookPassword || !header) {
      return false;
    }
    const match = /^Basic\s+(.+)$/i.exec(header.trim());
    if (!match) return false;
    const presented = Buffer.from(Buffer.from(match[1], 'base64').toString('utf8'));
    const expected = Buffer.from(`${this.webhookUsername}:${this.webhookPassword}`);
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  }

  /**
   * `customer_id` is used by SmartGateway to store saved payment methods, so it
   * must never be shared between people. Guests get a per-order id.
   */
  static customerIdFor(order: Pick<Order, 'hdfcOrderId' | 'userId'>): string {
    return order.userId ?? `guest${order.hdfcOrderId}`;
  }

  static normalizeStatus(response: Record<string, unknown>): HdfcOrderStatus {
    const status = (HdfcGatewayService.text(response.status) ?? '').toUpperCase();
    const outcome: HdfcOutcome = CHARGED_STATUSES.has(status)
      ? 'captured'
      : FAILED_STATUSES.has(status)
        ? 'failed'
        : 'pending';
    const detail =
      response.txn_detail && typeof response.txn_detail === 'object'
        ? (response.txn_detail as Record<string, unknown>)
        : {};
    const amount = HdfcGatewayService.number(response.amount);
    const statusId = HdfcGatewayService.number(response.status_id);
    return {
      orderId: HdfcGatewayService.text(response.order_id) ?? '',
      status,
      statusId,
      outcome,
      amountPaise: amount === null ? null : Math.round(amount * 100),
      transactionId:
        HdfcGatewayService.text(response.txn_uuid) ??
        HdfcGatewayService.text(detail.txn_uuid) ??
        HdfcGatewayService.text(response.txn_id) ??
        HdfcGatewayService.text(detail.txn_id),
      paymentMethod:
        HdfcGatewayService.text(response.payment_method_type) ??
        HdfcGatewayService.text(response.payment_method),
      errorMessage:
        HdfcGatewayService.text(response.bank_error_message) ??
        HdfcGatewayService.text(detail.error_message),
      refunds: Array.isArray(response.refunds)
        ? response.refunds.flatMap((entry) => HdfcGatewayService.normalizeRefund(entry))
        : [],
      raw: HdfcGatewayService.redact(response),
    };
  }

  private static normalizeRefund(entry: unknown): HdfcRefund[] {
    if (!entry || typeof entry !== 'object') return [];
    const refund = entry as Record<string, unknown>;
    const uniqueRequestId =
      HdfcGatewayService.text(refund.unique_request_id) ?? HdfcGatewayService.text(refund.id);
    if (!uniqueRequestId) return [];
    const status = (HdfcGatewayService.text(refund.status) ?? '').toUpperCase();
    const amount = HdfcGatewayService.number(refund.amount);
    return [
      {
        uniqueRequestId,
        status,
        // MANUAL_REVIEW and PENDING both settle later.
        outcome: status === 'SUCCESS' ? 'processed' : status === 'FAILURE' ? 'failed' : 'pending',
        amountPaise: amount === null ? null : Math.round(amount * 100),
        reference: HdfcGatewayService.text(refund.ref),
        raw: refund,
      },
    ];
  }

  static rupees(paise: number): string {
    return (paise / 100).toFixed(2);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    customerId: string,
    options: { contentType?: string; body?: string } = {},
  ): Promise<Record<string, unknown>> {
    const { merchantId, apiKey } = this.requireConfiguration();
    const headers: Record<string, string> = {
      authorization: `Basic ${Buffer.from(apiKey, 'utf8').toString('base64')}`,
      accept: 'application/json',
      'content-type': options.contentType ?? 'application/json',
      'x-merchantid': merchantId,
      'x-customerid': customerId,
    };
    if (this.resellerId) headers['x-resellerid'] = this.resellerId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: options.body,
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = undefined;
      }
      if (!response.ok) {
        const detail =
          payload && typeof payload === 'object'
            ? [
                (payload as Record<string, unknown>).error_code,
                (payload as Record<string, unknown>).error_message,
              ]
                .filter((value) => typeof value === 'string' && value)
                .join(': ')
            : '';
        throw new BadGatewayException(
          `HDFC ${method} ${path.split('/')[1]} failed with HTTP ${response.status}${detail ? ` (${detail})` : ''}`,
        );
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new BadGatewayException('HDFC returned a non-JSON response');
      }
      return payload as Record<string, unknown>;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(
        `HDFC request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private requireConfiguration(): {
    merchantId: string;
    apiKey: string;
    paymentPageClientId: string;
  } {
    if (!this.enabled || !this.merchantId || !this.apiKey || !this.paymentPageClientId) {
      throw new Error('HDFC gateway is not configured; set HDFC_ENABLED=true and HDFC_* variables');
    }
    return {
      merchantId: this.merchantId,
      apiKey: this.apiKey,
      paymentPageClientId: this.paymentPageClientId,
    };
  }

  private static number(value: unknown): number | null {
    const parsed =
      typeof value === 'number' ? value : typeof value === 'string' && value ? Number(value) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }

  private static text(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  }

  /** Drops customer contact and card details before the payload is stored. */
  private static redact(response: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(response).filter(([key]) => !REDACTED_STATUS_FIELDS.has(key)),
    );
  }
}
