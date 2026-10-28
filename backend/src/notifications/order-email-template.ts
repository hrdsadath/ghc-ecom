import { Order, Prisma } from '@prisma/client';

export type OrderEmailEvent = 'order.confirmed' | 'order.shipped' | 'order.cancelled';

interface SnapshotItem {
  productName?: string;
  color?: string;
  optionLabel?: string;
  sku?: string;
  quantity?: number;
  lineTotalPaise?: number;
}

export interface RenderedOrderEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });

const rupees = (paise: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100);

const whatsappSupportUrl = (orderNumber: string): string =>
  `https://wa.me/916282000289?text=${encodeURIComponent(
    `Hi Glockery Home Centre, I need help with order ${orderNumber}.`,
  )}`;

const orderItems = (value: Prisma.JsonValue): SnapshotItem[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, Prisma.JsonValue>;
    return [
      {
        productName: typeof record.productName === 'string' ? record.productName : 'Product',
        color: typeof record.color === 'string' ? record.color : undefined,
        optionLabel:
          typeof record.optionLabel === 'string'
            ? record.optionLabel
            : typeof record.color === 'string'
              ? record.color
              : undefined,
        sku: typeof record.sku === 'string' ? record.sku : undefined,
        quantity: typeof record.quantity === 'number' ? record.quantity : 1,
        lineTotalPaise:
          typeof record.lineTotalPaise === 'number' ? record.lineTotalPaise : undefined,
      },
    ];
  });
};

export const renderOrderEmail = (
  order: Order,
  event: OrderEmailEvent,
  recipientName?: string,
): RenderedOrderEmail => {
  const confirmed = event === 'order.confirmed';
  const shipped = event === 'order.shipped';
  const title = confirmed
    ? 'Your order is confirmed'
    : shipped
      ? 'Your order has shipped'
      : 'Your order has been cancelled';
  const eyebrow = confirmed ? 'ORDER CONFIRMED' : shipped ? 'ORDER SHIPPED' : 'ORDER CANCELLED';
  const accent = confirmed ? '#b8862f' : shipped ? '#3f6e5a' : '#9d4b4b';
  const statusLabel = confirmed ? 'Payment secured' : shipped ? 'Shipped' : 'Cancellation received';
  const intro = confirmed
    ? 'Your table is about to get more beautiful. We have received your order and will keep you updated at every step.'
    : shipped
      ? 'Thank you for shopping with Glockery. We have shipped your item and it is on its way to you.'
      : 'We have cancelled your order. If a payment was captured, the refund will be returned to the original payment method.';
  const nextStep = confirmed
    ? 'Your payment is confirmed. Keep this email and your order number for your records and any support enquiry.'
    : shipped
      ? 'Keep this email and your order number for your records and any support enquiry.'
      : 'Refund timing depends on your bank or payment method. We will notify you when the refund is processed.';
  const returnUrl = `https://www.glockery.com/account/orders/${order.id}`;
  const returnText = shipped
    ? `\n\nNot quite right? Start a return from your order page: ${returnUrl}`
    : '';
  const returnHtml = shipped
    ? `
            <p style="margin:22px 0 8px;color:#756e62;font:12px/18px Arial,sans-serif;">Not quite right with your order?</p>
            <a href="${escapeHtml(returnUrl)}" style="display:inline-block;border:1px solid #171511;color:#171511;padding:11px 20px;text-decoration:none;font:700 11px/16px Arial,sans-serif;letter-spacing:1.1px;">START A RETURN</a>`
    : '';
  const items = orderItems(order.itemsSnapshot);
  const safeName = escapeHtml(recipientName?.trim() || 'there');
  const safeOrderNumber = escapeHtml(order.orderNumber);
  const whatsappUrl = whatsappSupportUrl(order.orderNumber);
  const placedAt = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(order.createdAt);
  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #e8e1d5;vertical-align:top;">
            <p style="margin:0;color:#171511;font:600 14px/20px Arial,sans-serif;">${escapeHtml(item.productName || 'Product')}</p>
            <p style="margin:4px 0 0;color:#756e62;font:12px/18px Arial,sans-serif;">${item.optionLabel ? `${escapeHtml(item.optionLabel)} · ` : ''}${item.sku ? `SKU ${escapeHtml(item.sku)} · ` : ''}Qty ${item.quantity ?? 1}</p>
          </td>
          <td style="padding:16px 0 16px 16px;border-bottom:1px solid #e8e1d5;color:#171511;font:600 14px/20px Arial,sans-serif;text-align:right;vertical-align:top;white-space:nowrap;">${item.lineTotalPaise === undefined ? '—' : rupees(item.lineTotalPaise)}</td>
        </tr>`,
    )
    .join('');
  const textItems = items
    .map(
      (item) =>
        `- ${item.productName || 'Product'}${item.optionLabel ? ` (${item.optionLabel})` : ''} × ${item.quantity ?? 1}${item.lineTotalPaise === undefined ? '' : ` — ${rupees(item.lineTotalPaise)}`}`,
    )
    .join('\n');

  return {
    subject: `${confirmed ? 'Confirmed' : shipped ? 'Shipped' : 'Cancelled'} — your Glockery order ${order.orderNumber}`,
    text: `Hello ${recipientName?.trim() || 'there'},\n\n${title}\n\nOrder: ${order.orderNumber}\nPlaced: ${placedAt}\nTotal: ${rupees(order.totalPaise)}\n\n${textItems || 'Your order details are available in your account.'}\n\n${nextStep}${returnText}\n\nWhatsApp support: ${whatsappUrl}\n\nGlockery Home Centre`,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f3efe8;color:#171511;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(title)} — ${safeOrderNumber}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3efe8;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#fffdf9;">
          <tr><td style="height:5px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="background:#171511;padding:26px 36px 28px;text-align:center;">
            <div style="display:inline-block;border:1px solid #c79b42;color:#f2d28c;font:700 21px/34px Georgia,serif;width:34px;height:34px;">G</div>
            <p style="margin:11px 0 0;color:#fffaf0;font:700 13px/18px Arial,sans-serif;letter-spacing:3px;">GLOCKERY</p>
            <p style="margin:4px 0 0;color:#c5a86a;font:10px/16px Arial,sans-serif;letter-spacing:2px;">HOME CENTRE</p>
          </td></tr>
          <tr><td style="padding:34px 36px 8px;">
            <p style="margin:0;color:${accent};font:700 10px/16px Arial,sans-serif;letter-spacing:1.8px;">${eyebrow}</p>
            <h1 style="margin:10px 0 0;color:#171511;font:400 32px/38px Georgia,serif;">${escapeHtml(title)}</h1>
            <p style="margin:16px 0 0;color:#625b51;font:15px/24px Arial,sans-serif;">Hello ${safeName}, ${escapeHtml(intro)}</p>
          </td></tr>
          <tr><td style="padding:24px 36px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e8e1d5;">
              <tr>
                <td style="padding:16px 18px;background:#fbf7ef;">
                  <p style="margin:0;color:#756e62;font:700 10px/15px Arial,sans-serif;letter-spacing:1.2px;">ORDER</p>
                  <p style="margin:5px 0 0;color:#171511;font:700 15px/20px Arial,sans-serif;">${safeOrderNumber}</p>
                  <p style="margin:3px 0 0;color:#756e62;font:11px/17px Arial,sans-serif;">Placed ${placedAt}</p>
                </td>
                <td style="padding:16px 18px;background:#fbf7ef;text-align:right;">
                  <p style="margin:0;color:${accent};font:700 10px/15px Arial,sans-serif;letter-spacing:1.2px;">${statusLabel.toUpperCase()}</p>
                  <p style="margin:5px 0 0;color:#171511;font:700 15px/20px Arial,sans-serif;">${rupees(order.totalPaise)}</p>
                </td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:28px 36px 0;">
            <p style="margin:0 0 8px;color:#171511;font:700 12px/18px Arial,sans-serif;letter-spacing:1.1px;">YOUR PIECES</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${itemRows || '<tr><td style="padding:16px 0;color:#756e62;font:14px/20px Arial,sans-serif;">Your order details are available in your account.</td></tr>'}</table>
          </td></tr>
          <tr><td style="padding:28px 36px 0;">
            <div style="border-left:3px solid ${accent};background:#fbf7ef;padding:16px 18px;">
              <p style="margin:0;color:#171511;font:700 12px/18px Arial,sans-serif;">What happens next</p>
              <p style="margin:5px 0 0;color:#625b51;font:13px/20px Arial,sans-serif;">${escapeHtml(nextStep)}</p>
            </div>
          </td></tr>
          <tr><td style="padding:32px 36px 36px;text-align:center;">
            <a href="https://www.glockery.com/order-lookup" style="display:inline-block;background:#171511;color:#fffaf0;padding:13px 22px;text-decoration:none;font:700 11px/16px Arial,sans-serif;letter-spacing:1.2px;">VIEW ORDER DETAILS</a>${returnHtml}
            <p style="margin:22px 0 8px;color:#756e62;font:12px/18px Arial,sans-serif;">Need help with this order?</p>
            <a href="${escapeHtml(whatsappUrl)}" style="display:inline-block;border:1px solid #b8862f;color:#171511;padding:11px 20px;text-decoration:none;font:700 11px/16px Arial,sans-serif;letter-spacing:1.1px;">CHAT ON WHATSAPP</a>
          </td></tr>
          <tr><td style="border-top:1px solid #e8e1d5;padding:22px 36px;background:#fbf7ef;text-align:center;">
            <p style="margin:0;color:#756e62;font:11px/18px Arial,sans-serif;">Thoughtfully chosen pieces for the rituals at home.</p>
            <p style="margin:6px 0 0;color:#9a9081;font:10px/16px Arial,sans-serif;">© Glockery Home Centre · Please keep this email for your records.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
};
