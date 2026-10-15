import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { TicketEmailScheduler } from './ticket-email.scheduler.js';

function makeScheduler(opts: {
  candidates: { id: string }[];
  sendResult?: { sent: boolean; attempts: number };
  mode?: string;
}) {
  const prisma: any = {
    order: { findMany: vi.fn().mockResolvedValue(opts.candidates) },
  };
  const ticketEmail: any = {
    sendTicketsForPaidOrderSystem: vi
      .fn()
      .mockResolvedValue(opts.sendResult ?? { sent: true, attempts: 1 }),
  };
  const config = new ConfigService({ TICKET_EMAIL_MODE: opts.mode ?? 'off' });
  const scheduler = new TicketEmailScheduler(prisma, ticketEmail, config);
  return { scheduler, prisma, ticketEmail };
}

describe('TicketEmailScheduler (S-27 AC1 automatic delivery)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries only PAID orders with no SENT or FAILED email log', async () => {
    const { scheduler, prisma } = makeScheduler({ candidates: [] });

    await scheduler.runBatch();

    const args = prisma.order.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('PAID');
    expect(args.where.emailLogs).toEqual({
      none: { status: { in: ['SENT', 'FAILED'] } },
    });
    expect(args.take).toBeGreaterThan(0);
  });

  it('sends tickets for each eligible PAID order', async () => {
    const { scheduler, ticketEmail } = makeScheduler({
      candidates: [{ id: 'o1' }, { id: 'o2' }],
    });

    const sent = await scheduler.runBatch();

    expect(sent).toBe(2);
    expect(ticketEmail.sendTicketsForPaidOrderSystem).toHaveBeenCalledWith('o1');
    expect(ticketEmail.sendTicketsForPaidOrderSystem).toHaveBeenCalledWith('o2');
  });

  it('the scan query excludes orders that already have a FAILED row (AC2: 3 attempts total)', async () => {
    // Unit-level check of the selection rule only. The real "not picked up again"
    // behaviour is verified against PostgreSQL, because the mock returns what it is told.
    const { scheduler, prisma } = makeScheduler({ candidates: [] });

    await scheduler.runBatch();

    const args = prisma.order.findMany.mock.calls[0][0];
    expect(args.where.emailLogs.none.status.in).toContain('FAILED');
  });

  it('does not count a failed send as delivered', async () => {
    const { scheduler } = makeScheduler({
      candidates: [{ id: 'o1' }],
      sendResult: { sent: false, attempts: 3 },
    });

    expect(await scheduler.runBatch()).toBe(0);
  });

  it('does not send again while a scan is still running (no duplicate scans)', async () => {
    const { scheduler, prisma } = makeScheduler({ candidates: [] });

    const a = scheduler.tick();
    const b = scheduler.tick();

    expect(a).toBe(b);
    await a;
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
  });

  it('is disabled by default (TICKET_EMAIL_MODE off) so no timer starts', () => {
    const { scheduler, prisma } = makeScheduler({ candidates: [], mode: 'off' });

    scheduler.onModuleInit();

    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown mode', () => {
    const { scheduler } = makeScheduler({ candidates: [], mode: 'bogus' });

    expect(() => scheduler.onModuleInit()).toThrow(/TICKET_EMAIL_MODE/);
  });
});
