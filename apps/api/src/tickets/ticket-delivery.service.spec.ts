import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketDeliveryService } from './ticket-delivery.service.js';

describe('TicketDeliveryService', () => {
  let service: TicketDeliveryService;
  let db: any;
  let projection: any;
  let mail: any;
  let config: ConfigService;

  const ORDER_ID = 'b7324ba7-ec16-43bf-b58f-287968560183';
  const USER_ID = 'c1234567-ec16-43bf-b58f-287968560184';
  const VALID_REQUEST_ID = 'd1234567-ec16-43bf-b58f-287968560185';

  beforeEach(() => {
    db = {
      $transaction: vi.fn(async (cb) => cb(db)),
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([]),
      ticketMailDelivery: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      order: {
        findUnique: vi.fn(),
      },
    };

    projection = {
      forOwner: vi.fn(),
      forBuyer: vi.fn(),
    };

    mail = {
      ready: true,
      send: vi.fn().mockResolvedValue(undefined),
    };

    config = new ConfigService({
      TICKET_MAIL_WORKER: 'true',
    });

    service = new TicketDeliveryService(db, projection, mail, config);
  });

  describe('lifecycle (onModuleInit & onModuleDestroy)', () => {
    it('does not start timer if TICKET_MAIL_WORKER is not true', () => {
      const disabledConfig = new ConfigService({ TICKET_MAIL_WORKER: 'false' });
      const disabledService = new TicketDeliveryService(
        db,
        projection,
        mail,
        disabledConfig,
      );
      const drainSpy = vi.spyOn(disabledService, 'drain');

      disabledService.onModuleInit();
      expect(drainSpy).not.toHaveBeenCalled();
    });

    it('does not start timer if mail transport is not ready', () => {
      const unreadyMail = { ready: false, send: vi.fn() } as any;
      const unreadyService = new TicketDeliveryService(
        db,
        projection,
        unreadyMail,
        config,
      );
      const drainSpy = vi.spyOn(unreadyService, 'drain');

      unreadyService.onModuleInit();
      expect(drainSpy).not.toHaveBeenCalled();
    });

    it('starts timer and invokes drain immediately when enabled and ready', async () => {
      const drainSpy = vi.spyOn(service, 'drain').mockResolvedValue(undefined);

      service.onModuleInit();
      expect(drainSpy).toHaveBeenCalledTimes(1);

      await service.onModuleDestroy();
    });
  });

  describe('resend', () => {
    it('rejects invalid or missing requestId', async () => {
      await expect(service.resend(ORDER_ID, USER_ID, null)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.resend(ORDER_ID, USER_ID, { requestId: 'not-a-uuid' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.resend(ORDER_ID, USER_ID, { requestId: 12345 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when order has no valid tickets with QR payload', async () => {
      projection.forOwner.mockResolvedValue({
        tickets: [{ ticketId: 't1', qrPayload: null, status: 'CANCELLED' }],
      });

      await expect(
        service.resend(ORDER_ID, USER_ID, { requestId: VALID_REQUEST_ID }),
      ).rejects.toThrow('Đơn không còn vé hợp lệ để gửi.');
    });

    it('rejects with 503 if mail service is unavailable or worker disabled', async () => {
      projection.forOwner.mockResolvedValue({
        tickets: [
          { ticketId: 't1', qrPayload: 'ET1.test.qr', status: 'VALID' },
        ],
      });

      const unreadyService = new TicketDeliveryService(
        db,
        projection,
        { ready: false, send: vi.fn() } as any,
        config,
      );

      await expect(
        unreadyService.resend(ORDER_ID, USER_ID, {
          requestId: VALID_REQUEST_ID,
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('is idempotent when the same requestId is submitted again for the same order', async () => {
      projection.forOwner.mockResolvedValue({
        tickets: [
          { ticketId: 't1', qrPayload: 'ET1.test.qr', status: 'VALID' },
        ],
      });

      db.ticketMailDelivery.findUnique.mockResolvedValue({
        id: 'delivery-existing-1',
        orderId: ORDER_ID,
        status: 'QUEUED',
      });

      const result = await service.resend(ORDER_ID, USER_ID, {
        requestId: VALID_REQUEST_ID,
      });

      expect(result).toEqual({
        deliveryId: 'delivery-existing-1',
        status: 'QUEUED',
      });
      expect(db.ticketMailDelivery.create).not.toHaveBeenCalled();
    });

    it('rejects when the same requestId was previously used for a different order', async () => {
      projection.forOwner.mockResolvedValue({
        tickets: [
          { ticketId: 't1', qrPayload: 'ET1.test.qr', status: 'VALID' },
        ],
      });

      db.ticketMailDelivery.findUnique.mockResolvedValue({
        id: 'delivery-other',
        orderId: 'different-order-id',
        status: 'QUEUED',
      });

      await expect(
        service.resend(ORDER_ID, USER_ID, { requestId: VALID_REQUEST_ID }),
      ).rejects.toThrow('Mã yêu cầu đã được dùng cho đơn khác.');
    });

    it('enforces rate limit of maximum 3 resend requests per minute', async () => {
      projection.forOwner.mockResolvedValue({
        tickets: [
          { ticketId: 't1', qrPayload: 'ET1.test.qr', status: 'VALID' },
        ],
      });

      db.ticketMailDelivery.findUnique.mockResolvedValue(null);
      db.$queryRaw.mockResolvedValue([{ count: 3 }]);

      await expect(
        service.resend(ORDER_ID, USER_ID, { requestId: VALID_REQUEST_ID }),
      ).rejects.toThrow(HttpException);
    });

    it('creates a new delivery job if requestId is fresh and under rate limit', async () => {
      projection.forOwner.mockResolvedValue({
        tickets: [
          { ticketId: 't1', qrPayload: 'ET1.test.qr', status: 'VALID' },
        ],
      });

      db.ticketMailDelivery.findUnique.mockResolvedValue(null);
      db.$queryRaw.mockResolvedValue([{ count: 1 }]);
      db.ticketMailDelivery.create.mockResolvedValue({
        id: 'delivery-new-1',
        status: 'QUEUED',
      });

      const result = await service.resend(ORDER_ID, USER_ID, {
        requestId: VALID_REQUEST_ID,
      });

      expect(result).toEqual({
        deliveryId: 'delivery-new-1',
        status: 'QUEUED',
      });
      expect(db.ticketMailDelivery.create).toHaveBeenCalledWith({
        data: {
          orderId: ORDER_ID,
          dedupeKey: `resend:${USER_ID}:${VALID_REQUEST_ID.toLowerCase()}`,
          notification: { kind: 'OWNER_TICKETS', ownerId: USER_ID },
        },
      });
    });
  });

  describe('failures (administrator view)', () => {
    it('returns up to 50 FAILED delivery jobs with safe fields', async () => {
      const mockFailures = [
        {
          id: 'del-1',
          orderId: ORDER_ID,
          attempts: 3,
          failureCode: 'RETRY_EXHAUSTED',
          updatedAt: new Date(),
        },
      ];
      db.ticketMailDelivery.findMany.mockResolvedValue(mockFailures);

      const result = await service.failures();

      expect(result).toEqual(mockFailures);
      expect(db.ticketMailDelivery.findMany).toHaveBeenCalledWith({
        where: { status: 'FAILED' },
        select: {
          id: true,
          orderId: true,
          attempts: true,
          failureCode: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 50,
      });
    });
  });

  describe('drain & delivery worker', () => {
    it('recovers expired leases on final attempt by transitioning them to FAILED', async () => {
      db.$queryRaw.mockResolvedValue([]);

      await service.drain();

      expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('cancels job if order is missing or not PAID', async () => {
      const mockClaim = {
        id: 'job-1',
        orderId: ORDER_ID,
        attempts: 1,
        leaseToken: 'token-123',
      };
      db.$queryRaw.mockResolvedValueOnce([mockClaim]).mockResolvedValue([]);
      db.order.findUnique.mockResolvedValue({
        userId: USER_ID,
        status: 'PENDING_PAYMENT',
        user: { email: 'buyer@example.com' },
      });

      await service.drain();

      expect(db.ticketMailDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-1', leaseToken: 'token-123', status: 'SENDING' },
        data: {
          status: 'CANCELLED',
          leaseToken: null,
          leaseUntil: null,
          failureCode: 'ORDER_NOT_PAID',
        },
      });
    });

    it('cancels job if order has no valid tickets with QR payload', async () => {
      const mockClaim = {
        id: 'job-2',
        orderId: ORDER_ID,
        attempts: 1,
        leaseToken: 'token-123',
      };
      db.$queryRaw.mockResolvedValueOnce([mockClaim]).mockResolvedValue([]);
      db.order.findUnique.mockResolvedValue({
        userId: USER_ID,
        status: 'PAID',
        user: { email: 'buyer@example.com' },
      });
      projection.forOwner.mockResolvedValue({
        tickets: [{ ticketId: 't1', qrPayload: null, status: 'CANCELLED' }],
      });

      await service.drain();

      expect(db.ticketMailDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-2', leaseToken: 'token-123', status: 'SENDING' },
        data: {
          status: 'CANCELLED',
          leaseToken: null,
          leaseUntil: null,
          failureCode: 'NO_VALID_TICKETS',
        },
      });
    });

    it('delivers 3 tickets with inline QR images and no payment information', async () => {
      const mockClaim = {
        id: 'job-3',
        orderId: ORDER_ID,
        attempts: 1,
        leaseToken: 'token-123',
      };
      db.$queryRaw.mockResolvedValueOnce([mockClaim]).mockResolvedValue([]);
      db.order.findUnique.mockResolvedValue({
        userId: USER_ID,
        status: 'PAID',
        user: { email: 'buyer@example.com' },
      });

      const tickets = [
        {
          ticketId: 't-11111111-ec16-43bf-b58f-287968560181',
          eventName: 'Đêm Nhạc Cổ Điển',
          showtimeStart: '2026-12-01T19:30:00.000Z',
          category: 'VIP',
          seatLabel: 'A-1',
          qrPayload: 'ET1.Ed25519.test.sig1',
          status: 'VALID',
        },
        {
          ticketId: 't-22222222-ec16-43bf-b58f-287968560182',
          eventName: 'Đêm Nhạc Cổ Điển',
          showtimeStart: '2026-12-01T19:30:00.000Z',
          category: 'VIP',
          seatLabel: 'A-2',
          qrPayload: 'ET1.Ed25519.test.sig2',
          status: 'VALID',
        },
        {
          ticketId: 't-33333333-ec16-43bf-b58f-287968560183',
          eventName: 'Đêm Nhạc Cổ Điển',
          showtimeStart: '2026-12-01T19:30:00.000Z',
          category: 'Standard',
          seatLabel: 'B-1',
          qrPayload: 'ET1.Ed25519.test.sig3',
          status: 'VALID',
        },
      ];
      projection.forOwner.mockResolvedValue({ tickets });

      await service.drain();

      expect(mail.send).toHaveBeenCalledTimes(1);
      const mailCall = mail.send.mock.calls[0][0];

      // AC1 & Recipient
      expect(mailCall.to).toBe('buyer@example.com');
      expect(mailCall.subject).toContain('Vé điện tử — Đêm Nhạc Cổ Điển');
      expect(mailCall.messageId).toBe(`<ticket-job-3@thudemo.local>`);

      // 3 QR attachments with image/png and content-id
      expect(mailCall.attachments).toHaveLength(3);
      expect(mailCall.attachments[0]).toMatchObject({
        filename: 've-t-11111111-ec16-43bf-b58f-287968560181.png',
        contentType: 'image/png',
        cid: 'qr-t-11111111-ec16-43bf-b58f-287968560181',
      });
      expect(mailCall.html).toContain(
        'cid:qr-t-11111111-ec16-43bf-b58f-287968560181',
      );

      // NFR: NO payment details
      const combinedEmail = `${mailCall.subject} ${mailCall.text} ${mailCall.html}`;
      expect(combinedEmail).not.toMatch(/gateway/i);
      expect(combinedEmail).not.toMatch(/amount/i);
      expect(combinedEmail).not.toMatch(/vnđ|vnd/i);
      expect(combinedEmail).not.toMatch(/card/i);
      expect(combinedEmail).not.toMatch(/bank/i);
      expect(combinedEmail).not.toMatch(/token/i);
      expect(combinedEmail).not.toMatch(/transaction/i);

      // Sent status updated
      expect(db.ticketMailDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-3', leaseToken: 'token-123', status: 'SENDING' },
        data: expect.objectContaining({
          status: 'SENT',
          failureCode: null,
          leaseToken: null,
          leaseUntil: null,
        }),
      });
    });

    it('schedules retry with +5s backoff after attempt 1 failure', async () => {
      const mockClaim = {
        id: 'job-fail-1',
        orderId: ORDER_ID,
        attempts: 1,
        leaseToken: 'token-123',
      };
      db.$queryRaw.mockResolvedValueOnce([mockClaim]).mockResolvedValue([]);
      db.order.findUnique.mockResolvedValue({
        userId: USER_ID,
        status: 'PAID',
        user: { email: 'buyer@example.com' },
      });
      projection.forOwner.mockResolvedValue({
        tickets: [{ ticketId: 't1', qrPayload: 'ET1.qr', status: 'VALID' }],
      });
      mail.send.mockRejectedValue(new Error('SMTP connection timed out'));

      const before = Date.now();
      await service.drain();

      expect(db.ticketMailDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-fail-1', leaseToken: 'token-123', status: 'SENDING' },
        data: expect.objectContaining({
          status: 'QUEUED',
          failureCode: 'DELIVERY_RETRY',
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt: expect.any(Date),
        }),
      });

      const updatedData =
        db.ticketMailDelivery.updateMany.mock.calls[0][0].data;
      const scheduledDiff = updatedData.nextAttemptAt.getTime() - before;
      expect(scheduledDiff).toBeGreaterThanOrEqual(4500);
      expect(scheduledDiff).toBeLessThanOrEqual(5500);
    });

    it('schedules retry with +15s backoff after attempt 2 failure', async () => {
      const mockClaim = {
        id: 'job-fail-2',
        orderId: ORDER_ID,
        attempts: 2,
        leaseToken: 'token-123',
      };
      db.$queryRaw.mockResolvedValueOnce([mockClaim]).mockResolvedValue([]);
      db.order.findUnique.mockResolvedValue({
        userId: USER_ID,
        status: 'PAID',
        user: { email: 'buyer@example.com' },
      });
      projection.forOwner.mockResolvedValue({
        tickets: [{ ticketId: 't1', qrPayload: 'ET1.qr', status: 'VALID' }],
      });
      mail.send.mockRejectedValue(new Error('SMTP connection timed out'));

      const before = Date.now();
      await service.drain();

      const updatedData =
        db.ticketMailDelivery.updateMany.mock.calls[0][0].data;
      expect(updatedData.status).toBe('QUEUED');
      expect(updatedData.failureCode).toBe('DELIVERY_RETRY');
      const scheduledDiff = updatedData.nextAttemptAt.getTime() - before;
      expect(scheduledDiff).toBeGreaterThanOrEqual(14500);
      expect(scheduledDiff).toBeLessThanOrEqual(15500);
    });

    it('marks terminal failure FAILED with RETRY_EXHAUSTED after attempt 3', async () => {
      const mockClaim = {
        id: 'job-fail-3',
        orderId: ORDER_ID,
        attempts: 3,
        leaseToken: 'token-123',
      };
      db.$queryRaw.mockResolvedValueOnce([mockClaim]).mockResolvedValue([]);
      db.order.findUnique.mockResolvedValue({
        userId: USER_ID,
        status: 'PAID',
        user: { email: 'buyer@example.com' },
      });
      projection.forOwner.mockResolvedValue({
        tickets: [{ ticketId: 't1', qrPayload: 'ET1.qr', status: 'VALID' }],
      });
      mail.send.mockRejectedValue(new Error('Permanent SMTP rejection 550'));

      await service.drain();

      expect(db.ticketMailDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'job-fail-3', leaseToken: 'token-123', status: 'SENDING' },
        data: expect.objectContaining({
          status: 'FAILED',
          failureCode: 'RETRY_EXHAUSTED',
          leaseToken: null,
          leaseUntil: null,
        }),
      });
    });
  });
});
