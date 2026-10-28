import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  Order,
  OutboxEvent,
  OutboxStatus,
  Prisma,
  ShipmentStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RefundsService } from '../fulfilment/refunds.service';
import { InvoiceService } from '../orders/invoice.service';
import { NotificationMessage, NotificationSenderService } from './notification-sender.service';
import {
  OrderEmailEvent,
  renderOrderEmail,
  ShipmentTracking,
} from './order-email-template';

const MAX_ATTEMPTS = 5;
const NOTIFIED_ORDER_EVENTS: readonly OrderEmailEvent[] = [
  'order.confirmed',
  'order.shipped',
  'order.cancelled',
];
const PROCESSING_LEASE_MS = 5 * 60 * 1000;

interface AddressContact {
  email?: string;
  phone?: string;
  recipientName?: string;
}

@Injectable()
export class OutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoiceService,
    private readonly sender: NotificationSenderService,
    private readonly refunds: RefundsService,
  ) {}

  async processPending(limit = 25): Promise<number> {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        attempts: { lt: MAX_ATTEMPTS },
        OR: [
          {
            status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
            availableAt: { lte: new Date() },
          },
          {
            status: OutboxStatus.PROCESSING,
            processingStartedAt: { lte: this.leaseCutoff() },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    let processed = 0;
    for (const event of events) {
      if (await this.claim(event.id)) {
        await this.processClaimed(event);
        processed += 1;
      }
    }
    return processed;
  }

  private async claim(id: string): Promise<boolean> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: {
        id,
        attempts: { lt: MAX_ATTEMPTS },
        OR: [
          { status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] } },
          {
            status: OutboxStatus.PROCESSING,
            processingStartedAt: { lte: this.leaseCutoff() },
          },
        ],
      },
      data: {
        status: OutboxStatus.PROCESSING,
        attempts: { increment: 1 },
        processingStartedAt: new Date(),
        lastError: null,
      },
    });
    return result.count === 1;
  }

  private async processClaimed(event: OutboxEvent): Promise<void> {
    try {
      if (event.aggregateType === 'order') {
        await this.processOrderEvent(event);
      }
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: OutboxStatus.PROCESSED,
          processedAt: new Date(),
          processingStartedAt: null,
          lastError: null,
        },
      });
    } catch (error) {
      const attempts = event.attempts + 1;
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: OutboxStatus.FAILED,
          processingStartedAt: null,
          lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
          availableAt: new Date(Date.now() + this.retryDelay(attempts)),
        },
      });
    }
  }

  private async processOrderEvent(event: OutboxEvent): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: event.aggregateId },
    });
    if (event.eventType === 'order.confirmed') {
      await this.invoices.ensure(order);
    }
    if (event.eventType === 'order.cancelled') {
      await this.refunds.refundOrderCancellation(order.id);
    }
    const emailEvent = NOTIFIED_ORDER_EVENTS.find((type) => type === event.eventType);
    if (!emailEvent) {
      return;
    }
    const tracking =
      emailEvent === 'order.shipped' ? await this.latestTracking(order.id) : undefined;
    for (const message of this.messages(order, emailEvent, tracking)) {
      await this.deliver(event, order, message);
    }
  }

  private latestTracking(orderId: string): Promise<ShipmentTracking | null> {
    return this.prisma.shipment.findFirst({
      where: { orderId, status: { not: ShipmentStatus.CANCELLED } },
      orderBy: { createdAt: 'desc' },
      select: { provider: true, carrier: true, trackingNumber: true },
    });
  }

  private async deliver(
    event: OutboxEvent,
    order: Order,
    message: NotificationMessage,
  ): Promise<void> {
    const notification = await this.prisma.notification.upsert({
      where: {
        outboxEventId_channel_recipient: {
          outboxEventId: event.id,
          channel: message.channel,
          recipient: message.recipient,
        },
      },
      create: {
        orderId: order.id,
        outboxEventId: event.id,
        channel: message.channel,
        recipient: message.recipient,
        template: event.eventType,
      },
      update: {},
    });
    if (notification.status === NotificationStatus.SENT) {
      return;
    }
    try {
      const providerRef = await this.sender.send({
        ...message,
        idempotencyKey: `notification-${notification.id}`,
      });
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          attempts: { increment: 1 },
          providerRef,
          sentAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
        },
      });
      throw error;
    }
  }

  private messages(
    order: Order,
    event: OrderEmailEvent,
    tracking?: ShipmentTracking | null,
  ): NotificationMessage[] {
    const contact = this.contact(order.addressSnapshot);
    const email = renderOrderEmail(order, event, contact.recipientName, tracking);
    const candidates: Array<[NotificationChannel, string | undefined]> = [
      [NotificationChannel.EMAIL, contact.email],
      [NotificationChannel.SMS, contact.phone],
      [NotificationChannel.WHATSAPP, contact.phone],
    ];
    return candidates
      .filter(
        (item): item is [NotificationChannel, string] =>
          Boolean(item[1]) && this.sender.supports(item[0]),
      )
      .map(([channel, recipient]) => ({
        channel,
        recipient,
        subject: email.subject,
        text: email.text,
        ...(channel === NotificationChannel.EMAIL ? { html: email.html } : {}),
      }));
  }

  private contact(value: Prisma.JsonValue): AddressContact {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const object = value as Record<string, Prisma.JsonValue>;
    return {
      email: typeof object.email === 'string' ? object.email : undefined,
      phone: typeof object.phone === 'string' ? object.phone : undefined,
      recipientName: typeof object.recipientName === 'string' ? object.recipientName : undefined,
    };
  }

  private retryDelay(attempt: number): number {
    return Math.min(2 ** attempt * 1000, 15 * 60 * 1000);
  }

  private leaseCutoff(): Date {
    return new Date(Date.now() - PROCESSING_LEASE_MS);
  }
}
