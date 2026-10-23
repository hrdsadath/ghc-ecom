import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { OperationsService } from './operations.service';

describe('OperationsService', () => {
  let prisma: {
    $queryRaw: jest.Mock;
    webhookEvent: { count: jest.Mock };
    outboxEvent: { count: jest.Mock };
    order: { count: jest.Mock };
    refund: { count: jest.Mock };
  };
  let config: { get: jest.Mock };
  let service: OperationsService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          failedWebhooks: 1n,
          terminalJobFailures: 3n,
          expiredPendingPayments: 4n,
          paymentMismatches: 6n,
          failedRefunds: 5n,
          lowStockSkus: 2n,
        },
      ]),
      webhookEvent: { count: jest.fn().mockResolvedValue(1) },
      outboxEvent: { count: jest.fn().mockResolvedValue(3) },
      order: { count: jest.fn().mockResolvedValue(4) },
      refund: { count: jest.fn().mockResolvedValue(5) },
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'ALERT_WEBHOOK_URL') return 'https://alerts.example/hook';
        if (key === 'ALERT_WEBHOOK_TOKEN') return 'alert-token';
        return undefined;
      }),
    };
    service = new OperationsService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('reports payment, job, webhook, refund, inventory, and database health', async () => {
    await expect(service.snapshot()).resolves.toMatchObject({
      databaseHealthy: true,
      failedWebhooks: 1,
      terminalJobFailures: 3,
      expiredPendingPayments: 4,
      paymentMismatches: 6,
      failedRefunds: 5,
      lowStockSkus: 2,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('serves one database query to every caller within 30 seconds', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await Promise.all([service.snapshot(), service.snapshot(), service.snapshot()]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 29_000);
    await service.snapshot();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 31_000);
    await service.snapshot();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);

    // The monitor always takes a fresh reading.
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 202 }));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await service.checkAndAlert();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('counts low stock only for active variants in active warehouses', async () => {
    await service.snapshot();
    const sql = (prisma.$queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toMatch(/warehouse\.is_active/);
    expect(sql).toMatch(/variant\.is_active/);
  });

  it('sends an alert when a terminal job failure is observable', async () => {
    const request = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 202 }));

    await service.checkAndAlert();

    expect(request).toHaveBeenCalledWith(
      'https://alerts.example/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer alert-token',
        }),
      }),
    );
  });

  it('still returns an alertable snapshot when the database is unavailable', async () => {
    prisma.$queryRaw.mockReset().mockRejectedValue(new Error('database unavailable'));
    prisma.webhookEvent.count.mockRejectedValue(new Error('database unavailable'));
    prisma.outboxEvent.count.mockRejectedValue(new Error('database unavailable'));
    prisma.order.count.mockRejectedValue(new Error('database unavailable'));
    prisma.refund.count.mockRejectedValue(new Error('database unavailable'));

    await expect(service.snapshot()).resolves.toMatchObject({
      databaseHealthy: false,
      failedWebhooks: -1,
      terminalJobFailures: -1,
      expiredPendingPayments: -1,
      paymentMismatches: -1,
      failedRefunds: -1,
      lowStockSkus: -1,
    });
  });
});
