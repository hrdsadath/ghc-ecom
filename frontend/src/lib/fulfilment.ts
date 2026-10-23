import type { Order, OrderPayment } from '../types';

/**
 * Shipment states an admin may move to from each state. Mirrors
 * `public.advance_shipment_status` (migration 20260723230000), which rejects
 * every other transition.
 */
const SHIPMENT_TRANSITIONS: Record<string, readonly string[]> = {
    CREATED: ['LABEL_CREATED', 'IN_TRANSIT', 'CANCELLED'],
    LABEL_CREATED: ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'EXCEPTION'],
    EXCEPTION: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'],
};

export const nextShipmentStatuses = (status: string): readonly string[] => SHIPMENT_TRANSITIONS[status] ?? [];

/**
 * Parses a rupee amount typed by staff ("1299", "1,299.50", "₹ 1,299") into
 * paise. Returns null for anything that is not a positive amount with at most
 * two decimal places.
 */
export const parseRupeesToPaise = (value: string): number | null => {
    const normalized = value.replace(/[₹\s,]/g, '').replace(/^rs\.?/i, '');
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
    if (!match) return null;
    const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
    return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
};

/** Plain rupee figure for an input field: 129950 → "1299.50", 129900 → "1299". */
export const paiseToRupeesInput = (paise: number): string =>
    paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);

/** What can still be refunded: the captured amount minus every refund that has not failed. */
export const refundablePaise = (payment: Pick<OrderPayment, 'amountPaise' | 'refunds'>): number =>
    Math.max(
        0,
        payment.amountPaise -
            (payment.refunds ?? [])
                .filter((refund) => refund.status !== 'FAILED')
                .reduce((sum, refund) => sum + refund.amountPaise, 0),
    );

/**
 * Idempotency key for a return's refund. It stays the same across retries of
 * one attempt (so a lost response can never refund twice) and changes only
 * after an attempt definitely failed.
 */
export const returnRefundKey = (returnId: string, payment: Pick<OrderPayment, 'refunds'>): string => {
    const failedAttempts = (payment.refunds ?? []).filter(
        (refund) => refund.returnRequestId === returnId && refund.status === 'FAILED',
    ).length;
    return `return_${returnId}_${failedAttempts}`;
};

/**
 * Whether an admin may cancel the order: paid but not yet shipped, with no live
 * shipment. Mirrors the checks in OrdersService.cancelAdmin.
 */
export const canAdminCancelOrder = (order: Pick<Order, 'status' | 'shipments'>): boolean =>
    (order.status === 'CONFIRMED' || order.status === 'PROCESSING') &&
    !(order.shipments ?? []).some((shipment) => shipment.status !== 'CANCELLED');

/**
 * What the automatic cancellation refund will return: the captured payment
 * minus refunds that have not failed (as RefundsService.refundOrderCancellation).
 */
export const cancellationRefundPaise = (order: Pick<Order, 'payments'>): number => {
    const payment = order.payments?.find((item) => item.status === 'CAPTURED' || item.status === 'REFUNDED');
    return payment ? refundablePaise(payment) : 0;
};
