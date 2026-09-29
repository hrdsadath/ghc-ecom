import { describe, expect, it, vi } from 'vitest';
import { HdfcPaymentIntent } from '../types';
import { redirectToGateway, resolveCheckoutEmail } from './payment-gateway';

const intent: HdfcPaymentIntent = {
    provider: 'hdfc',
    orderId: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    orderNumber: 'GHC-TEST-1',
    hdfcOrderId: 'GHCMF0ABCDE12345678',
    amount: 12_750,
    currency: 'INR',
    paymentUrl: 'https://smartgateway.hdfcuat.bank.in/orders/ordeh_1/payment-page',
};

describe('resolveCheckoutEmail', () => {
    it('uses the signed-in email when the saved-address form has no email field', () => {
        expect(resolveCheckoutEmail(null, ' customer@example.com ')).toBe('customer@example.com');
    });
});

describe('redirectToGateway', () => {
    it('navigates the top-level window to the hosted payment page', () => {
        const location = { assign: vi.fn() };

        redirectToGateway(intent, location);

        expect(location.assign).toHaveBeenCalledWith(intent.paymentUrl);
    });

    it('refuses to send the customer to a non-HTTPS payment page', () => {
        const location = { assign: vi.fn() };

        expect(() => redirectToGateway({ ...intent, paymentUrl: 'http://insecure.example' }, location)).toThrow('HTTPS');
        expect(location.assign).not.toHaveBeenCalled();
    });
});
