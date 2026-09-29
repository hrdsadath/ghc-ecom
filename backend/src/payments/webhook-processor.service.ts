import { Injectable } from '@nestjs/common';
import { WebhookStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { HdfcPaymentsService } from './hdfc/hdfc-payments.service';

const MAX_WEBHOOK_ATTEMPTS = 8;
const PROCESSING_LEASE_MS = 5 * 60 * 1000;

@Injectable()
export class WebhookProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: HdfcPaymentsService,
  ) {}

  async process(eventId: string): Promise<void> {
    const claimed = await this.prisma.webhookEvent.updateMany({
      where: {
        id: eventId,
        attempts: { lt: MAX_WEBHOOK_ATTEMPTS },
        OR: [
          { status: { in: [WebhookStatus.RECEIVED, WebhookStatus.FAILED] } },
          {
            status: WebhookStatus.PROCESSING,
            processingStartedAt: { lte: this.leaseCutoff() },
          },
        ],
      },
      data: {
        status: WebhookStatus.PROCESSING,
        attempts: { increment: 1 },
        processingStartedAt: new Date(),
        lastError: null,
      },
    });
    if (claimed.count === 0) {
      return;
    }

    try {
      const event = await this.prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });
      // The payload only identifies the order; the outcome is re-read from the
      // Order Status API. Refund state is reconciled by RefundsService.
      await this.payments.handleWebhook(event.payload as Record<string, unknown>);
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: WebhookStatus.PROCESSED,
          processedAt: new Date(),
          processingStartedAt: null,
          lastError: null,
        },
      });
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: WebhookStatus.FAILED,
          processingStartedAt: null,
          lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
        },
      });
      throw error;
    }
  }

  async processPending(limit = 25): Promise<number> {
    const events = await this.prisma.webhookEvent.findMany({
      where: {
        attempts: { lt: MAX_WEBHOOK_ATTEMPTS },
        OR: [
          { status: { in: [WebhookStatus.RECEIVED, WebhookStatus.FAILED] } },
          {
            status: WebhookStatus.PROCESSING,
            processingStartedAt: { lte: this.leaseCutoff() },
          },
        ],
      },
      select: { id: true },
      orderBy: { receivedAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    let processed = 0;
    for (const event of events) {
      await this.process(event.id);
      processed += 1;
    }
    return processed;
  }

  private leaseCutoff(): Date {
    return new Date(Date.now() - PROCESSING_LEASE_MS);
  }
}
