import { BadRequestException, ConflictException } from '@nestjs/common';
import { DiscountType, Prisma } from '@prisma/client';
import { PromotionsService } from './promotions.service';

const coupon = {
  id: 'coupon-id',
  code: 'WELCOME10',
  type: DiscountType.PERCENT,
  value: 1_000,
  minimumSubtotalPaise: 0,
  maximumDiscountPaise: null,
  usageLimit: null,
  perUserLimit: null,
  startsAt: new Date('2026-10-01T00:00:00+05:30'),
  endsAt: new Date('2026-10-31T23:59:59.999+05:30'),
  isActive: true,
};

interface Harness {
  service: PromotionsService;
  prisma: { coupon: Record<string, jest.Mock> };
  audit: { record: jest.Mock };
}

const setup = (overrides: Record<string, jest.Mock> = {}): Harness => {
  const prisma = {
    coupon: {
      findMany: jest.fn(),
      create: jest.fn().mockResolvedValue(coupon),
      update: jest.fn().mockResolvedValue(coupon),
      findUniqueOrThrow: jest.fn().mockResolvedValue(coupon),
      ...overrides,
    },
  };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  return { service: new PromotionsService(prisma as never, audit as never), prisma, audit };
};

describe('PromotionsService', () => {
  it('lists coupons with their redemption count', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findMany.mockResolvedValue([{ ...coupon, _count: { redemptions: 4 } }]);

    await expect(service.list()).resolves.toEqual([{ ...coupon, redemptionCount: 4 }]);
    expect(prisma.coupon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { _count: { select: { redemptions: true } } } }),
    );
  });

  it('reports a duplicate coupon code as a conflict', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['code'] },
    });
    const { service } = setup({ create: jest.fn().mockRejectedValue(duplicate) });

    await expect(
      service.create('actor-id', {
        code: 'WELCOME10',
        type: DiscountType.FIXED,
        value: 10_000,
        startsAt: '2026-10-01T00:00:00+05:30',
        endsAt: '2026-10-02T00:00:00+05:30',
      }),
    ).rejects.toThrow(new ConflictException('Coupon code WELCOME10 already exists'));
  });

  it('validates the merged coupon when only some fields change', async () => {
    const { service, prisma } = setup();

    await expect(service.update('actor-id', coupon.id, { value: 10_001 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.update('actor-id', coupon.id, { endsAt: '2026-09-01T00:00:00+05:30' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.update('actor-id', coupon.id, { maximumDiscountPaise: null, usageLimit: 50 });
    expect(prisma.coupon.update).toHaveBeenCalledWith({
      where: { id: coupon.id },
      data: expect.objectContaining({ maximumDiscountPaise: null, usageLimit: 50 }),
    });
  });
});
