import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrdersService } from './orders.service.js';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('OrdersService', () => {
  let service: OrdersService;
  const mockPrisma = {
    $transaction: vi.fn(),
    order: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    ticket: {
      create: vi.fn(),
    },
  };

  let mockMailService: {
    generateQrCode: ReturnType<typeof vi.fn>;
    sendTicketEmail: ReturnType<typeof vi.fn>;
  };

  const userId = '11111111-1111-4111-8111-111111111111';
  const showtimeId = '22222222-2222-4222-8222-222222222222';
  const orderId = '33333333-3333-4333-8333-333333333333';

  const existingOrder = {
    id: orderId,
    userId,
    showtimeId,
    totalAmount: 300000,
    status: 'PAID',
    customerEmail: 'buyer@example.com',
    createdAt: new Date(),
    showtime: {
      id: showtimeId,
      startTime: new Date('2026-11-20T19:30:00Z'),
      event: {
        name: 'Đại Nhạc Hội Mùa Thu',
        location: 'Sân vận động Mỹ Đình',
      },
    },
    tickets: [
      {
        id: 'ticket-existing-1',
        ticketCode: 'TKT-ORIGINAL-999',
        seatId: 'seat-1',
        price: 300000,
        qrCodeData: '{"ticketCode":"TKT-ORIGINAL-999"}',
        qrCodeImage: 'data:image/png;base64,origqr',
        seat: {
          row: 'B',
          seatNumber: 15,
          category: { name: 'Thường' },
        },
      },
    ],
    emailLogs: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMailService = {
      generateQrCode: vi.fn().mockResolvedValue({
        dataUrl: 'data:image/png;base64,mockqr',
        buffer: Buffer.from('mockbuffer'),
      }),
      sendTicketEmail: vi.fn().mockResolvedValue({
        success: true,
        attempts: 1,
        sentAt: new Date(),
      }),
    };
    service = new OrdersService(mockPrisma as any, mockMailService as any);
  });

  describe('checkout', () => {
    it('throws BadRequestException if seatIds is empty', async () => {
      await expect(
        service.checkout(showtimeId, userId, 'buyer@example.com', []),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if showtimeId or seatId is not a valid UUID', async () => {
      await expect(
        service.checkout('not-a-uuid', userId, 'buyer@example.com', [
          '44444444-4444-4444-8444-444444444444',
        ]),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.checkout(showtimeId, userId, 'buyer@example.com', ['invalid-seat']),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates order, issues tickets with QR, sends email, and returns order', async () => {
      const seatId = '44444444-4444-4444-8444-444444444444';
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          showtime: {
            findUnique: vi.fn().mockResolvedValue({
              id: showtimeId,
              status: 'ON_SALE',
              event: { name: 'Concert A' },
            }),
          },
          $queryRaw: vi.fn().mockResolvedValue([
            {
              id: seatId,
              row: 'A',
              seatNumber: 1,
              categoryName: 'VIP',
              price: 500000,
            },
          ]),
          order: {
            create: vi.fn().mockResolvedValue({
              id: orderId,
              userId,
              showtimeId,
              totalAmount: 500000,
              status: 'PAID',
              customerEmail: 'buyer@example.com',
            }),
          },
          ticket: {
            create: vi.fn().mockResolvedValue({ id: 'ticket-new-1' }),
          },
          $executeRaw: vi.fn().mockResolvedValue(1),
        };
        return callback(tx);
      });

      mockPrisma.order.findUnique.mockResolvedValue(existingOrder);

      const result = await service.checkout(
        showtimeId,
        userId,
        'buyer@example.com',
        [seatId],
      );

      expect(result.order).toBeDefined();
      expect(result.emailResult.success).toBe(true);
      expect(mockMailService.generateQrCode).toHaveBeenCalled();
      expect(mockMailService.sendTicketEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          id: existingOrder.id,
          customerEmail: 'buyer@example.com',
        }),
        'buyer@example.com',
      );
    });

    it('retains order and tickets even if email sending fails', async () => {
      const seatId = '44444444-4444-4444-8444-444444444444';
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          showtime: {
            findUnique: vi.fn().mockResolvedValue({
              id: showtimeId,
              status: 'ON_SALE',
              event: { name: 'Concert A' },
            }),
          },
          $queryRaw: vi.fn().mockResolvedValue([
            {
              id: seatId,
              row: 'A',
              seatNumber: 1,
              categoryName: 'VIP',
              price: 500000,
            },
          ]),
          order: {
            create: vi.fn().mockResolvedValue({
              id: orderId,
              userId,
              showtimeId,
              totalAmount: 500000,
              status: 'PAID',
              customerEmail: 'buyer@example.com',
            }),
          },
          ticket: {
            create: vi.fn().mockResolvedValue({ id: 'ticket-new-1' }),
          },
          $executeRaw: vi.fn().mockResolvedValue(1),
        };
        return callback(tx);
      });

      mockPrisma.order.findUnique.mockResolvedValue(existingOrder);
      mockMailService.sendTicketEmail.mockResolvedValue({
        success: false,
        attempts: 3,
        error: 'SMTP failed after 3 attempts',
      });

      const result = await service.checkout(
        showtimeId,
        userId,
        'buyer@example.com',
        [seatId],
      );

      // Order and tickets are still returned safely
      expect(result.order).toBeDefined();
      expect(result.order.id).toBe(orderId);
      expect(result.emailResult.success).toBe(false);
      expect(result.emailResult.error).toContain('SMTP failed after 3 attempts');
    });
  });

  describe('resendEmail', () => {
    it('resends email using EXACT existing tickets without creating any new tickets', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(existingOrder);

      const result = await service.resendEmail(userId, orderId);

      expect(result.success).toBe(true);
      expect(mockMailService.sendTicketEmail).toHaveBeenCalledOnce();
      // Ensure ticket.create was NEVER called
      expect(mockPrisma.ticket.create).not.toHaveBeenCalled();

      // Ensure the email payload uses the original ticket code and data
      expect(mockMailService.sendTicketEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          id: orderId,
          tickets: [
            expect.objectContaining({
              id: 'ticket-existing-1',
              ticketCode: 'TKT-ORIGINAL-999',
              seatRow: 'B',
              seatNumber: 15,
            }),
          ],
        }),
        'buyer@example.com',
      );
    });

    it('throws NotFoundException if order does not exist', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      await expect(service.resendEmail(userId, 'non-existent-order')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException if order does not belong to the user', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        ...existingOrder,
        userId: 'different-user-uuid',
      });

      await expect(service.resendEmail(userId, orderId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getOrderDetails', () => {
    it('returns order details when user is the owner', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(existingOrder);
      const result = await service.getOrderDetails(orderId, userId);
      expect(result.id).toBe(orderId);
      expect(result.userId).toBe(userId);
    });

    it('throws NotFoundException when order does not exist', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      await expect(service.getOrderDetails('non-existent', userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when another user attempts to access the order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(existingOrder);
      await expect(
        service.getOrderDetails(orderId, 'other-user-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
