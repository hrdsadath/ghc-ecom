import { WebhookStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { HdfcPaymentsService } from './hdfc/hdfc-payments.service';
import { WebhookProcessorService } from './webhook-processor.service';

describe('WebhookProcessorService', () => {
  const payload = {
    id: 'evt_V2_1',
    event_name: 'ORDER_SUCCEEDED',
    content: { order: { order_id: 'GHCMF0ABCDE12345678' } },
  };
  let claimCount = 1;
  let prisma: {
    webhookEvent: {
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let payments: { handleWebhook: jest.Mock };
  let processor: WebhookProcessorService;

  beforeEach(() => {
    claimCount = 1;
    prisma = {
      webhookEvent: {
        updateMany: jest.fn(() => Promise.resolve({ count: claimCount })),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'event-local-1', payload }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    payments = { handleWebhook: jest.fn().mockResolvedValue(undefined) };
    processor = new WebhookProcessorService(
      prisma as unknown as PrismaService,
      payments as unknown as HdfcPaymentsService,
    );
  });

  it('settles the order through the HDFC payments service and marks the event processed', async () => {
    await processor.process('event-local-1');

    expect(payments.handleWebhook).toHaveBeenCalledWith(payload);
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-local-1' },
      data: expect.objectContaining({ status: WebhookStatus.PROCESSED }),
    });
  });

  it('skips an event another worker already claimed', async () => {
    claimCount = 0;

    await processor.process('event-local-1');

    expect(payments.handleWebhook).not.toHaveBeenCalled();
  });

  it('records the failure and rethrows so the queue retries', async () => {
    payments.handleWebhook.mockRejectedValue(new Error('HDFC request failed: timeout'));

    await expect(processor.process('event-local-1')).rejects.toThrow('timeout');
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-local-1' },
      data: expect.objectContaining({
        status: WebhookStatus.FAILED,
        lastError: 'HDFC request failed: timeout',
      }),
    });
  });

  it('drains pending events', async () => {
    prisma.webhookEvent.findMany.mockResolvedValue([{ id: 'event-local-1' }]);

    await expect(processor.processPending()).resolves.toBe(1);
    expect(payments.handleWebhook).toHaveBeenCalledTimes(1);
  });
});
