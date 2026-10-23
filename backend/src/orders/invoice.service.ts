import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Invoice, Order, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { InvoiceAddress, InvoiceLine, renderInvoicePdf } from './invoice-pdf';
import { storeDetails } from './store-details';

const invoiceNumber = (order: Pick<Order, 'orderNumber'>): string => `INV-${order.orderNumber}`;

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async ensure(order: Order): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({ where: { orderId: order.id } });
    if (existing) {
      return existing;
    }
    const pdf = await this.generate(order);
    const number = invoiceNumber(order);
    const storagePath = `invoices/${order.id}/${randomUUID()}.pdf`;
    await this.supabase.uploadPrivateDocument(storagePath, pdf, 'application/pdf');
    try {
      return await this.prisma.invoice.create({
        data: {
          orderId: order.id,
          number,
          storagePath,
          bytes: pdf.length,
          sha256: createHash('sha256').update(pdf).digest('hex'),
        },
      });
    } catch (error) {
      await this.supabase.removePrivateDocuments([storagePath]);
      const raced = await this.prisma.invoice.findUnique({ where: { orderId: order.id } });
      if (raced) {
        return raced;
      }
      throw error;
    }
  }

  signedUrl(storagePath: string): Promise<string> {
    return this.supabase.createPrivateDocumentUrl(storagePath, 300);
  }

  private async generate(order: Order): Promise<Buffer> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        status: { in: [PaymentStatus.CAPTURED, PaymentStatus.REFUNDED] },
      },
      select: { method: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
    const pdf = await renderInvoicePdf({
      invoiceNumber: invoiceNumber(order),
      invoiceDate: new Date(),
      orderNumber: order.orderNumber,
      orderDate: order.createdAt ?? order.confirmedAt,
      address: this.address(order.addressSnapshot),
      lines: Array.isArray(order.itemsSnapshot) ? (order.itemsSnapshot as InvoiceLine[]) : [],
      subtotalPaise: order.subtotalPaise,
      discountPaise: order.discountPaise,
      shippingPaise: order.shippingPaise,
      taxPaise: order.taxPaise,
      totalPaise: order.totalPaise,
      payment,
      store: storeDetails(),
    });
    return Buffer.from(pdf);
  }

  private address(value: Prisma.JsonValue): InvoiceAddress {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as InvoiceAddress)
      : {};
  }
}
