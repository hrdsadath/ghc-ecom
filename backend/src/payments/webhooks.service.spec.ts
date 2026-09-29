import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PaymentQueueService } from './payment-queue.service';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  const rawBody = Buffer.from(
    JSON.stringify({
      id: 'evt_V2_1',
      event_name: 'ORDER_SUCCEEDED',
      content: { order: { order_id: 'GHCMF0ABCDE12345678' } },
    }),
  );
  let prisma: {
    webhookEvent: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };
  let queue: { enqueueWebhook: jest.Mock };
  let service: WebhooksService;

  beforeEach(() => {
    prisma = {
      webhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'event-local-1' }),
      },
    };
    queue = { enqueueWebhook: jest.fn().mockResolvedValue(undefined) };
    service = new WebhooksService(
      prisma as unknown as PrismaService,
      queue as unknown as PaymentQueueService,
    );
  });

  it('persists and enqueues an event under its SmartGateway id', async () => {
    await service.ingest(rawBody);

    expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerEventId: 'evt_V2_1',
        eventType: 'ORDER_SUCCEEDED',
      }),
    });
    expect(queue.enqueueWebhook).toHaveBeenCalledWith('event-local-1');
  });

  it('deduplicates events without an id by body hash', async () => {
    await service.ingest(Buffer.from('{"event_name":"ORDER_FAILED"}'));

    expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerEventId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      }),
    });
  });

  it('accepts a duplicate processed delivery without creating or enqueuing it again', async () => {
    prisma.webhookEvent.findUnique.mockResolvedValue({ id: 'event-local-1', status: 'PROCESSED' });

    await service.ingest(rawBody);

    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(queue.enqueueWebhook).not.toHaveBeenCalled();
  });

  it('re-enqueues a duplicate delivery of a failed event', async () => {
    prisma.webhookEvent.findUnique.mockResolvedValue({ id: 'event-local-1', status: 'FAILED' });

    await service.ingest(rawBody);

    expect(queue.enqueueWebhook).toHaveBeenCalledWith('event-local-1');
  });

  it('rejects a body that is not a JSON object', async () => {
    await expect(service.ingest(Buffer.from('[1]'))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
  });
});
