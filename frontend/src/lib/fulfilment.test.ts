import { describe, expect, it } from 'vitest';
import {
    canAdminCancelOrder,
    cancellationRefundPaise,
    paiseToRupeesInput,
    parseRupeesToPaise,
    refundablePaise,
    returnRefundKey,
} from './fulfilment';
import type { Order } from '../types';

describe('parseRupeesToPaise', () => {
    it.each([
        ['1299', 129_900],
        ['1,299', 129_900],
        ['₹ 1,299.5', 129_950],
        ['0.01', 1],
        ['Rs. 10', 1_000],
    ])('parses %s', (value, paise) => {
        expect(parseRupeesToPaise(value)).toBe(paise);
    });

    it.each(['', '0', '-5', 'abc', '1.234', '1e3', '12.'])('rejects %s', (value) => {
        expect(parseRupeesToPaise(value)).toBeNull();
    });

    it('round-trips through the input formatter', () => {
        expect(paiseToRupeesInput(129_950)).toBe('1299.50');
        expect(paiseToRupeesInput(129_900)).toBe('1299');
        expect(parseRupeesToPaise(paiseToRupeesInput(129_950))).toBe(129_950);
    });
});

describe('refunds', () => {
    const refund = (status: string, amountPaise: number, returnRequestId: string | null = 'ret-1') => ({
        id: `${status}-${amountPaise}`,
        amountPaise,
        currency: 'INR',
        status,
        returnRequestId,
        createdAt: '2026-10-01T00:00:00.000Z',
    });

    it('subtracts every refund except failed ones', () => {
        expect(
            refundablePaise({
                amountPaise: 10_000,
                refunds: [refund('PROCESSED', 2_000), refund('PENDING', 1_000), refund('FAILED', 5_000)],
            }),
        ).toBe(7_000);
    });

    it('keeps the idempotency key stable until an attempt fails', () => {
        expect(returnRefundKey('ret-1', { refunds: [] })).toBe('return_ret-1_0');
        expect(returnRefundKey('ret-1', { refunds: [refund('PENDING', 1_000)] })).toBe('return_ret-1_0');
        expect(
            returnRefundKey('ret-1', { refunds: [refund('FAILED', 1_000), refund('FAILED', 1_000, 'other')] }),
        ).toBe('return_ret-1_1');
    });
});

describe('admin cancellation helpers', () => {
    const shipment = (status: string) => ({ status }) as NonNullable<Order['shipments']>[number];

    it('allows only paid, unshipped orders without a live shipment', () => {
        expect(canAdminCancelOrder({ status: 'CONFIRMED', shipments: [] })).toBe(true);
        expect(canAdminCancelOrder({ status: 'PROCESSING' })).toBe(true);
        expect(canAdminCancelOrder({ status: 'PROCESSING', shipments: [shipment('CANCELLED')] })).toBe(true);
        expect(canAdminCancelOrder({ status: 'PROCESSING', shipments: [shipment('CREATED')] })).toBe(false);
        for (const status of ['PAYMENT_PENDING', 'PAYMENT_FAILED', 'SHIPPED', 'DELIVERED', 'CANCELLED']) {
            expect(canAdminCancelOrder({ status, shipments: [] })).toBe(false);
        }
    });

    it('sizes the refund as the captured amount minus refunds that did not fail', () => {
        const payments = [
            { id: 'p0', status: 'FAILED', amountPaise: 5_000, refunds: [] },
            {
                id: 'p1',
                status: 'CAPTURED',
                amountPaise: 20_000,
                refunds: [
                    { id: 'r1', amountPaise: 3_000, status: 'PROCESSED' },
                    { id: 'r2', amountPaise: 4_000, status: 'FAILED' },
                ],
            },
        ] as unknown as Order['payments'];
        expect(cancellationRefundPaise({ payments })).toBe(17_000);
        expect(cancellationRefundPaise({ payments: [] })).toBe(0);
    });
});
