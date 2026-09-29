import { Counter, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

export const operationsRegistry = new Registry();

collectDefaultMetrics({ register: operationsRegistry, prefix: 'ghc_' });

export const apiServerErrors = new Counter({
  name: 'ghc_api_server_errors_total',
  help: 'HTTP responses with a 5xx status',
  labelNames: ['method', 'status_code'],
  registers: [operationsRegistry],
});

function gauge(name: string, help: string): Gauge {
  return new Gauge({
    name: `ghc_${name}`,
    help,
    registers: [operationsRegistry],
  });
}

export const operationsGauges = {
  failedWebhooks: gauge('failed_webhooks', 'Failed HDFC SmartGateway webhook events'),
  terminalJobFailures: gauge('terminal_job_failures', 'Terminal outbox job failures'),
  expiredPendingPayments: gauge('expired_pending_payments', 'Expired pending payment orders'),
  paymentMismatches: gauge('payment_mismatches', 'Local payment and order state mismatches'),
  failedRefunds: gauge('failed_refunds', 'Failed refund records'),
  lowStockSkus: gauge('low_stock_skus', 'Inventory levels at or below low-stock threshold'),
  databaseHealthy: gauge('database_healthy', 'Database health where one is healthy'),
};

export async function apiServerErrorTotal(): Promise<number> {
  const metric = await apiServerErrors.get();
  return metric.values.reduce((sum, value) => sum + value.value, 0);
}
