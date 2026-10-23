import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Coupon, DiscountType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { auditChangeMetadata } from '../audit/audit-change';
import { PrismaService } from '../database/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

export type CouponWithStats = Coupon & { redemptionCount: number };

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<CouponWithStats[]> {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    });
    return coupons.map(({ _count, ...coupon }) => ({
      ...coupon,
      redemptionCount: _count.redemptions,
    }));
  }

  async create(actorId: string, input: CreateCouponDto): Promise<Coupon> {
    this.validate(input);
    const code = input.code.trim().toUpperCase();
    const coupon = await this.saveCoupon(code, () =>
      this.prisma.coupon.create({
        data: {
          ...input,
          code,
          minimumSubtotalPaise: input.minimumSubtotalPaise ?? undefined,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
        },
      }),
    );
    await this.auditCoupon(actorId, 'promotion.coupon.created', {}, coupon);
    return coupon;
  }

  async update(actorId: string, couponId: string, input: UpdateCouponDto): Promise<Coupon> {
    const existing = await this.prisma.coupon.findUniqueOrThrow({
      where: { id: couponId },
    });
    this.validate({
      type: input.type ?? existing.type,
      value: input.value ?? existing.value,
      startsAt: input.startsAt ?? existing.startsAt.toISOString(),
      endsAt: input.endsAt ?? existing.endsAt.toISOString(),
    });
    const code = input.code?.trim().toUpperCase();
    const coupon = await this.saveCoupon(code ?? existing.code, () =>
      this.prisma.coupon.update({
        where: { id: couponId },
        data: {
          ...input,
          code,
          minimumSubtotalPaise: input.minimumSubtotalPaise ?? undefined,
          startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
          endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        },
      }),
    );
    await this.auditCoupon(actorId, 'promotion.coupon.updated', existing, coupon);
    return coupon;
  }

  private async saveCoupon(code: string, save: () => Promise<Coupon>): Promise<Coupon> {
    try {
      return await save();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Coupon code ${code} already exists`);
      }
      throw error;
    }
  }

  private validate(input: {
    type: DiscountType;
    value: number;
    startsAt: string;
    endsAt: string;
  }): void {
    if (input.type === DiscountType.PERCENT && input.value > 10_000) {
      throw new BadRequestException('A percentage coupon cannot take more than 100% off');
    }
    if (new Date(input.endsAt) <= new Date(input.startsAt)) {
      throw new BadRequestException('Coupon end date must be after its start date');
    }
  }

  private async auditCoupon(
    actorId: string,
    action: string,
    before: object,
    coupon: Coupon,
  ): Promise<void> {
    await this.audit.record({
      actorId,
      action,
      entityType: 'coupon',
      entityId: coupon.id,
      metadata: auditChangeMetadata(coupon.code, before, coupon, [
        'code',
        'type',
        'value',
        'minimumSubtotalPaise',
        'maximumDiscountPaise',
        'usageLimit',
        'perUserLimit',
        'startsAt',
        'endsAt',
        'isActive',
      ]),
    });
  }
}
