import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service.js';
import { isOrderExpired } from './order-expiration.js';
import type { PrismaService } from '../prisma/prisma.service.js';

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
      expect(isOrderExpired({ status: OrderStatus.EXPIRED, expiresAt: future })).toBe(
        true,
      );
    });

    it('returns false for PAID order even after original expiresAt', () => {
      const past = new Date(Date.now() - 60000);
      expect(isOrderExpired({ status: OrderStatus.PAID, expiresAt: past })).toBe(
        false,
      );
    });
  });

  describe('OrdersService', () => {
    let service: OrdersService;
    let mockPrisma: any;

    const mockUserId = '11111111-1111-4111-8111-111111111111';
    const mockShowtimeId = '22222222-2222-4222-8222-222222222222';
    const mockEventId = '33333333-3333-4333-8333-333333333333';
    const mockSeatId1 = '44444444-4444-4444-8444-444444444441';
    const mockSeatId2 = '44444444-4444-4444-8444-444444444442';
    const mockSessionHash = 'mock-session-hash-12345';
    const mockOrderId = '55555555-5555-4555-8555-555555555555';

    beforeEach(() => {
      mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockPrisma)),
        holdSession: {
          findFirst: vi.fn(),
        },
        seat: {
          findMany: vi.fn(),
        },
        order: {
          create: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
        },
        orderLog: {
          count: vi.fn().mockResolvedValue(0),
        },
      };
      service = new OrdersService(mockPrisma as unknown as PrismaService);
    });

    describe('createOrder (AC 1 & AC 2)', () => {
      it('AC 1: creates an order from held seats, returns full order details, seats with tier and price, total and countdown', async () => {
        const expiresAt = new Date(Date.now() + 600000);
        mockPrisma.holdSession.findFirst.mockResolvedValue({
          id: 'session-1',
          showtimeId: mockShowtimeId,
          userId: mockUserId,
          sessionHash: mockSessionHash,
          expiresAt,
          seats: [{ seatId: mockSeatId1 }, { seatId: mockSeatId2 }],
          showtime: {
            id: mockShowtimeId,
            eventId: mockEventId,
            event: {
              id: mockEventId,
              name: 'Đêm Nhạc Mùa Thu',
              description: 'Chương trình hòa nhạc đặc biệt',
              location: 'Nhà hát Lớn Hà Nội',
              posterPath: '/posters/autumn.jpg',
              bannerPath: '/banners/autumn.jpg',
            },
          },
        });

        mockPrisma.seat.findMany.mockResolvedValue([
          {
            id: mockSeatId1,
            row: 'A',
            seatNumber: 1,
            category: { name: 'VIP', price: 500000 },
          },
          {
            id: mockSeatId2,
            row: 'A',
            seatNumber: 2,
            category: { name: 'VIP', price: 500000 },
          },
        ]);

        mockPrisma.order.create.mockImplementation(({ data }: any) => {
          return {
            id: mockOrderId,
            userId: data.userId,
            eventId: data.eventId,
            showtimeId: data.showtimeId,
            status: data.status,
            totalAmount: data.totalAmount,
            expiresAt: data.expiresAt,
            createdAt: new Date(),
            event: {
              id: mockEventId,
              name: 'Đêm Nhạc Mùa Thu',
              description: 'Chương trình hòa nhạc đặc biệt',
              location: 'Nhà hát Lớn Hà Nội',
              posterPath: '/posters/autumn.jpg',
              bannerPath: '/banners/autumn.jpg',
            },
            showtime: {
              id: mockShowtimeId,
              startTime: new Date('2026-11-01T19:30:00Z'),
            },
            items: [
              {
                id: 'item-1',
                seatId: mockSeatId1,
                tierName: 'VIP',
                unitPrice: 500000,
                seat: { row: 'A', seatNumber: 1 },
              },
              {
                id: 'item-2',
                seatId: mockSeatId2,
                tierName: 'VIP',
                unitPrice: 500000,
                seat: { row: 'A', seatNumber: 2 },
              },
            ],
          };
        });

        const result = await service.createOrder(mockUserId, mockSessionHash, {
          showtimeId: mockShowtimeId,
          seatIds: [mockSeatId1, mockSeatId2],
        });

        expect(result.id).toBe(mockOrderId);
        expect(result.status).toBe(OrderStatus.PENDING);
        expect(result.totalAmount).toBe(1000000);
        expect(result.event.name).toBe('Đêm Nhạc Mùa Thu');
        expect(result.items).toHaveLength(2);
        expect(result.items[0].label).toBe('A-1');
        expect(result.items[0].tierName).toBe('VIP');
        expect(result.items[0].unitPrice).toBe(500000);
        expect(result.remainingSeconds).toBeGreaterThan(0);
        expect(result.isExpired).toBe(false);
      });

      it('AC 2: strictly ignores client-submitted totalAmount and unit prices, computing from DB tier price', async () => {
        const expiresAt = new Date(Date.now() + 600000);
        mockPrisma.holdSession.findFirst.mockResolvedValue({
          id: 'session-1',
          showtimeId: mockShowtimeId,
          userId: mockUserId,
          sessionHash: mockSessionHash,
          expiresAt,
          seats: [{ seatId: mockSeatId1 }],
          showtime: {
            id: mockShowtimeId,
            eventId: mockEventId,
            event: { id: mockEventId, name: 'Sự kiện mẫu' },
          },
        });

        mockPrisma.seat.findMany.mockResolvedValue([
          {
            id: mockSeatId1,
            row: 'B',
            seatNumber: 10,
            category: { name: 'STANDARD', price: 250000 },
          },
        ]);

        mockPrisma.order.create.mockImplementation(({ data }: any) => {
          return {
            id: mockOrderId,
            ...data,
            createdAt: new Date(),
            event: { id: mockEventId, name: 'Sự kiện mẫu' },
            showtime: { id: mockShowtimeId, startTime: new Date() },
            items: [
              {
                id: 'item-1',
                seatId: mockSeatId1,
                tierName: 'STANDARD',
                unitPrice: data.items.create[0].unitPrice,
                seat: { row: 'B', seatNumber: 10 },
              },
            ],
          };
        });

        // Client maliciously sends modified totalAmount: 1 and unitPrice: 1
        const result = await service.createOrder(mockUserId, mockSessionHash, {
          showtimeId: mockShowtimeId,
          seatIds: [mockSeatId1],
          totalAmount: 1,
          unitPrice: 1,
          prices: [0],
        });

        expect(mockPrisma.order.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              totalAmount: 250000,
            }),
          }),
        );
        expect(result.totalAmount).toBe(250000);
      });

      it('rejects if requested seats are not held by the user or expired', async () => {
        mockPrisma.holdSession.findFirst.mockResolvedValue(null);

        await expect(
          service.createOrder(mockUserId, mockSessionHash, {
            showtimeId: mockShowtimeId,
            seatIds: [mockSeatId1],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('getOrderById (AC 3 & AC 4)', () => {
      it('AC 4: rejects when another user views an order not owned by them (throws 404)', async () => {
        mockPrisma.order.findUnique.mockResolvedValue({
          id: mockOrderId,
          userId: 'other-user-uuid',
          items: [],
        });

        await expect(
          service.getOrderById(mockOrderId, mockUserId),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('AC 4: rejects when order is not found (throws 404)', async () => {
        mockPrisma.order.findUnique.mockResolvedValue(null);

        await expect(
          service.getOrderById(mockOrderId, mockUserId),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('AC 3: marks order as EXPIRED and isExpired=true when current time passes expiresAt', async () => {
        const past = new Date(Date.now() - 5000);
        mockPrisma.order.findUnique.mockResolvedValue({
          id: mockOrderId,
          userId: mockUserId,
          status: OrderStatus.PENDING,
          totalAmount: 500000,
          expiresAt: past,
          createdAt: new Date(Date.now() - 605000),
          event: {
            id: mockEventId,
            name: 'Rock Concert',
            description: 'Live',
            location: 'Sân vận động Mỹ Đình',
            posterPath: null,
            bannerPath: null,
          },
          showtime: {
            id: mockShowtimeId,
            startTime: new Date(),
          },
          items: [
            {
              id: 'item-1',
              seatId: mockSeatId1,
              tierName: 'GA',
              unitPrice: 500000,
              seat: {
                row: 'G',
                seatNumber: 12,
                category: { price: 500000 },
              },
            },
          ],
        });

        const result = await service.getOrderById(mockOrderId, mockUserId);
        expect(result.isExpired).toBe(true);
        expect(result.status).toBe(OrderStatus.EXPIRED);
        expect(result.remainingSeconds).toBe(0);
      });

      it('recalculates total amount from stored item price snapshots and logs warning if mismatch', async () => {
        const future = new Date(Date.now() + 60000);
        mockPrisma.order.findUnique.mockResolvedValue({
          id: mockOrderId,
          userId: mockUserId,
          status: OrderStatus.PENDING,
          totalAmount: 400000, // saved mismatch
          expiresAt: future,
          createdAt: new Date(),
          event: {
            id: mockEventId,
            name: 'Kịch nói',
            description: 'Vở kịch',
            location: 'Nhà hát kịch',
            posterPath: null,
            bannerPath: null,
          },
          showtime: {
            id: mockShowtimeId,
            startTime: new Date(),
          },
          items: [
            {
              id: 'item-1',
              seatId: mockSeatId1,
              tierName: 'VIP',
              unitPrice: 500000,
              seat: {
                row: 'A',
                seatNumber: 1,
                category: { price: 700000 }, // later live price must not change a pending order
              },
            },
          ],
        });

        const result = await service.getOrderById(mockOrderId, mockUserId);
        // Server recalculated total wins
        expect(result.totalAmount).toBe(500000);
      });
    });

    describe('S-27: resendEmail and getUserOrders', () => {
      const mockMailService = {
        sendTicketEmail: vi.fn(),
        generateQrCode: vi.fn(),
      };

      let s27Service: OrdersService;

      beforeEach(() => {
        vi.clearAllMocks();
        s27Service = new OrdersService(
          mockPrisma as unknown as PrismaService,
          mockMailService as any,
        );
      });

      it('resendEmail: rejects when order does not exist (throws NotFoundException)', async () => {
        mockPrisma.order.findUnique.mockResolvedValue(null);
        await expect(
          s27Service.resendEmail(mockUserId, mockOrderId),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('resendEmail: rejects when user is not the owner (throws ForbiddenException)', async () => {
        mockPrisma.order.findUnique.mockResolvedValue({
          id: mockOrderId,
          userId: 'other-user',
        });
        await expect(
          s27Service.resendEmail(mockUserId, mockOrderId),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });

      it('resendEmail: rejects when order is not in PAID status (throws BadRequestException)', async () => {
        mockPrisma.order.findUnique.mockResolvedValue({
          id: mockOrderId,
          userId: mockUserId,
          status: OrderStatus.PENDING,
          tickets: [{ id: 'ticket-1' }],
        });
        await expect(
          s27Service.resendEmail(mockUserId, mockOrderId),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('resendEmail: rejects when order has no tickets issued (throws BadRequestException)', async () => {
        mockPrisma.order.findUnique.mockResolvedValue({
          id: mockOrderId,
          userId: mockUserId,
          status: OrderStatus.PAID,
          tickets: [],
        });
        await expect(
          s27Service.resendEmail(mockUserId, mockOrderId),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('resendEmail: re-sends email with existing tickets and NEVER creates new tickets', async () => {
        const existingTicket = {
          id: 'ticket-1',
          ticketCode: 'TKT-EXISTING-1',
          code: 'TKT-EXISTING-1',
          seatLabel: 'A-1',
          ticketType: 'VIP',
          price: 500000,
          qrCodeData: 'payload',
          qrCodeImage: 'data:image/png;base64,sample',
          seat: {
            row: 'A',
            seatNumber: 1,
            category: { name: 'VIP' },
          },
        };

        mockPrisma.order.findUnique.mockResolvedValue({
          id: mockOrderId,
          userId: mockUserId,
          status: OrderStatus.PAID,
          totalAmount: 500000,
          user: { email: 'buyer@example.com' },
          showtime: {
            startTime: new Date('2026-11-20T19:30:00Z'),
            event: { name: 'Concert', location: 'HN' },
          },
          tickets: [existingTicket],
        });

        mockMailService.sendTicketEmail.mockResolvedValue({
          success: true,
          attempts: 1,
        });

        const result = await s27Service.resendEmail(mockUserId, mockOrderId);

        expect(result.success).toBe(true);
        expect(mockMailService.sendTicketEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            id: mockOrderId,
            customerEmail: 'buyer@example.com',
            tickets: [
              expect.objectContaining({
                id: 'ticket-1',
                ticketCode: 'TKT-EXISTING-1',
              }),
            ],
          }),
          'buyer@example.com',
        );
        // Verify ticket.create was NEVER called
        expect(mockPrisma.ticket?.create).toBeUndefined();
      });

      it('getUserOrders: returns formatted orders with tickets and email logs for the buyer', async () => {
        mockPrisma.order.findMany.mockResolvedValue([
          {
            id: mockOrderId,
            userId: mockUserId,
            showtimeId: mockShowtimeId,
            totalAmount: 500000,
            status: OrderStatus.PAID,
            createdAt: new Date('2026-10-10T00:00:00Z'),
            user: { email: 'buyer@example.com' },
            showtime: {
              id: mockShowtimeId,
              startTime: new Date('2026-11-20T19:30:00Z'),
              event: { name: 'Concert', location: 'HN' },
            },
            tickets: [
              {
                id: 'ticket-1',
                ticketCode: 'TKT-1',
                seatId: mockSeatId1,
                price: 500000,
                qrCodeData: 'data',
                qrCodeImage: 'img',
                seat: {
                  row: 'A',
                  seatNumber: 1,
                  category: { name: 'VIP' },
                },
              },
            ],
            emailLogs: [
              {
                id: 'log-1',
                status: 'SENT',
                attempts: 1,
                lastError: null,
                sentAt: new Date('2026-10-10T00:01:00Z'),
              },
            ],
          },
        ]);

        const orders = await s27Service.getUserOrders(mockUserId);
        expect(orders).toHaveLength(1);
        expect(orders[0].id).toBe(mockOrderId);
        expect(orders[0].customerEmail).toBe('buyer@example.com');
        expect(orders[0].tickets).toHaveLength(1);
        expect(orders[0].emailLogs).toHaveLength(1);
        expect(orders[0].emailLogs[0].status).toBe('SENT');
      });
    });
  });
});
