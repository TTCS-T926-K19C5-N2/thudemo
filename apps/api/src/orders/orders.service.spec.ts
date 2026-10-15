import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service.js';
import { isOrderExpired } from './order-expiration.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrderHistoryService } from './order-history.service.js';

describe('OrdersService & isOrderExpired', () => {
  describe('isOrderExpired helper (AC 3 & shared logic)', () => {
    it('returns false for PENDING order before expiresAt', () => {
      const expiresAt = new Date(Date.now() + 60000);
      expect(isOrderExpired({ status: OrderStatus.PENDING, expiresAt })).toBe(
        false,
      );
    });

    it('returns true for PENDING order after expiresAt', () => {
      const expiresAt = new Date(Date.now() - 1000);
      expect(isOrderExpired({ status: OrderStatus.PENDING, expiresAt })).toBe(
        true,
      );
    });

    it('returns true for EXPIRED order regardless of expiresAt', () => {
      const future = new Date(Date.now() + 60000);
      expect(
        isOrderExpired({ status: OrderStatus.EXPIRED, expiresAt: future }),
      ).toBe(true);
    });

    it('returns false for PAID order even after original expiresAt', () => {
      const past = new Date(Date.now() - 60000);
      expect(
        isOrderExpired({ status: OrderStatus.PAID, expiresAt: past }),
      ).toBe(false);
    });
  });

  describe('unified S-16/S-17 entry points', () => {
    const showtimeId = '22222222-2222-4222-8222-222222222222';
    const seatId = '44444444-4444-4444-8444-444444444441';
    let service: OrdersService;
    let current: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      current = vi.fn();
      service = new OrdersService(
        {} as PrismaService,
        { current } as unknown as OrderHistoryService,
      );
    });
    it.each([
      null,
      [],
      {},
      { showtimeId: 'bad' },
      { showtimeId, seatIds: ['bad'] },
    ])(
      'rejects malformed creation input %j before creating an order',
      async (body) => {
        const create = vi.spyOn(service, 'createFromHold');
        await expect(
          service.createOrder('buyer', 'session', body),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(create).not.toHaveBeenCalled();
        expect(current).not.toHaveBeenCalled();
      },
    );
    it('uses the locked creator for both routes and ignores forged ownership/prices', async () => {
      const create = vi.spyOn(service, 'createFromHold').mockResolvedValue({
        created: true,
        serverTime: new Date(),
        order: { id: 'order' },
      } as never);
      current.mockResolvedValue({
        id: 'order',
        totalAmount: 250000,
        created: false,
      });
      const result = await service.createOrder('buyer', 'session', {
        showtimeId,
        seatIds: [seatId, seatId],
        totalAmount: 1,
        userId: 'other',
      });
      expect(create).toHaveBeenCalledWith(showtimeId, 'buyer', 'session', [
        seatId,
      ]);
      expect(current).toHaveBeenCalledWith('order', 'buyer');
      expect(result).toMatchObject({ totalAmount: 250000, created: true });
    });
    it('keeps a retry marked as reused and does not call another creation path', async () => {
      const create = vi.spyOn(service, 'createFromHold').mockResolvedValue({
        created: false,
        serverTime: new Date(),
        order: { id: 'existing' },
      } as never);
      current.mockResolvedValue({ id: 'existing', created: false });
      expect(
        await service.createOrder('buyer', 'session', { showtimeId }),
      ).toMatchObject({ id: 'existing', created: false });
      expect(create).toHaveBeenCalledTimes(1);
    });
    it('both detail service aliases use the same authorized reader', async () => {
      current.mockResolvedValue({ id: 'order' });
      await service.getOrderById('order', 'buyer');
      await service.current('order', 'buyer');
      expect(current.mock.calls).toEqual([
        ['order', 'buyer'],
        ['order', 'buyer'],
      ]);
    });
  });
});
