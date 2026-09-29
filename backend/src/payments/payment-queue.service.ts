import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { HdfcPaymentsService } from './hdfc/hdfc-payments.service';
import { PrismaService } from '../database/prisma.service';
import { WebhookProcessorService } from './webhook-processor.service';

type PaymentJob = { kind: 'webhook'; eventId: string } | { kind: 'reconcile' };

@Injectable()
export class PaymentQueueService implements OnModuleInit, OnModuleDestroy {
  private connection?: Redis;
  private queue?: Queue<PaymentJob>;
  private worker?: Worker<PaymentJob>;

  constructor(
    private readonly config: ConfigService,
    private readonly webhookProcessor: WebhookProcessorService,
    private readonly prisma: PrismaService,
    private readonly hdfcPayments: HdfcPaymentsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    this.connection = new Redis(this.config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<PaymentJob>('payments', { connection: this.connection });
    this.worker = new Worker<PaymentJob>('payments', (job) => this.process(job), {
      connection: this.connection,
      concurrency: 5,
    });
    // Fallback for lost webhooks and customers who never return from the payment
    // page. It only inspects PAYMENT_PENDING orders, so a short interval is cheap.
    await this.queue.upsertJobScheduler(
      'payment-reconciliation',
      { every: 60 * 1000 },
      { name: 'reconcile', data: { kind: 'reconcile' } },
    );
  }

  async enqueueWebhook(eventId: string): Promise<void> {
    if (!this.queue) {
      await this.webhookProcessor.process(eventId);
      return;
    }
    await this.queue.add(
      'webhook',
      { kind: 'webhook', eventId },
      {
        jobId: `webhook-${eventId}`,
        attempts: 8,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  private async process(job: Job<PaymentJob>): Promise<void> {
    if (job.data.kind === 'webhook') {
      await this.webhookProcessor.process(job.data.eventId);
      return;
    }
    await this.webhookProcessor.processPending();
    await this.prisma.$executeRaw`select public.release_expired_inventory_reservations()`;
    await this.hdfcPayments.reconcilePending();
  }
}
