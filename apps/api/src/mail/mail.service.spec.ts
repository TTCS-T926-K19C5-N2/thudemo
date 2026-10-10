import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MailService, OrderEmailData } from './mail.service.js';

describe('MailService', () => {
  let service: MailService;
  const mockPrisma = {
    emailLog: {
      create: vi.fn(),
    },
  };
  const mockConfig = {
    get: vi.fn().mockImplementation((key: string) => {
      if (key === 'SMTP_HOST') return undefined; // local jsonTransport
      if (key === 'SMTP_FROM') return 'test@ticketing.local';
      return undefined;
    }),
  };

  const sampleOrder: OrderEmailData = {
    id: '11111111-1111-4111-8111-111111111111',
    customerEmail: 'buyer@example.com',
    totalAmount: 500000,
    eventName: 'Concert Âm Nhạc Mùa Thu',
    showtimeDate: new Date('2026-11-20T19:30:00Z'),
    location: 'Nhà hát Lớn Hà Nội',
    tickets: [
      {
        id: 'ticket-1',
        ticketCode: 'TKT-TEST1',
        seatRow: 'A',
        seatNumber: 1,
        categoryName: 'VIP',
        price: 500000,
        qrCodeData: JSON.stringify({ ticketCode: 'TKT-TEST1' }),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.emailLog.create.mockResolvedValue({ id: 'log-1' });
    service = new MailService(mockPrisma as any, mockConfig as any);
  });

  describe('generateQrCode', () => {
    it('generates a valid base64 dataUrl and Buffer for QR code', async () => {
      const result = await service.generateQrCode('TKT-SAMPLE-123');
      expect(result.dataUrl).toContain('data:image/png;base64,');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
    });
  });

  describe('sendTicketEmail', () => {
    it('successfully sends email and logs SENT status on first attempt', async () => {
      const result = await service.sendTicketEmail(sampleOrder, 'buyer@example.com');
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: sampleOrder.id,
          recipient: 'buyer@example.com',
          status: 'SENT',
          attempts: 1,
        }),
      });
    });

    it('retries up to 3 times on failure and records FAILED status if all fail', async () => {
      // Mock transporter sendMail to fail
      const sendMailSpy = vi
        // @ts-expect-error accessing private transporter
        .spyOn(service.transporter, 'sendMail')
        .mockRejectedValue(new Error('SMTP Connection Refused'));

      const result = await service.sendTicketEmail(sampleOrder, 'buyer@example.com');

      expect(sendMailSpy).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.error).toContain('Gửi email thất bại sau 3 lần thử');

      expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: sampleOrder.id,
          recipient: 'buyer@example.com',
          status: 'FAILED',
          attempts: 3,
          lastError: expect.stringContaining('SMTP Connection Refused'),
        }),
      });
    });

    it('succeeds on 2nd attempt if first attempt fails', async () => {
      const sendMailSpy = vi
        // @ts-expect-error accessing private transporter
        .spyOn(service.transporter, 'sendMail')
        .mockRejectedValueOnce(new Error('Temporary Network Glitch'))
        .mockResolvedValueOnce({ messageId: 'msg-success-attempt-2' } as any);

      const result = await service.sendTicketEmail(sampleOrder, 'buyer@example.com');

      expect(sendMailSpy).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(mockPrisma.emailLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: sampleOrder.id,
          status: 'SENT',
          attempts: 2,
        }),
      });
    });
  });
});
