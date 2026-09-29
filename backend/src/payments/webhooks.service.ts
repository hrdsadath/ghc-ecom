import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PaymentQueueService } from './payment-queue.service';

/**
 * Stores authenticated SmartGateway webhooks once and hands them to the payment
 * queue, so a slow Order Status check never makes SmartGateway wait or retry.
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PaymentQueueService,
  ) {}

  async ingest(rawBody: Buffer): Promise<void> {
    const payload = this.parse(rawBody);
    const eventType = typeof payload.event_name === 'string' ? payload.event_name : 'UNKNOWN';
    // SmartGateway event ids (`evt_…`) deduplicate redeliveries; fall back to the body hash.
    const providerEventId =
      typeof payload.id === 'string' && payload.id
        ? payload.id
        : `sha256:${createHash('sha256').update(rawBody).digest('hex')}`;

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { providerEventId },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === 'RECEIVED' || existing.status === 'FAILED') {
        await this.queue.enqueueWebhook(existing.id);
      }
      return;
    }
    try {
      const event = await this.prisma.webhookEvent.create({
        data: {
          providerEventId,
          eventType,
          payload: payload as Prisma.InputJsonObject,
        },
      });
      await this.queue.enqueueWebhook(event.id);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const racedEvent = await this.prisma.webhookEvent.findUnique({
          where: { providerEventId },
          select: { id: true, status: true },
        });
        if (racedEvent && (racedEvent.status === 'RECEIVED' || racedEvent.status === 'FAILED')) {
          await this.queue.enqueueWebhook(racedEvent.id);
        }
        return;
      }
      throw error;
    }
  }

  private parse(rawBody: Buffer): Record<string, unknown> {
    try {
      const value = JSON.parse(rawBody.toString('utf8')) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('not an object');
      }
      return value as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid HDFC webhook payload');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
