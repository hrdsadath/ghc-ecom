import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { apiServerErrorTotal, operationsGauges, operationsRegistry } from './metrics';

export interface OperationsSnapshot {
  databaseHealthy: boolean;
  apiServerErrorsTotal: number;
  failedWebhooks: number;
  terminalJobFailures: number;
  expiredPendingPayments: number;
  paymentMismatches: number;
  failedRefunds: number;
  lowStockSkus: number;
  checkedAt: string;
}

/** The admin shell, overview and health pages all read the snapshot; one query serves them for this long. */
export const SNAPSHOT_MAX_AGE_MS = 30_000;

interface OperationsCountRow {
  failedWebhooks: bigint;
  terminalJobFailures: bigint;
  expiredPendingPayments: bigint;
  paymentMismatches: bigint;
  failedRefunds: bigint;
  lowStockSkus: bigint;
}

@Injectable()
export class OperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationsService.name);
  private readonly alertUrl?: string;
  private readonly alertToken?: string;
  private readonly timeoutMs: number;
  private monitor?: NodeJS.Timeout;
  private lastObservedServerErrors = 0;
  private cached?: { snapshot: OperationsSnapshot; takenAt: number };
  private inFlight?: Promise<OperationsSnapshot>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.alertUrl = config.get<string>('ALERT_WEBHOOK_URL');
    this.alertToken = config.get<string>('ALERT_WEBHOOK_TOKEN');
    this.timeoutMs = config.get<number>('OUTBOUND_TIMEOUT_MS') ?? 10_000;
  }

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.monitor = setInterval(() => void this.checkAndAlert(), 60_000);
    this.monitor.unref();
  }

  onModuleDestroy(): void {
    if (this.monitor) clearInterval(this.monitor);
  }

  /**
   * Returns a snapshot no older than maxAgeMs, sharing one database query between concurrent
   * callers. The 60 s monitor always takes a fresh one, which also refreshes the cache.
   */
  async snapshot(maxAgeMs = SNAPSHOT_MAX_AGE_MS): Promise<OperationsSnapshot> {
    if (this.cached && Date.now() - this.cached.takenAt < maxAgeMs) return this.cached.snapshot;
    if (this.inFlight) return this.inFlight;
    const task = this.takeSnapshot();
    this.inFlight = task;
    try {
      const snapshot = await task;
      this.cached = { snapshot, takenAt: Date.now() };
      return snapshot;
    } finally {
      if (this.inFlight === task) this.inFlight = undefined;
    }
  }

  private async takeSnapshot(): Promise<OperationsSnapshot> {
    let counts: OperationsCountRow | undefined;
    try {
      [counts] = await this.prisma.$queryRaw<OperationsCountRow[]>`
        select
          (select count(*) from public.webhook_events where status = 'failed')::bigint
            as "failedWebhooks",
          (select count(*) from public.outbox_events where status = 'failed' and attempts >= 5)::bigint
            as "terminalJobFailures",
          (select count(*) from public.orders where status = 'payment_pending' and payment_expires_at < now())::bigint
            as "expiredPendingPayments",
          (
            select count(*)
            from (
              select target_order.id
              from public.orders as target_order
              where target_order.status in ('confirmed', 'processing', 'shipped', 'delivered')
                and not exists (
                  select 1 from public.payments as payment
                  where payment.order_id = target_order.id
                    and payment.status in ('captured', 'refunded')
                )
              union all
              select payment.id
              from public.payments as payment
              join public.orders as target_order on target_order.id = payment.order_id
              where payment.status in ('captured', 'refunded')
                and target_order.status in ('payment_pending', 'payment_failed')
            ) as mismatches
          )::bigint as "paymentMismatches",
          (select count(*) from public.refunds where status = 'failed')::bigint
            as "failedRefunds",
          (
            select count(*)
            from public.inventory_levels as level
            join public.warehouses as warehouse on warehouse.id = level.warehouse_id
            join public.product_variants as variant on variant.id = level.variant_id
            where warehouse.is_active
              and variant.is_active
              and level.on_hand - level.reserved <= level.low_stock_threshold
          )::bigint as "lowStockSkus"
      `;
    } catch {
      counts = undefined;
    }
    const value = (field: keyof OperationsCountRow): number =>
      counts ? Number(counts[field]) : -1;
    const snapshot: OperationsSnapshot = {
      databaseHealthy: Boolean(counts),
      apiServerErrorsTotal: await apiServerErrorTotal(),
      failedWebhooks: value('failedWebhooks'),
      terminalJobFailures: value('terminalJobFailures'),
      expiredPendingPayments: value('expiredPendingPayments'),
      paymentMismatches: value('paymentMismatches'),
      failedRefunds: value('failedRefunds'),
      lowStockSkus: value('lowStockSkus'),
      checkedAt: new Date().toISOString(),
    };
    this.setGauges(snapshot);
    return snapshot;
  }

  async metrics(): Promise<string> {
    await this.snapshot();
    return operationsRegistry.metrics();
  }

  async checkAndAlert(): Promise<void> {
    const snapshot = await this.snapshot(0);
    const unhealthy =
      !snapshot.databaseHealthy ||
      [
        snapshot.failedWebhooks,
        snapshot.terminalJobFailures,
        snapshot.expiredPendingPayments,
        snapshot.paymentMismatches,
        snapshot.failedRefunds,
        snapshot.lowStockSkus,
      ].some((value) => value < 0) ||
      snapshot.apiServerErrorsTotal > this.lastObservedServerErrors ||
      snapshot.failedWebhooks > 0 ||
      snapshot.terminalJobFailures > 0 ||
      snapshot.expiredPendingPayments > 0 ||
      snapshot.paymentMismatches > 0 ||
      snapshot.failedRefunds > 0;
    this.lastObservedServerErrors = snapshot.apiServerErrorsTotal;
    if (!unhealthy) return;
    this.logger.error(`Operational alert: ${JSON.stringify(snapshot)}`);
    if (!this.alertUrl) return;
    try {
      const response = await fetch(this.alertUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          'content-type': 'application/json',
          ...(this.alertToken ? { authorization: `Bearer ${this.alertToken}` } : {}),
        },
        body: JSON.stringify({ source: 'ghc-ecom-backend', ...snapshot }),
      });
      if (!response.ok) {
        this.logger.error(`Alert delivery failed with status ${response.status}`);
      }
    } catch (error) {
      this.logger.error(`Alert delivery failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private setGauges(snapshot: OperationsSnapshot): void {
    operationsGauges.databaseHealthy.set(snapshot.databaseHealthy ? 1 : 0);
    operationsGauges.failedWebhooks.set(snapshot.failedWebhooks);
    operationsGauges.terminalJobFailures.set(snapshot.terminalJobFailures);
    operationsGauges.expiredPendingPayments.set(snapshot.expiredPendingPayments);
    operationsGauges.paymentMismatches.set(snapshot.paymentMismatches);
    operationsGauges.failedRefunds.set(snapshot.failedRefunds);
    operationsGauges.lowStockSkus.set(snapshot.lowStockSkus);
  }
}
