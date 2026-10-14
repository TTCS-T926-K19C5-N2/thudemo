import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { SeatEventsService, type SeatStatusChangedEvent } from '../src/showtimes/seat-events.service.js';
import { HoldsService } from '../src/holds/holds.service.js';
import { HoldExpiryScheduler } from '../src/holds/hold-expiry.scheduler.js';
import { ShowtimesController } from '../src/showtimes/showtimes.controller.js';
import { ShowtimesService } from '../src/showtimes/showtimes.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../src/prisma/prisma.service.js';

describe('S-44 & SCRUM-133/136/137/138: Realtime Seat Map & Race Condition', () => {
  let seatEvents: SeatEventsService;
  let receivedEvents: SeatStatusChangedEvent[];

  const mockShowtimeId = '00000000-0000-4000-8000-000000000001';
  const mockSeatId = '11111111-1111-4111-8111-111111111111';
  const mockUserIdA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const mockUserIdB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const mockSessionHashA = 'session-hash-a';
  const mockSessionHashB = 'session-hash-b';

  beforeEach(() => {
    seatEvents = new SeatEventsService();
    receivedEvents = [];
    seatEvents.onEvent().subscribe((e) => receivedEvents.push(e));
  });

  describe('SCRUM-133: SSE Stream endpoint and filtering', () => {
    it('streams seat status events and filters strictly by showtimeId', async () => {
      const mockService = {
        publicSeats: vi.fn(),
        seatStream: vi.fn((id: string) => seatEvents.stream(id)),
      } as unknown as ShowtimesService;

      const controller = new ShowtimesController(mockService);
      const streamObservable = controller.seatsStream(mockShowtimeId);

      const captured: any[] = [];
      const sub = streamObservable.subscribe((msg) => captured.push(msg.data));

      // Emit for target showtime
      seatEvents.emit({
        showtimeId: mockShowtimeId,
        seatId: mockSeatId,
        status: 'HELD',
      });

      // Emit for different showtime
      seatEvents.emit({
        showtimeId: '99999999-9999-4999-8999-999999999999',
        seatId: '22222222-2222-4222-8222-222222222222',
        status: 'AVAILABLE',
      });

      // Emit another for target showtime
      seatEvents.emit({
        showtimeId: mockShowtimeId,
        seatId: mockSeatId,
        status: 'SOLD',
      });

      expect(captured).toHaveLength(2);
      expect(captured[0]).toEqual({
        showtimeId: mockShowtimeId,
        seatId: mockSeatId,
        status: 'HELD',
      });
      expect(captured[1]).toEqual({
        showtimeId: mockShowtimeId,
        seatId: mockSeatId,
        status: 'SOLD',
      });

      sub.unsubscribe();
    });
  });

  describe('SCRUM-136: Test 1 - Hủy hold phát ra đúng event AVAILABLE', () => {
    it('Test 1: releases user hold and emits AVAILABLE event', async () => {
      const mockDb = {
        $queryRaw: vi.fn().mockResolvedValueOnce([
          { seatId: mockSeatId, showtimeId: mockShowtimeId },
        ]),
        $executeRaw: vi.fn().mockResolvedValueOnce(1),
      } as unknown as PrismaService;

      const holdsService = new HoldsService(mockDb, seatEvents);
      const result = await holdsService.release(
        mockShowtimeId,
        mockUserIdA,
        mockSessionHashA,
      );

      expect(result.releasedCount).toBe(1);
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        showtimeId: mockShowtimeId,
        seatId: mockSeatId,
        status: 'AVAILABLE',
      });
    });

    it('emits HELD when claim successfully locks seats', async () => {
      const mockDb = {
        commitHoldRoutine: vi.fn().mockResolvedValueOnce([
          {
            serverTime: new Date(),
            id: 'hold-1',
            expiresAt: new Date(Date.now() + 60000),
            seatIds: [mockSeatId],
            failure: null,
            rejectedSeatIds: [],
          },
        ]),
        seatReadQuery: vi.fn(),
      } as unknown as PrismaService;

      const holdsService = new HoldsService(mockDb, seatEvents);
      await holdsService.claim(
        mockShowtimeId,
        mockUserIdA,
        mockSessionHashA,
        { seatIds: [mockSeatId] },
      );

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        showtimeId: mockShowtimeId,
        seatId: mockSeatId,
        status: 'HELD',
      });
    });

    it('orders expiring overdue pending orders emits AVAILABLE event', async () => {
      const mockOrderId = 'order-uuid-1';
      const mockDb = {
        $transaction: vi.fn(async (cb) => {
          const tx = {
            $queryRaw: vi.fn()
              .mockResolvedValueOnce([
                { id: mockOrderId, userId: mockUserIdA, holdSessionId: 'hold-session-1' },
              ])
              .mockResolvedValueOnce([
                { seatId: mockSeatId, showtimeId: mockShowtimeId },
              ]),
            $executeRaw: vi.fn().mockResolvedValueOnce(1),
          };
          return cb(tx);
        }),
      } as unknown as PrismaService;

      const ordersService = new OrdersService(mockDb, seatEvents);
      const result = await ordersService.expireOrder(mockOrderId);

      expect(result.status).toBe('expired');
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        showtimeId: mockShowtimeId,
        seatId: mockSeatId,
        status: 'AVAILABLE',
      });
    });

    it('payments marking isSold = true emits SOLD event', async () => {
      const mockOrderId = 'order-uuid-2';
      const mockGateway = {
        name: 'mock',
        createPayment: vi.fn(),
        verifyWebhook: vi.fn().mockResolvedValue(true),
        parseWebhook: vi.fn().mockResolvedValue({
          orderId: mockOrderId,
          status: 'SUCCESS',
          amount: 100000,
          gatewayRef: 'ref-1',
          transactionId: 'trans-1',
        }),
      };
      const mockNotifier = { notifyLatePayment: vi.fn() };
      const mockConfig = new ConfigService({});

      const mockDb = {
        order: {
          findUnique: vi.fn().mockResolvedValue({
            id: mockOrderId,
            status: 'PENDING_PAYMENT',
            showtimeId: mockShowtimeId,
            items: [{ seatId: mockSeatId, unitPrice: 100000 }],
            totalAmount: 100000,
            holdSessionId: 'hs-1',
          }),
        },
        payment: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        $transaction: vi.fn(async (cb) => {
          const tx = {
            order: {
              findUnique: vi.fn().mockResolvedValue({ id: mockOrderId, status: 'PENDING_PAYMENT' }),
              update: vi.fn().mockResolvedValue({ id: mockOrderId, status: 'PAID' }),
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
            seat: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
            seatHold: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
            payment: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue({ id: 'p-1' }),
            },
            orderLog: { create: vi.fn() },
            $executeRaw: vi.fn().mockResolvedValue(1),
          };
          return cb(tx);
        }),
      } as unknown as PrismaService;

      const paymentsService = new PaymentsService(
        mockDb,
        mockGateway as any,
        mockNotifier as any,
        mockConfig,
        undefined,
        seatEvents,
      );

      await paymentsService.handleWebhook({}, {});

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        showtimeId: mockShowtimeId,
        seatId: mockSeatId,
        status: 'SOLD',
      });
    });
  });

  describe('SCRUM-137: Test 2 - Hold hết thời gian expiresAt tự động bị task xóa và phát event AVAILABLE', () => {
    it('Test 2: sweeps expired holds and emits AVAILABLE event', async () => {
      const candidates = [
        { seatId: mockSeatId, token: 'token-1', showtimeId: mockShowtimeId },
      ];

      const mockDb = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce(candidates)
          .mockResolvedValueOnce([]), // 2nd batch empty
        $executeRaw: vi.fn().mockResolvedValueOnce(1),
      } as unknown as PrismaService;

      const holdsService = new HoldsService(mockDb, seatEvents);
      const scheduler = new HoldExpiryScheduler(holdsService);

      const deleted = await scheduler.sweepExpired();

      expect(deleted).toBe(1);
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({
        showtimeId: mockShowtimeId,
        seatId: mockSeatId,
        status: 'AVAILABLE',
      });
    });
  });

  describe('SCRUM-138: Test 3 - Tranh chấp ghế (Race condition / Concurrency conflict)', () => {
    it('Test 3: sends concurrent hold requests for the same seatId: exactly 1 succeeds and 1 fails with 409 Conflict', async () => {
      // Simulate atomic locking at DB level: first claim acquires lock, second encounters conflict
      let lockAcquired = false;

      const mockDb = {
        commitHoldRoutine: vi.fn(async () => {
          if (!lockAcquired) {
            lockAcquired = true;
            return [
              {
                serverTime: new Date(),
                id: 'hold-winner',
                expiresAt: new Date(Date.now() + 60000),
                seatIds: [mockSeatId],
                failure: null,
                rejectedSeatIds: [],
              },
            ];
          } else {
            return [
              {
                serverTime: new Date(),
                id: null,
                expiresAt: null,
                seatIds: [],
                failure: 'H0004',
                rejectedSeatIds: [mockSeatId],
              },
            ];
          }
        }),
        seatReadQuery: vi.fn(),
      } as unknown as PrismaService;

      const holdsService = new HoldsService(mockDb, seatEvents);

      // Concurrently dispatch requests via Promise.allSettled
      const [resA, resB] = await Promise.allSettled([
        holdsService.claim(mockShowtimeId, mockUserIdA, mockSessionHashA, {
          seatIds: [mockSeatId],
        }),
        holdsService.claim(mockShowtimeId, mockUserIdB, mockSessionHashB, {
          seatIds: [mockSeatId],
        }),
      ]);

      const succeeded = [resA, resB].filter((r) => r.status === 'fulfilled');
      const rejected = [resA, resB].filter((r) => r.status === 'rejected');

      // Assert that exactly 1 request succeeded and 1 was rejected
      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Verify winner has valid hold state
      const winnerResult = (succeeded[0] as PromiseFulfilledResult<any>).value;
      expect(winnerResult.hold).toBeDefined();
      expect(winnerResult.hold.seatIds).toEqual([mockSeatId]);

      // Verify loser received a 409 ConflictException with SEAT_CONFLICT
      const loserError = (rejected[0] as PromiseRejectedResult).reason;
      expect(loserError).toBeInstanceOf(ConflictException);
      expect(loserError.getStatus()).toBe(409);
      const response = loserError.getResponse();
      expect(response).toMatchObject({
        code: 'SEAT_CONFLICT',
        rejectedSeatIds: [mockSeatId],
      });
    });
  });
});
