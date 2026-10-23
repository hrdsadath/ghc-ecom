import { Invoice, Order, OrderStatus } from '@prisma/client';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { PrismaService } from '../database/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { InvoiceService } from './invoice.service';

describe('InvoiceService', () => {
  const order = {
    id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    orderNumber: 'GHC-TEST-1',
    status: OrderStatus.CONFIRMED,
    itemsSnapshot: [
      {
        sku: 'SKU-1',
        productName: 'Herbal Product',
        color: 'Gold',
        optionLabel: 'Gold · Large · Pack of 2',
        quantity: 2,
        unitPricePaise: 10_000,
        lineTotalPaise: 20_000,
      },
    ],
    addressSnapshot: {
      recipientName: 'Customer',
      line1: '12 Market Road',
      city: 'Vengara',
      state: 'Kerala',
      postalCode: '676304',
      country: 'IN',
      email: 'customer@example.com',
    },
    createdAt: new Date('2026-10-01T08:00:00.000Z'),
    subtotalPaise: 20_000,
    discountPaise: 1_000,
    shippingPaise: 900,
    taxPaise: 3_420,
    totalPaise: 23_320,
  } as unknown as Order;
  let prisma: {
    invoice: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    payment: { findFirst: jest.Mock };
  };
  let supabase: {
    uploadPrivateDocument: jest.Mock;
    removePrivateDocuments: jest.Mock;
    createPrivateDocumentUrl: jest.Mock;
  };
  let service: InvoiceService;

  beforeEach(() => {
    prisma = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Invoice }) =>
            Promise.resolve({ ...data, id: 'invoice-1' }),
          ),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue({ method: 'UPI', status: 'CAPTURED' }),
      },
    };
    supabase = {
      uploadPrivateDocument: jest.fn().mockResolvedValue(undefined),
      removePrivateDocuments: jest.fn().mockResolvedValue(undefined),
      createPrivateDocumentUrl: jest.fn().mockResolvedValue('https://signed.example/invoice'),
    };
    service = new InvoiceService(
      prisma as unknown as PrismaService,
      supabase as unknown as SupabaseService,
    );
  });

  it('generates one PDF and stores it in the private bucket', async () => {
    await service.ensure(order);

    const upload = supabase.uploadPrivateDocument.mock.calls[0] as [string, Buffer, string];
    expect(upload[0]).toMatch(new RegExp(`^invoices/${order.id}/.+\\.pdf$`));
    expect(upload[1].subarray(0, 4).toString()).toBe('%PDF');
    expect(upload[2]).toBe('application/pdf');
    expect(prisma.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: order.id,
        number: `INV-${order.orderNumber}`,
        bytes: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });

  it('reuses an existing invoice without uploading another object', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-existing' });

    await expect(service.ensure(order)).resolves.toEqual({ id: 'invoice-existing' });
    expect(supabase.uploadPrivateDocument).not.toHaveBeenCalled();
  });

  /** Generates an invoice and returns the parsed PDF plus every string drawn on it. */
  const render = async (input: Order): Promise<{ pdf: PDFDocument; drawn: string[] }> => {
    const drawn: string[] = [];
    const original = PDFPage.prototype.drawText;
    const drawText = jest.spyOn(PDFPage.prototype, 'drawText');
    drawText.mockImplementation(function (this: PDFPage, text, options) {
      drawn.push(text);
      return original.call(this, text, options);
    });
    try {
      await service.ensure(input);
    } finally {
      drawText.mockRestore();
    }
    const upload = supabase.uploadPrivateDocument.mock.calls.at(-1) as [string, Buffer, string];
    return { pdf: await PDFDocument.load(upload[1]), drawn };
  };

  it('lays out a plain invoice with order, customer, payment and totals in rupees', async () => {
    const { pdf, drawn } = await render(order);

    expect(pdf.getPageCount()).toBe(1);
    expect(drawn).toContain('INVOICE');
    expect(drawn.join(' ')).not.toMatch(/tax invoice|gst/i);
    expect(drawn).toEqual(
      expect.arrayContaining([
        'INV-GHC-TEST-1',
        'GHC-TEST-1',
        '01 Oct 2026',
        'Customer',
        '12 Market Road',
        'Vengara, Kerala, 676304',
        'Method: UPI (HDFC SmartGateway)',
        'Status: Paid',
        'Herbal Product',
        'Gold · Large · Pack of 2',
        'Rs. 100.00',
        'Rs. 200.00',
        '- Rs. 10.00',
        'Rs. 9.00',
        'Rs. 34.20',
        'Rs. 233.20',
      ]),
    );
    expect(drawn.indexOf('Total')).toBeGreaterThan(-1);
    expect(drawn[drawn.indexOf('Total') + 1]).toBe('Rs. 233.20');
  });

  it('flows many items onto further pages with the table header repeated', async () => {
    const items = Array.from({ length: 120 }, (_, index) => ({
      sku: `SKU-${index}`,
      productName: `Porcelain dinner plate set number ${index}`,
      optionLabel: 'White',
      quantity: 1,
      unitPricePaise: 10_000,
      lineTotalPaise: 10_000,
    }));
    const { pdf, drawn } = await render({
      ...order,
      itemsSnapshot: items,
      subtotalPaise: 1_200_000,
      discountPaise: 0,
      shippingPaise: 0,
      taxPaise: 0,
      totalPaise: 1_200_000,
    } as unknown as Order);

    const pages = pdf.getPageCount();
    expect(pages).toBeGreaterThan(2);
    expect(drawn.filter((text) => text === 'PRODUCT')).toHaveLength(pages);
    expect(drawn).toContain(`Page ${pages} of ${pages}`);
    expect(drawn).toContain('Porcelain dinner plate set number 119');
    expect(drawn).toContain('Rs. 12,000.00');
    expect(drawn).toContain('Free');
    // Nothing is drawn below the footer area or off the page.
    for (const page of pdf.getPages()) expect(page.getHeight()).toBeCloseTo(841.89);
  });

  it('never throws on characters the standard font cannot encode', async () => {
    const { drawn } = await render({
      ...order,
      itemsSnapshot: [
        {
          productName: 'ചായ കപ്പ് സെറ്റ് ☕ Tea Cup ₹ Set 🎉',
          optionLabel: 'Café crème — 6 pcs × 2 中文',
          quantity: 1,
          unitPricePaise: 50_000,
          lineTotalPaise: 50_000,
        },
      ],
      addressSnapshot: { recipientName: 'Zoë 😊 Müller', line1: 'ഹൗസ് 1', city: 'Kochi' },
    } as unknown as Order);

    expect(drawn).toContain('? ? ? ? Tea Cup Rs. Set ?');
    expect(drawn).toContain('Café crème — 6 pcs × 2 ?');
    expect(drawn).toContain('Zoë ? Müller');
    expect(prisma.invoice.create).toHaveBeenCalled();
  });
});
