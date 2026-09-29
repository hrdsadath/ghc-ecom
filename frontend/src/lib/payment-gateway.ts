import { HdfcPaymentIntent } from '../types';

/** Hands the customer to the SmartGateway hosted payment page (top-level navigation; iframes are unsupported). */
export function redirectToGateway(intent: HdfcPaymentIntent, location: Pick<Location, 'assign'> = window.location): void {
    if (!/^https:\/\//i.test(intent.paymentUrl)) {
        throw new Error('Payment page URL must use HTTPS.');
    }
    location.assign(intent.paymentUrl);
}

export function resolveCheckoutEmail(formEmail: string | null, sessionEmail?: string): string {
    return (formEmail ?? sessionEmail ?? '').trim();
}
