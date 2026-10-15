import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { MAIL_MAX_ATTEMPTS } from './mail.service.js';
import { TicketEmailService } from './ticket-email.service.js';

export const TICKET_EMAIL_BATCH_SIZE = 20;

// Automatic ticket delivery (S-27 AC1): every PAID order that has no SENT email
// yet gets its tickets emailed within one scan interval (default 15s).
// An order is retried by later scans until it has MAIL_MAX_ATTEMPTS FAILED records.
// Enabled with TICKET_EMAIL_MODE=api; off by default so tests and CI never send mail.
@Injectable()
export class TicketEmailScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly logger = new Logger(TicketEmailScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketEmail: TicketEmailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const mode = this.config.get<string>('TICKET_EMAIL_MODE') ?? 'off';
    if (!['off', 'api'].includes(mode)) {
      throw new Error('TICKET_EMAIL_MODE must be off or api');
    }
    if (mode === 'off') return;

    const intervalSec = parseInt(
      this.config.get<string>('TICKET_EMAIL_INTERVAL_SECONDS') ?? '15',
      10,
    );
    const intervalMs = Math.max(1, intervalSec) * 1000;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  tick(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.runBatch()
      .then(() => undefined)
      .catch((err) => {
        this.logger.error(
          JSON.stringify({
            event: 'ticket_email_job_failed',
            message: err instanceof Error ? err.message : String(err),
            retryOnNextInterval: true,
          }),
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  // Selects PAID orders without a SENT log and with fewer than MAX FAILED logs.
  // The send itself is idempotent per scan because a SENT row is written before
  // the next scan can select the order again.
  async runBatch(): Promise<number> {
    const candidates = await this.prisma.order.findMany({
      where: {
        status: 'PAID',
        emailLogs: { none: { status: 'SENT' } },
      },
      select: { id: true, emailLogs: { select: { status: true } } },
      orderBy: { createdAt: 'asc' },
      take: TICKET_EMAIL_BATCH_SIZE,
    });

    let sent = 0;
    for (const order of candidates) {
      const failed = order.emailLogs.filter((l) => l.status === 'FAILED').length;
      if (failed >= MAIL_MAX_ATTEMPTS) continue;
      const result = await this.ticketEmail.sendTicketsForPaidOrderSystem(order.id);
      if (result.sent) sent += 1;
    }
    return sent;
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.running) await this.running;
  }
}

