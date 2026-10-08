import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PaymentsService } from './payments.service.js';
import type { PaymentGateway } from './gateways/payment-gateway.interface.js';
import type { AccountantNotifier } from './accountant-notifier.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('PaymentsService Unit Tests', () => {
  let service: PaymentsService;
  let mockPrisma: any;
  let mockGateway: Partial<PaymentGateway>;
  let mockNotifier: Partial<AccountantNotifier>;
  let mockConfig: Partial<ConfigService>;
  let mockOrdersService: any;

  const userId = '11111111-1111-4111-8111-111111111111';
  const orderId = '22222222-2222-4222-8222-222222222222';
  const seatId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    mockPrisma = {
      order: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      seat: {
        updateMany: vi.fn(),
      },
      seatHold: {
        deleteMany: vi.fn(),
      },
      payment: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn((fnOrArray: any) => {
        if (typeof fnOrArray === 'function') {
          return fnOrArray(mockPrisma);
        }
        return Promise.all(fnOrArray);
      }),
    };

    mockGateway = {
      name: 'momo',
      createPayment: vi.fn().mockResolvedValue({
        redirectUrl: 'https://test-payment.momo.vn/pay',
        gatewayRef: `${orderId}_123456`,
      }),
      verifyWebhook: vi.fn().mockResolvedValue(true),
      parseWebhook: vi.fn(),
    };

    mockNotifier = {
      notifyAmountMismatch: vi.fn().mockResolvedValue(undefined),
      notifyLatePayment: vi.fn().mockResolvedValue(undefined),
    };

    mockConfig = {
      get: vi.fn(
        (key: string, defaultValue?: string) => defaultValue ?? null,
      ) as any,
    };

    mockOrdersService = {
      expireOrder: vi
        .fn()
        .mockResolvedValue({ status: 'expired', releasedSeatsCount: 1 }),
    };

    service = new PaymentsService(
      mockPrisma as PrismaService,
      mockGateway as PaymentGateway,
      mockNotifier as AccountantNotifier,
      mockConfig as ConfigService,
      mockOrdersService,
    );
  });

  describe('initiatePayment', () => {
    it('throws NotFoundException if order does not belong to user', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: orderId,
        userId: 'other_user',
        status: OrderStatus.PENDING,
        totalAmount: 100000,
        expiresAt: new Date(Date.now() + 600000),
      });

      await expect(service.initiatePayment(orderId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException if order is expired', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: orderId,
        userId,
        status: OrderStatus.PENDING,
        totalAmount: 100000,
        expiresAt: new Date(Date.now() - 10000), // Expired
        items: [],
      });

      await expect(service.initiatePayment(orderId, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('uses the recorded booking total after live category price changes and creates INITIATED payment', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: orderId,
        userId,
        status: OrderStatus.PENDING,
        totalAmount: 50000, // Server-side total saved by S-16 at booking time
        expiresAt: new Date(Date.now() + 600000),
        items: [
          {
            seatId,
            unitPrice: 50000,
            seat: {
              category: { price: 75000 }, // Live price changed after the booking snapshot
            },
          },
        ],
      });

      mockPrisma.payment.create.mockResolvedValue({
        id: 'pay_123',
        status: PaymentStatus.INITIATED,
      });

      const res = await service.initiatePayment(orderId, userId);

      expect(mockGateway.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          amount: 50000, // Must keep the recorded order amount
        }),
      );
      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId,
          amount: 50000,
          status: PaymentStatus.INITIATED,
        }),
      });
      expect(res.redirectUrl).toBe('https://test-payment.momo.vn/pay');
    });
  });

  describe('handleWebhook', () => {
    it('throws UnauthorizedException and does not parse payload or touch DB when signature is invalid', async () => {
      (mockGateway.verifyWebhook as any).mockResolvedValue(false);

      await expect(service.handleWebhook({}, {}, '127.0.0.1')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockGateway.parseWebhook).not.toHaveBeenCalled();
      expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when webhook orderId is not found', async () => {
      (mockGateway.verifyWebhook as any).mockResolvedValue(true);
      (mockGateway.parseWebhook as any).mockResolvedValue({
        orderId: 'unknown_order',
        amount: 100000,
        status: 'SUCCESS',
      });
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(service.handleWebhook({}, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('marks order NEEDS_REVIEW, payment AMOUNT_MISMATCH and alerts accountant on mismatched amount', async () => {
      (mockGateway.verifyWebhook as any).mockResolvedValue(true);
      (mockGateway.parseWebhook as any).mockResolvedValue({
        orderId,
        gatewayRef: `${orderId}_123`,
        transactionId: 'momo_tx_99',
        amount: 50000, // Gateway amount is 50k
        status: 'SUCCESS',
      });

      mockPrisma.order.findUnique.mockResolvedValue({
        id: orderId,
        status: OrderStatus.PENDING,
        totalAmount: 100000,
        expiresAt: new Date(Date.now() + 600000),
        items: [
          {
            seatId,
            seat: { category: { price: 100000 } }, // System amount is 100k
          },
        ],
      });

      const res = await service.handleWebhook({}, {});

      expect(res.status).toBe('AMOUNT_MISMATCH');
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: { status: OrderStatus.NEEDS_REVIEW },
      });
      expect(mockPrisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId,
          amount: 50000,
          status: PaymentStatus.AMOUNT_MISMATCH,
        }),
      });
      expect(mockNotifier.notifyAmountMismatch).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          expectedAmount: 100000,
          receivedAmount: 50000,
        }),
      );
    });

    it('processes booked amount after live price changes: PAID, SOLD, holds deleted, payment SUCCEEDED', async () => {
      (mockGateway.verifyWebhook as any).mockResolvedValue(true);
      (mockGateway.parseWebhook as any).mockResolvedValue({
        orderId,
        gatewayRef: `${orderId}_123`,
        transactionId: 'momo_tx_99',
        amount: 100000,
        status: 'SUCCESS',
      });

      mockPrisma.order.findUnique.mockResolvedValue({
        id: orderId,
        status: OrderStatus.PENDING,
        totalAmount: 100000,
        expiresAt: new Date(Date.now() + 600000),
        items: [
          {
            seatId,
            unitPrice: 100000,
            seat: { category: { price: 900000 } },
          },
        ],
      });
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay_init',
      });

      const res = await service.handleWebhook({}, {});

      expect(res.status).toBe('PAID');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: orderId,
            status: { in: [OrderStatus.PENDING, OrderStatus.PENDING_PAYMENT] },
          }),
          data: { status: OrderStatus.PAID },
        }),
      );
      expect(mockPrisma.seat.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [seatId] } },
        data: { isSold: true },
      });
      expect(mockPrisma.seatHold.deleteMany).toHaveBeenCalledWith({
        where: { seatId: { in: [seatId] } },
      });
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay_init' },
        data: {
          status: PaymentStatus.SUCCEEDED,
          transactionId: 'momo_tx_99',
        },
      });
    });

    it('handles 5 sequential duplicate webhooks idempotently (only 1 state change, returns 200 for all)', async () => {
      (mockGateway.verifyWebhook as any).mockResolvedValue(true);
      (mockGateway.parseWebhook as any).mockResolvedValue({
        orderId,
        gatewayRef: `${orderId}_123`,
        transactionId: 'momo_tx_99',
        amount: 100000,
        status: 'SUCCESS',
      });

      let currentOrderStatus: OrderStatus = OrderStatus.PENDING;
      mockPrisma.order.findUnique.mockImplementation(async () => ({
        id: orderId,
        status: currentOrderStatus,
        totalAmount: 100000,
        expiresAt: new Date(Date.now() + 600000),
        items: [{ seatId, seat: { category: { price: 100000 } } }],
      }));
      mockPrisma.payment.findFirst.mockImplementation(async () => {
        if (currentOrderStatus === OrderStatus.PAID) {
          return { id: 'pay_init', status: PaymentStatus.SUCCEEDED };
        }
        return { id: 'pay_init', status: PaymentStatus.INITIATED };
      });
      mockPrisma.order.updateMany.mockImplementation(async () => {
        currentOrderStatus = OrderStatus.PAID;
        return { count: 1 };
      });

      // 1st call: order transitions PENDING -> PAID
      const res1 = await service.handleWebhook({}, {});
      expect(res1.status).toBe('PAID');
      expect(mockPrisma.seat.updateMany).toHaveBeenCalledTimes(1);

      // Calls 2 through 5: order is already PAID
      for (let i = 2; i <= 5; i++) {
        const resN = await service.handleWebhook({}, {});
        expect(resN.received).toBe(true);
        expect(resN.status).toBe('PAID');
      }

      // Seat update must NOT have been called again!
      expect(mockPrisma.seat.updateMany).toHaveBeenCalledTimes(1);
    });

    it('handles webhook for expired order: does not mark PAID, does not touch seats, marks LATE and alerts accountant', async () => {
      (mockGateway.verifyWebhook as any).mockResolvedValue(true);
      (mockGateway.parseWebhook as any).mockResolvedValue({
        orderId,
        gatewayRef: `${orderId}_123`,
        transactionId: 'momo_tx_late',
        amount: 100000,
        status: 'SUCCESS',
      });

      mockPrisma.order.findUnique.mockResolvedValue({
        id: orderId,
        status: OrderStatus.PENDING,
        totalAmount: 100000,
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
        items: [{ seatId, seat: { category: { price: 100000 } } }],
      });
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay_init',
      });

      const res = await service.handleWebhook({}, {});

      expect(res.status).toBe('LATE');
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: { status: OrderStatus.NEEDS_REVIEW },
      });
      expect(mockPrisma.seat.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay_init' },
        data: {
          status: PaymentStatus.LATE,
          transactionId: 'momo_tx_late',
        },
      });
      expect(mockNotifier.notifyLatePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          amount: 100000,
          transactionId: 'momo_tx_late',
        }),
      );
    });

    it('catches unique constraint error (P2002) and returns idempotent success instead of 500', async () => {
      (mockGateway.verifyWebhook as any).mockResolvedValue(true);
      (mockGateway.parseWebhook as any).mockResolvedValue({
        orderId,
        gatewayRef: `${orderId}_123`,
        transactionId: 'momo_tx_99',
        amount: 100000,
        status: 'SUCCESS',
      });

      mockPrisma.order.findUnique.mockResolvedValue({
        id: orderId,
        status: OrderStatus.PENDING,
        totalAmount: 100000,
        expiresAt: new Date(Date.now() + 600000),
        items: [{ seatId, seat: { category: { price: 100000 } } }],
      });

      // Simulate concurrent transaction throwing P2002 Unique constraint failed
      const p2002Error: any = new Error(
        'Unique constraint failed on the fields: (`gatewayRef`)',
      );
      p2002Error.code = 'P2002';
      mockPrisma.$transaction = vi.fn().mockRejectedValue(p2002Error);

      const res = await service.handleWebhook({}, {});

      expect(res.received).toBe(true);
      expect(res.status).toBe('PAID');
    });

    it('rolls back all steps if any step in transaction throws a non-unique error', async () => {
      (mockGateway.verifyWebhook as any).mockResolvedValue(true);
      (mockGateway.parseWebhook as any).mockResolvedValue({
        orderId,
        gatewayRef: `${orderId}_123`,
        transactionId: 'momo_tx_99',
        amount: 100000,
        status: 'SUCCESS',
      });

      mockPrisma.order.findUnique.mockResolvedValue({
        id: orderId,
        status: OrderStatus.PENDING,
        totalAmount: 100000,
        expiresAt: new Date(Date.now() + 600000),
        items: [{ seatId, seat: { category: { price: 100000 } } }],
      });

      // Simulate a failure in DB connection inside transaction
      mockPrisma.$transaction = vi
        .fn()
        .mockRejectedValue(new Error('DB connection failure'));

      await expect(service.handleWebhook({}, {})).rejects.toThrow(
        'DB connection failure',
      );
    });

    it('marks payment FAILED and leaves order PENDING when webhook event is FAILED', async () => {
      (mockGateway.verifyWebhook as any).mockResolvedValue(true);
      (mockGateway.parseWebhook as any).mockResolvedValue({
        orderId,
        gatewayRef: `${orderId}_123`,
        transactionId: 'momo_tx_failed',
        amount: 100000,
        status: 'FAILED',
      });

      mockPrisma.order.findUnique.mockResolvedValue({
        id: orderId,
        status: OrderStatus.PENDING,
        totalAmount: 100000,
        expiresAt: new Date(Date.now() + 600000),
        items: [{ seatId, seat: { category: { price: 100000 } } }],
      });
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: 'pay_init',
      });

      const res = await service.handleWebhook({}, {});

      expect(res.status).toBe('FAILED');
      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay_init' },
        data: {
          status: PaymentStatus.FAILED,
          transactionId: 'momo_tx_failed',
        },
      });
      // Order status is NOT changed to FAILED or EXPIRED, remains PENDING
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });

    describe('S-23 Webhook & Expiration Collisions', () => {
      it('AC 8: when webhook SUCCESS arrives for PENDING order that has expired, releases seats and marks NEEDS_REVIEW + LATE', async () => {
        (mockGateway.verifyWebhook as any).mockResolvedValue(true);
        (mockGateway.parseWebhook as any).mockResolvedValue({
          orderId,
          gatewayRef: `${orderId}_late`,
          transactionId: 'momo_tx_late',
          amount: 100000,
          status: 'SUCCESS',
        });

        // Order is PENDING but expired in past
        mockPrisma.order.findUnique.mockResolvedValue({
          id: orderId,
          status: OrderStatus.PENDING,
          totalAmount: 100000,
          expiresAt: new Date(Date.now() - 60000), // 1 min ago
          items: [{ seatId, seat: { category: { price: 100000 } } }],
        });

        const res = await service.handleWebhook({}, {});

        expect(res.status).toBe('LATE');
        // Calls expireOrder to release seats
        expect(mockOrdersService.expireOrder).toHaveBeenCalledWith(orderId);
        // Deletes remaining seat holds via raw SQL
        expect(mockPrisma.$executeRaw).toHaveBeenCalled();
        // Marks order as NEEDS_REVIEW
        expect(mockPrisma.order.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: orderId },
            data: { status: OrderStatus.NEEDS_REVIEW },
          }),
        );
        // Notifies accountant
        expect(mockNotifier.notifyLatePayment).toHaveBeenCalledWith(
          expect.objectContaining({
            orderId,
            reason: expect.stringContaining('hết hạn'),
          }),
        );
      });

      it('AC 7: when atomic update for PAID matches 0 rows due to collision (order expired), enters late payment path safely', async () => {
        (mockGateway.verifyWebhook as any).mockResolvedValue(true);
        (mockGateway.parseWebhook as any).mockResolvedValue({
          orderId,
          gatewayRef: `${orderId}_race`,
          transactionId: 'momo_tx_race',
          amount: 100000,
          status: 'SUCCESS',
        });

        mockPrisma.order.findUnique.mockResolvedValueOnce({
          id: orderId,
          status: OrderStatus.PENDING,
          totalAmount: 100000,
          expiresAt: new Date(Date.now() + 1000), // looks valid initially
          items: [{ seatId, seat: { category: { price: 100000 } } }],
        });

        // In transaction: advisory lock succeeds ($executeRaw), but atomic updateMany returns 0 rows (job expired it right before)
        mockPrisma.$executeRaw
          .mockResolvedValueOnce(1) // advisory lock
          .mockResolvedValueOnce(1); // DELETE FROM seat_holds
        mockPrisma.order.updateMany.mockResolvedValueOnce({ count: 0 });

        // postCheck shows order is now EXPIRED
        mockPrisma.order.findUnique.mockResolvedValueOnce({
          id: orderId,
          status: OrderStatus.EXPIRED,
        });

        const res = await service.handleWebhook({}, {});

        expect(res.status).toBe('LATE');
        expect(mockPrisma.order.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: orderId },
            data: { status: OrderStatus.NEEDS_REVIEW },
          }),
        );
      });

      it('AC 7: when atomic update matches 0 rows because order was already PAID (duplicate), returns PAID without re-processing', async () => {
        (mockGateway.verifyWebhook as any).mockResolvedValue(true);
        (mockGateway.parseWebhook as any).mockResolvedValue({
          orderId,
          gatewayRef: `${orderId}_dup`,
          transactionId: 'momo_tx_dup',
          amount: 100000,
          status: 'SUCCESS',
        });

        mockPrisma.order.findUnique.mockResolvedValueOnce({
          id: orderId,
          status: OrderStatus.PENDING,
          totalAmount: 100000,
          expiresAt: new Date(Date.now() + 10000),
          items: [{ seatId, seat: { category: { price: 100000 } } }],
        });

        // In transaction: advisory lock succeeds, but atomic update returns 0
        mockPrisma.$executeRaw.mockResolvedValueOnce(1); // advisory lock
        mockPrisma.order.updateMany.mockResolvedValueOnce({ count: 0 });

        // postCheck reveals order is already PAID
        mockPrisma.order.findUnique.mockResolvedValueOnce({
          id: orderId,
          status: OrderStatus.PAID,
        });

        const res = await service.handleWebhook({}, {});

        expect(res.status).toBe('PAID');
        // Does NOT update order or delete seats
        expect(mockPrisma.order.update).not.toHaveBeenCalled();
      });
    });
  });
});
