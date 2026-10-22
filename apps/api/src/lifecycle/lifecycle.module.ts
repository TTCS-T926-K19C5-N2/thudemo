import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Header,
  HttpCode,
  HttpException,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ROLE_NAMES } from '../auth/roles.js';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailModule } from '../mail/mail.module.js';
import { MailService } from '../mail/mail.service.js';
import { CancellationsService } from './cancellations.service.js';
import { ReportsService } from './reports.service.js';
import { PrivacyService } from './privacy.service.js';
import { metrics } from '../monitoring/metrics.js';

@Injectable()
class PolicyGuard implements CanActivate {
  constructor(private readonly privacy: PrivacyService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      !process.env.SERVICE_POLICY_VERSION ||
      !req.user ||
      req.path.startsWith('/privacy/') ||
      ['/auth/me', '/auth/logout'].includes(req.path)
    )
      return true;
    if ((await this.privacy.state(req.user.id)).requiresAcceptance)
      throw new HttpException(
        {
          code: 'CONSENT_REQUIRED',
          message: 'Vui lòng xác nhận phiên bản thông báo mới.',
          path: '/account/privacy',
        },
        428,
      );
    return true;
  }
}
@Controller()
class LifecycleController {
  constructor(
    private readonly cancel: CancellationsService,
    private readonly reports: ReportsService,
    private readonly privacy: PrivacyService,
    private readonly db: PrismaService,
  ) {}
  @Get('orders/:id/cancellation')
  @Header('Cache-Control', 'private, no-store')
  @Roles('BUYER')
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cancel.preview(id, req.user);
  }
  @Post('orders/:id/cancel')
  @HttpCode(200)
  @Roles('BUYER')
  cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cancel.cancel(id, req.user);
  }
  @Post('showtimes/:id/cancel')
  @HttpCode(200)
  @Roles('ADMIN', 'ORGANIZER')
  cancelShow(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body('reason') reason: unknown,
  ) {
    return this.cancel.cancelShow(id, req.user, reason);
  }
  @Get('showtimes/:id/cancellation')
  @Header('Cache-Control', 'private, no-store')
  @Roles('ADMIN', 'ORGANIZER')
  async showStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.reports.owner(id, req.user);
    return {
      job: await this.db.showtimeCancellation.findUnique({
        where: { showtimeId: id },
      }),
      refunds: await this.db.refund.groupBy({
        by: ['status'],
        where: {
          orderId: {
            in: (
              await this.db.order.findMany({
                where: { showtimeId: id },
                select: { id: true },
              })
            ).map((o) => o.id),
          },
        },
        _count: true,
      }),
    };
  }
  @Post('showtimes/:id/cancellation/retry')
  @HttpCode(200)
  @Roles('ADMIN', 'ORGANIZER')
  async retryShow(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.reports.owner(id, req.user);
    await this.db.showtimeCancellation.updateMany({
      where: { showtimeId: id, status: 'FAILED' },
      data: { status: 'QUEUED', failureCode: null },
    });
    return { message: 'Đã xếp lịch thử lại lô lỗi.' };
  }
  @Get('operations/refunds')
  @Header('Cache-Control', 'private, no-store')
  @Roles('ADMIN', 'ACCOUNTANT')
  async refunds() {
    return {
      refunds: await this.db.refund.findMany({
        where: { status: { in: ['FAILED', 'UNKNOWN'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  }
  @Post('operations/refunds/:id/resolve-mock')
  @HttpCode(200)
  @Roles('ADMIN', 'ACCOUNTANT')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cancel.resolveMockFailure(id, req.user);
  }
  @Get('orders/:id/audit')
  @Header('Cache-Control', 'private, no-store')
  @Roles('BUYER', 'ADMIN', 'ACCOUNTANT')
  async timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return { events: await this.reports.timeline(id, req.user) };
  }
  @Get('showtimes/:id/attendance-report')
  @Header('Cache-Control', 'private, no-store')
  @Roles('ADMIN', 'ORGANIZER')
  attendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reports.attendance(id, req.user);
  }
  @Get('showtimes/:id/financial-report')
  @Header('Cache-Control', 'private, no-store')
  @Roles('ADMIN', 'ORGANIZER')
  financial(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reports.financial(id, req.user);
  }
  @Post('operations/reconciliation')
  @HttpCode(200)
  @Roles('ADMIN', 'ACCOUNTANT')
  reconcile(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.reports.reconcile(body, req.user);
  }
  @Get('operations/reconciliation')
  @Header('Cache-Control', 'private, no-store')
  @Roles('ADMIN', 'ACCOUNTANT')
  async reconciliationHistory() {
    return {
      runs: await this.db.reconciliationRun.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    };
  }
  @Get('privacy/me')
  @Header('Cache-Control', 'private, no-store')
  @Roles(...ROLE_NAMES)
  state(@Req() req: AuthenticatedRequest) {
    return this.privacy.state(req.user.id);
  }
  @Post('privacy/consent')
  @HttpCode(200)
  @Roles(...ROLE_NAMES)
  consent(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.privacy.consent(req.user.id, body);
  }
  @Post('privacy/erasure')
  @HttpCode(200)
  @Roles(...ROLE_NAMES)
  erasure(@Req() req: AuthenticatedRequest) {
    return this.privacy.requestErasure(req.user.id);
  }
  @Get('operations/erasure')
  @Header('Cache-Control', 'private, no-store')
  @Roles('ADMIN')
  async erasureList() {
    return {
      requests: await this.db.erasureRequest.findMany({
        where: { status: 'REQUESTED' },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
    };
  }
  @Post('privacy/erasure/:id/approve')
  @HttpCode(200)
  @Roles('ADMIN')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.privacy.approveErasure(id, req.user.id);
  }
}
@Injectable()
export class LifecycleWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private flight?: Promise<void>;
  private readonly logger = new Logger(LifecycleWorker.name);
  constructor(
    private readonly db: PrismaService,
    private readonly cancel: CancellationsService,
    private readonly mail: MailService,
  ) {}
  onModuleInit() {
    if (
      process.env.LIFECYCLE_WORKER === 'off' ||
      ['production'].includes(process.env.APP_ENV ?? process.env.NODE_ENV ?? '')
    )
      return;
    this.timer = setInterval(() => void this.drain(), 2000);
    this.timer.unref();
    metrics.safe(() => metrics.producer.set({ subsystem: 'refund_job' }, 1));
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flight;
  }
  async drain() {
    if (this.flight) return this.flight;
    this.flight = (async () => {
      await this.cancel.processShowBatch();
      await this.cancel.processRefundBatch();
      await this.deliverCancellationMail();
    })()
      .catch(() => {
        this.logger.warn(
          'Lifecycle job deferred; inspect operation status without exposing provider payloads.',
        );
      })
      .finally(() => {
        this.flight = undefined;
      });
    return this.flight;
  }
  private async deliverCancellationMail() {
    if (!this.mail.ready) return;
    await this.db.operationMail.updateMany({
      where: {
        status: 'SENDING',
        attempts: { gte: 3 },
        leaseUntil: { lte: new Date() },
      },
      data: { status: 'FAILED', leaseUntil: null, leaseToken: null },
    });
    for (let i = 0; i < 5; i++) {
      const token = randomUUID();
      const [job] = await this.db.$queryRaw<
        { id: string; orderId: string; attempts: number }[]
      >`WITH candidate AS (
        SELECT id FROM operation_mail WHERE attempts<3 AND ((status='QUEUED' AND "nextAttemptAt"<=clock_timestamp()) OR (status='SENDING' AND "leaseUntil"<=clock_timestamp())) ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE operation_mail m SET status='SENDING',attempts=m.attempts+1,"leaseToken"=${token}::uuid,"leaseUntil"=clock_timestamp()+interval '60 seconds' FROM candidate WHERE m.id=candidate.id RETURNING m.id,m."orderId",m.attempts`;
      if (!job) break;
      const where = { id: job.id, leaseToken: token, status: 'SENDING' };
      try {
        const order = await this.db.order.findUniqueOrThrow({
          where: { id: job.orderId },
          include: { user: true, showtime: { include: { event: true } } },
        });
        if (!order.user.isActive) {
          await this.db.operationMail.updateMany({
            where,
            data: { status: 'CANCELLED', leaseToken: null, leaseUntil: null },
          });
          continue;
        }
        await this.mail.send({
          to: order.user.email,
          subject: 'Thông báo huỷ suất diễn',
          messageId: `<show-cancel-${job.id}@codegym.local>`,
          text: `Suất diễn ${order.showtime.event.name} đã bị huỷ. Vé trong đơn ${order.id} không còn hiệu lực. Đơn được hoàn 100% qua cổng giả lập của môi trường demo; không có giao dịch tiền thật. Bạn có thể theo dõi trạng thái trong tài khoản.`,
        });
        await this.db.operationMail.updateMany({
          where,
          data: {
            status: 'SENT',
            sentAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
          },
        });
      } catch {
        await this.db.operationMail.updateMany({
          where,
          data: {
            status: job.attempts >= 3 ? 'FAILED' : 'QUEUED',
            nextAttemptAt: new Date(
              Date.now() + 5000 * 3 ** (job.attempts - 1),
            ),
            leaseToken: null,
            leaseUntil: null,
          },
        });
      }
    }
  }
}
@Module({
  imports: [MailModule],
  controllers: [LifecycleController],
  providers: [
    CancellationsService,
    ReportsService,
    PrivacyService,
    LifecycleWorker,
    { provide: APP_GUARD, useClass: PolicyGuard },
  ],
})
export class LifecycleModule {}
