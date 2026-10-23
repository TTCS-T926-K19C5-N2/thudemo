import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { CouponType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service.js";
import { TicketsService } from "../tickets/tickets.service.js";
import { CouponsService } from "./coupons.service.js";

const eventId = "11111111-1111-4111-8111-111111111111";
const couponId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";
const otherUserId = "44444444-4444-4444-8444-444444444444";
const initialCoupon = {
  id: couponId,
  eventId,
  code: "SAVE10",
  type: CouponType.PERCENT,
  value: 10,
  maxUses: 10,
  startsAt: new Date("2026-10-22T00:00:00.000Z"),
  expiresAt: new Date("2026-11-22T00:00:00.000Z"),
  isActive: true,
};

describe("CouponsService owner management", () => {
  let service: CouponsService;
  let db: Record<string, any>;
  let tx: Record<string, any>;

  beforeEach(() => {
    tx = {
      event: { findUnique: vi.fn().mockResolvedValue({ id: eventId, organizerId: ownerId }) },
      coupon: {
        findFirst: vi.fn().mockResolvedValue(initialCoupon),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...initialCoupon, ...data })),
      },
      couponRedemption: { count: vi.fn().mockResolvedValue(0) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    db = {
      event: tx.event,
      coupon: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: couponId })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(async (work: (client: Record<string, any>) => unknown) => work(tx)),
    };
    service = new CouponsService(db as unknown as PrismaService, {} as TicketsService);
  });

  it("updates coupon settings for the event owner and normalizes code", async () => {
    const result = await service.updateForOwner(eventId, couponId, ownerId, {
      code: "  save20 ",
      value: 20,
      maxUses: 12,
    });

    expect(result).toMatchObject({ code: "SAVE20", value: 20, maxUses: 12, type: CouponType.PERCENT });
    expect(tx.coupon.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: couponId },
      data: expect.objectContaining({ code: "SAVE20", value: 20, maxUses: 12 }),
    }));
  });

  it("rejects reducing quota below active or redeemed uses", async () => {
    tx.couponRedemption.count.mockResolvedValue(3);
    await expect(service.updateForOwner(eventId, couponId, ownerId, { maxUses: 2 }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.coupon.update).not.toHaveBeenCalled();
  });

  it("rejects invalid date ranges and percent above the approved limit", async () => {
    await expect(service.updateForOwner(eventId, couponId, ownerId, {
      startsAt: "2026-12-01T00:00:00.000Z",
      expiresAt: "2026-11-01T00:00:00.000Z",
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createForOwner(eventId, ownerId, {
      code: "TOO100", type: CouponType.PERCENT, value: 101, maxUses: 1,
      startsAt: new Date("2026-10-23T00:00:00.000Z"), expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enforces owner scope before creating or updating a coupon", async () => {
    await expect(service.createForOwner(eventId, otherUserId, {
      code: "SAVE20", type: CouponType.FIXED, value: 100, maxUses: 1,
      startsAt: new Date("2026-10-23T00:00:00.000Z"), expiresAt: new Date("2026-11-01T00:00:00.000Z"),
    })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateForOwner(eventId, couponId, otherUserId, { value: 20 }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(db.coupon.create).not.toHaveBeenCalled();
    expect(tx.coupon.update).not.toHaveBeenCalled();
  });

  it("deactivates only the requested coupon within its event", async () => {
    const result = await service.deactivateForOwner(eventId, couponId, ownerId);
    expect(result).toEqual({ id: couponId, isActive: false });
    expect(db.coupon.updateMany).toHaveBeenCalledWith({
      where: { id: couponId, eventId },
      data: { isActive: false },
    });
  });
});
