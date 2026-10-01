import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';

describe('PaymentsService (SCRUM-32 & SCRUM-33)', () => {
  let service: PaymentsService;
  let prismaMock: {
    order: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prismaMock = {
      order: {
        findFirst: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    service = new PaymentsService(prismaMock as unknown as PrismaService);
  });

  describe('SCRUM-32 (S-21): Webhook có chữ ký sai bị từ chối', () => {
    it('AC1: Giả sử webhook có chữ ký không khớp khoá của cổng -> trả 401, không đọc nội dung, không đổi đơn, và ghi log', async () => {
      const payload = JSON.stringify({ orderCode: 'ORD-TEST-1', status: 'PAID' });
      const invalidSignature = 'invalid-signature-hex-123456';
      const clientIp = '198.51.100.42';

      await expect(
        service.handleWebhook(payload, invalidSignature, clientIp),
      ).rejects.toThrow(UnauthorizedException);

      // Đảm bảo không gọi database để đổi đơn
      expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    it('AC1: Trả 401 khi không có chữ ký (header rỗng hoặc undefined)', async () => {
      const payload = JSON.stringify({ orderCode: 'ORD-TEST-1' });
      const clientIp = '203.0.113.1';

      await expect(
        service.handleWebhook(payload, undefined, clientIp),
      ).rejects.toThrow(UnauthorizedException);

      expect(prismaMock.order.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    it('AC2: Giả sử webhook đúng chữ ký nhưng mã đơn không tồn tại -> trả 404 và ghi log', async () => {
      const payload = JSON.stringify({ orderCode: 'ORD-NON-EXISTENT', status: 'PAID' });
      const validSignature = service.computeSignature(payload);
      const clientIp = '192.168.1.100';

      prismaMock.order.findFirst.mockResolvedValue(null);

      await expect(
        service.handleWebhook(payload, validSignature, clientIp),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: {
          orderCode: 'ORD-NON-EXISTENT',
        },
        include: { event: true },
      });
      // Không thay đổi dữ liệu đơn
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    it('AC2: Hỗ trợ tìm kiếm theo UUID nếu orderIdentifier là UUID hợp lệ', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const payload = JSON.stringify({ orderId: validUuid, status: 'PAID' });
      const validSignature = service.computeSignature(payload);
      const clientIp = '192.168.1.100';

      prismaMock.order.findFirst.mockResolvedValue(null);

      await expect(
        service.handleWebhook(payload, validSignature, clientIp),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ id: validUuid }, { orderCode: validUuid }],
        },
        include: { event: true },
      });
    });

    it('Thành công: Đúng chữ ký và đơn hàng tồn tại -> chuyển trạng thái sang PAID và trả kết quả', async () => {
      const payload = JSON.stringify({
        orderCode: 'ORD-VALID-99',
        transactionId: 'TXN-VNPAY-12345',
        status: 'PAID',
      });
      const validSignature = service.computeSignature(payload);
      const clientIp = '10.0.0.1';

      const existingOrder = {
        id: 'uuid-order-99',
        orderCode: 'ORD-VALID-99',
        status: 'PENDING',
        amount: 200000,
        event: { name: 'Liveshow Âm Nhạc 2026' },
      };

      const updatedOrder = {
        ...existingOrder,
        status: 'PAID',
        transactionId: 'TXN-VNPAY-12345',
        ticketUrl: '/orders/uuid-order-99/ticket',
      };

      prismaMock.order.findFirst.mockResolvedValue(existingOrder);
      prismaMock.order.update.mockResolvedValue(updatedOrder);

      const result = await service.handleWebhook(payload, validSignature, clientIp);

      expect(result.success).toBe(true);
      expect(result.status).toBe('PAID');
      expect(result.orderCode).toBe('ORD-VALID-99');
      expect(result.ticketUrl).toBe('/orders/uuid-order-99/ticket');

      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: 'uuid-order-99' },
        data: {
          status: 'PAID',
          transactionId: 'TXN-VNPAY-12345',
          ticketUrl: '/orders/uuid-order-99/ticket',
        },
      });
    });
  });

  describe('SCRUM-33 (S-22): Kiểm tra trạng thái đơn hàng (Server-authoritative)', () => {
    it('Trả về trạng thái thực tế từ máy chủ (PENDING khi chưa có webhook)', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'order-123',
        orderCode: 'ORD-PENDING',
        status: 'PENDING',
        amount: 350000,
        event: { name: 'Hội thảo Công nghệ' },
        transactionId: null,
        ticketUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const status = await service.getOrderStatus('ORD-PENDING');

      expect(status.status).toBe('PENDING');
      expect(status.ticketUrl).toBeNull();
      expect(status.amount).toBe(350000);
    });

    it('Trả về trạng thái PAID kèm link vé khi webhook đã cập nhật', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'order-456',
        orderCode: 'ORD-PAID',
        status: 'PAID',
        amount: 500000,
        event: { name: 'Đại nhạc hội' },
        transactionId: 'TXN-456',
        ticketUrl: '/orders/order-456/ticket',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const status = await service.getOrderStatus('order-456');

      expect(status.status).toBe('PAID');
      expect(status.ticketUrl).toBe('/orders/order-456/ticket');
    });

    it('Ném lỗi NotFoundException khi đơn không tồn tại', async () => {
      prismaMock.order.findFirst.mockResolvedValue(null);

      await expect(service.getOrderStatus('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
