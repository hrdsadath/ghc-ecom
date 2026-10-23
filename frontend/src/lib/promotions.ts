import type { Coupon } from '../types';

export const percentToBasisPoints = (percent: number): number => Math.round(percent * 100);

export const basisPointsToPercent = (basisPoints: number): number => basisPoints / 100;

/** Admin money inputs are in rupees; the API stores paise. */
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

export const paiseToRupeesValue = (paise: number): string => String(paise / 100);

/** Day boundary in the device's local zone (used by the audit-log date filters). */
export const localDateBoundaryIso = (value: string, endOfDay = false): string => {
    const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
    return new Date(`${value}T${time}`).toISOString();
};

/** Coupon windows follow the store's business day in India, whatever the admin's device zone. */
const IST_OFFSET = '+05:30';
const IST_OFFSET_MS = 330 * 60_000;

/** `YYYY-MM-DD` (as typed into a date input) → the start or end instant of that day in IST. */
export const istDateBoundaryIso = (value: string, endOfDay = false): string => {
    const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
    return new Date(`${value}T${time}${IST_OFFSET}`).toISOString();
};

/** The IST calendar date (`YYYY-MM-DD`) of an instant, for date inputs. */
export const istDateInputValue = (value: Date | string | number, addDays = 0): string =>
    new Date(new Date(value).getTime() + IST_OFFSET_MS + addDays * 86_400_000).toISOString().slice(0, 10);

const istDateTime = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
});

export const istDateTimeLabel = (value: string): string => istDateTime.format(new Date(value));

/** Codes are stored in capitals; spaces around a pasted code are never intentional. */
export const normalizeCouponCode = (value: string): string => value.trim().toUpperCase();

export const COUPON_CODE_PATTERN = '[A-Za-z0-9_\\-]{1,40}';

export type CouponStatus = 'Scheduled' | 'Active' | 'Expired' | 'Inactive';

export const couponStatus = (coupon: Pick<Coupon, 'isActive' | 'startsAt' | 'endsAt'>, now = Date.now()): CouponStatus => {
    if (!coupon.isActive) return 'Inactive';
    if (now < new Date(coupon.startsAt).getTime()) return 'Scheduled';
    if (now > new Date(coupon.endsAt).getTime()) return 'Expired';
    return 'Active';
};
