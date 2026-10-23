import { describe, expect, it } from 'vitest';
import {
    basisPointsToPercent,
    couponStatus,
    istDateBoundaryIso,
    istDateInputValue,
    istDateTimeLabel,
    localDateBoundaryIso,
    normalizeCouponCode,
    percentToBasisPoints,
    rupeesToPaise,
} from './promotions';

describe('promotion units', () => {
    it('converts the admin-facing percentage to backend basis points and back', () => {
        expect(percentToBasisPoints(15)).toBe(1_500);
        expect(percentToBasisPoints(12.5)).toBe(1_250);
        expect(basisPointsToPercent(1_500)).toBe(15);
    });

    it('converts rupee inputs to whole paise without float drift', () => {
        expect(rupeesToPaise(250)).toBe(25_000);
        expect(rupeesToPaise(19.99)).toBe(1_999);
        expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    });

    it('builds coupon day boundaries in IST regardless of the device time zone', () => {
        expect(istDateBoundaryIso('2026-08-08')).toBe('2026-08-07T18:30:00.000Z');
        expect(istDateBoundaryIso('2026-08-08', true)).toBe('2026-08-08T18:29:59.999Z');
    });

    it('derives IST calendar dates for date inputs', () => {
        // 20:00 UTC is already the next day in India.
        expect(istDateInputValue('2026-08-08T20:00:00.000Z')).toBe('2026-08-09');
        expect(istDateInputValue('2026-08-08T10:00:00.000Z', 30)).toBe('2026-09-07');
        expect(istDateTimeLabel('2026-08-07T18:30:00.000Z')).toMatch(/08 Aug 2026.*12:00\s?am/i);
    });

    it('keeps a selected local end date valid through the end of that local day', () => {
        const result = new Date(localDateBoundaryIso('2026-08-08', true));
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(7);
        expect(result.getDate()).toBe(8);
        expect(result.getHours()).toBe(23);
    });

    it('normalises pasted coupon codes', () => {
        expect(normalizeCouponCode('  welcome10 ')).toBe('WELCOME10');
    });

    it('derives scheduled, active, expired and inactive coupon states', () => {
        const window = { startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-10-31T00:00:00.000Z' };
        const at = (iso: string) => new Date(iso).getTime();
        expect(couponStatus({ ...window, isActive: true }, at('2026-09-30T00:00:00.000Z'))).toBe('Scheduled');
        expect(couponStatus({ ...window, isActive: true }, at('2026-10-10T00:00:00.000Z'))).toBe('Active');
        expect(couponStatus({ ...window, isActive: true }, at('2026-11-01T00:00:00.000Z'))).toBe('Expired');
        expect(couponStatus({ ...window, isActive: false }, at('2026-10-10T00:00:00.000Z'))).toBe('Inactive');
    });
});
