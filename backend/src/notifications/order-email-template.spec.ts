import { OrderStatus } from '@prisma/client';
import { renderOrderEmail } from './order-email-template';

describe('renderOrderEmail', () => {
  const order = {
    id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    orderNumber: 'GHC-EMAIL-42',
    status: OrderStatus.CONFIRMED,
    createdAt: new Date('2026-08-06T12:00:00.000Z'),
    totalPaise: 11_198,
    itemsSnapshot: [
      {
        productName: 'Noir Gold Tea Set',
        color: 'Gold',
        optionLabel: 'Gold · Large · Pack of 2',
        sku: 'GHC-TEA-006',
        quantity: 1,
        lineTotalPaise: 11_198,
      },
    ],
  } as never;

  it('renders a complete branded confirmation with the order line item', () => {
    const email = renderOrderEmail(order, 'order.confirmed', 'Faheem');

    expect(email.subject).toBe('Confirmed — your Glockery order GHC-EMAIL-42');
    expect(email.text).toContain('Noir Gold Tea Set (Gold · Large · Pack of 2) × 1 — ₹111.98');
    expect(email.html).toContain('GLOCKERY');
    expect(email.html).toContain('Noir Gold Tea Set');
    expect(email.html).toContain('Placed 6 Aug 2026');
    expect(email.html).toContain('VIEW ORDER DETAILS');
    expect(email.html).toContain('CHAT ON WHATSAPP');
    expect(email.html).toContain(
      'https://wa.me/916282000289?text=Hi%20Glockery%20Home%20Centre%2C%20I%20need%20help%20with%20order%20GHC-EMAIL-42.',
    );
    expect(email.text).toContain(
      'WhatsApp support: https://wa.me/916282000289?text=Hi%20Glockery%20Home%20Centre%2C%20I%20need%20help%20with%20order%20GHC-EMAIL-42.',
    );
  });

  it('sends the shipped thank-you with the shipping partner and tracking number', () => {
    const email = renderOrderEmail(order, 'order.shipped', 'Faheem', {
      provider: 'Shiprocket',
      trackingNumber: 'SR<77>',
    });

    expect(email.subject).toBe('Shipped — your Glockery order GHC-EMAIL-42');
    expect(email.text).toContain('Track your parcel with Shiprocket using tracking number SR<77>.');
    expect(email.html).toContain('Your order is on its way');
    expect(email.html).toContain('TRACKING NUMBER');
    expect(email.html).toContain('Shipping partner: Shiprocket');
    expect(email.html).toContain('SR&lt;77&gt;');
    expect(email.html).not.toContain('SR<77>');
  });

  it('links the shipped email to the order page to start a return, and no other email does', () => {
    const returnUrl = 'https://www.glockery.com/account/orders/1b4e28ba-2fa1-11d2-883f-0016d3cca427';
    const shipped = renderOrderEmail(order, 'order.shipped', 'Faheem', {
      provider: 'Shiprocket',
      trackingNumber: 'SR-1',
    });
    const confirmed = renderOrderEmail(order, 'order.confirmed', 'Faheem');

    expect(shipped.html).toContain(`href="${returnUrl}"`);
    expect(shipped.html).toContain('START A RETURN');
    expect(shipped.text).toContain(`Start a return from your order page: ${returnUrl}`);
    expect(confirmed.html).not.toContain('START A RETURN');
    expect(confirmed.text).not.toContain('Start a return');
  });

  it('tells the customer the tracking number follows when none is recorded yet', () => {
    const email = renderOrderEmail(order, 'order.shipped', 'Faheem', null);

    expect(email.text).toContain('Your tracking number will be shared shortly.');
    expect(email.html).not.toContain('TRACKING NUMBER');
  });

  it('uses cancellation content and escapes unsafe customer input', () => {
    const email = renderOrderEmail(order, 'order.cancelled', '<script>alert(1)</script>');

    expect(email.subject).toBe('Cancelled — your Glockery order GHC-EMAIL-42');
    expect(email.html).toContain('Your order has been cancelled');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('CHAT ON WHATSAPP');
  });
});
