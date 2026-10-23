import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Refund } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { SeatEventsService } from '../showtimes/seat-events.service.js';
import { MockRefundGateway } from './mock-refund.gateway.js';
import type { AuthenticatedUser } from '../auth/guards/session-auth.guard.js';

export const DEMO_CANCELLATION_POLICY = {
  version: 'local-demo-24h-100-v1',
  cutoffHours: 24,
  refundPercent: 100,
  scope: 'WHOLE_ORDER',
  gateway: 'mock',
  releaseSeats: 'ON_CANCELLATION',
} as const;
export function assertCancellationWindow(
  start: Date,
  now: Date,
  checkedIn: boolean,
) {
  if (checkedIn)
    throw new ConflictException('Đơn có vé đã soát, không thể huỷ.');
  if (start.getTime() - now.getTime() < 24 * 3600000)
    throw new ConflictException(
      'Đã quá hạn huỷ: phải trước giờ diễn ít nhất 24 giờ.',
    );
}
@Injectable()
export class CancellationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly seats: SeatEventsService,
    private readonly config: ConfigService,
  ) {}
  private enabled() {
    if (
      this.config.get('NODE_ENV') === 'production' ||
      this.config.get('APP_ENV') === 'production'
    )
      throw new ForbiddenException(
        'Hoàn tiền giả lập chỉ dành cho local/sandbox.',
      );
  }
  async preview(orderId: string, actor: AuthenticatedUser) {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: {
        showtime: true,
        items: true,
        payments: { where: { status: 'SUCCEEDED' } },
      },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn.');
    if (order.userId !== actor.id)
      throw new ForbiddenException('Không có quyền truy cập đơn.');
    const existing = await this.db.refund.findUnique({ where: { orderId } });
    let unavailable: string | null = null;
    try {
      this.enabled();
      if (order.status !== 'PAID')
        throw new ConflictException('Chỉ huỷ đơn đã thanh toán.');
      if (
        !order.payments.length ||
        order.payments.some((p) => p.gateway !== 'mock')
      )
        throw new ConflictException(
          'Chỉ hoàn tiền các giao dịch mock; chưa hỗ trợ hoàn tiền nhà cung cấp thật.',
        );
      assertCancellationWindow(
        order.showtime.startTime,
        new Date(),
        order.items.some((i) => !!i.checkedInAt),
      );
    } catch (e) {
      unavailable = e instanceof Error ? e.message : 'Không thể huỷ.';
    }
    return {
      policy: DEMO_CANCELLATION_POLICY,
      orderId,
      amount: order.totalAmount,
      eligible: !unavailable,
      unavailable,
      refund: existing,
    };
  }
  async cancel(
    orderId: string,
    actor: AuthenticatedUser,
    showCancellation = false,
  ) {
    this.enabled();
    const initial = await this.db.order.findUnique({
      where: { id: orderId },
      select: { showtimeId: true, userId: true },
    });
    if (!initial) throw new NotFoundException('Không tìm thấy đơn.');
    if (!showCancellation && initial.userId !== actor.id)
      throw new ForbiddenException('Không có quyền huỷ đơn này.');
    const refund = await this.db.$transaction(async (tx) => {
      const [show] = await tx.$queryRaw<
        { startTime: Date; status: string; now: Date }[]
      >`SELECT "startTime",status,clock_timestamp() AS now FROM showtimes WHERE id=${initial.showtimeId}::uuid FOR SHARE`;
      await tx.$queryRaw`SELECT set_config('app.actor_id',${actor.id},true)`;
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true, payments: { where: { status: 'SUCCEEDED' } } },
      });
      const existing = await tx.refund.findUnique({ where: { orderId } });
      if (existing) return existing;
      if (showCancellation) {
        const job = await tx.showtimeCancellation.findUnique({
          where: { showtimeId: initial.showtimeId },
        });
        if (
          !job ||
          job.actorId !== actor.id ||
          !actor.roles.some((r) => ['ADMIN', 'ORGANIZER'].includes(r))
        )
          throw new ForbiddenException('Không có lệnh huỷ suất hợp lệ.');
      }
      if (order.status !== 'PAID')
        throw new ConflictException('Chỉ huỷ đơn đã thanh toán.');
      if (
        !order.payments.length ||
        order.payments.some((p) => p.gateway !== 'mock') ||
        order.payments.reduce((n, p) => n + p.amount, 0) < order.totalAmount
      )
        throw new ConflictException(
          'Chỉ hoàn tiền giao dịch mock đã xác nhận đủ tiền.',
        );
      if (!showCancellation)
        assertCancellationWindow(
          show.startTime,
          show.now,
          order.items.some((i) => !!i.checkedInAt),
        );
      const seatIds = order.items.map((i) => i.seatId).sort();
      if (seatIds.length)
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM seats WHERE id IN (${Prisma.join(seatIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
        );
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });
      await tx.ticket.updateMany({
        where: { orderId },
        data: { status: 'CANCELLED', cancelledAt: show.now },
      });
      if (order.holdSessionId && order.holdToken)
        await tx.seatHold.deleteMany({
          where: { holdSessionId: order.holdSessionId, token: order.holdToken },
        });
      // Old cancellation callbacks must never release another buyer's sold seat.
      const releasedCount = await tx.$executeRaw`UPDATE seats s SET "isSold"=false WHERE s.id IN (SELECT "seatId" FROM order_items WHERE "orderId"=${orderId}::uuid)
        AND NOT EXISTS(SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi."orderId" WHERE oi."seatId"=s.id AND o.status IN ('PAID','NEEDS_REVIEW'))`;
      if (releasedCount > 0) {
        const waiting = await tx.waitlistEntry.count({
          where: { showtimeId: initial.showtimeId, status: 'ACTIVE' },
        });
        if (waiting > 0)
          await tx.waitlistAvailabilitySignal.create({
            data: { showtimeId: initial.showtimeId, releasedCount },
          });
      }
      const result = await tx.refund.create({
        data: {
          orderId,
          amount: order.totalAmount,
          actorId: actor.id,
          reason: showCancellation
            ? 'SHOWTIME_CANCELLED'
            : DEMO_CANCELLATION_POLICY.version,
        },
      });
      if (showCancellation)
        await tx.operationMail.upsert({
          where: { orderId },
          create: { orderId },
          update: {},
        });
      return result;
    });
    this.seats.invalidate(initial.showtimeId);
    return {
      refund,
      message:
        'Đơn và vé đã huỷ. Ghế đã được trả kho. Hoàn tiền giả lập đang được xử lý.',
    };
  }
  async cancelShow(
    showtimeId: string,
    actor: AuthenticatedUser,
    reason: unknown,
  ) {
    this.enabled();
    if (
      typeof reason !== 'string' ||
      reason.trim().length < 5 ||
      reason.length > 500
    )
      throw new BadRequestException('Nhập lý do huỷ từ 5 đến 500 ký tự.');
    const job = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM showtimes WHERE id=${showtimeId}::uuid FOR UPDATE`;
      const show = await tx.showtime.findUnique({
        where: { id: showtimeId },
        include: { event: true },
      });
      if (!show) throw new NotFoundException('Không tìm thấy suất.');
      if (!actor.roles.includes('ADMIN') && show.event.organizerId !== actor.id)
        throw new ForbiddenException('Không có quyền huỷ suất.');
      // Reject before freezing sales if even one paid order uses real money.
      const real = await tx.payment.count({
        where: {
          order: { showtimeId, status: 'PAID' },
          status: 'SUCCEEDED',
          gateway: { not: 'mock' },
        },
      });
      if (real)
        throw new ConflictException(
          'Suất có thanh toán thật, chưa hỗ trợ hoàn tiền hàng loạt.',
        );
      await tx.$queryRaw`SELECT set_config('app.actor_id',${actor.id},true)`;
      await tx.showtime.update({
        where: { id: showtimeId },
        data: { status: 'CLOSED' },
      });
      await tx.order.updateMany({
        where: { showtimeId, status: { in: ['PENDING', 'PENDING_PAYMENT'] } },
        data: { status: 'CANCELLED' },
      });
      await tx.seatHold.deleteMany({ where: { showtimeId } });
      await tx.waitlistAvailabilitySignal.updateMany({
        where: { showtimeId, status: 'PENDING' },
        data: { status: 'CANCELLED', processedAt: new Date() },
      });
      await tx.waitlistNotification.updateMany({
        where: { entry: { showtimeId }, status: { in: ['QUEUED', 'SENDING'] } },
        data: { status: 'CANCELLED', leaseToken: null, leaseUntil: null, failureCode: 'SHOWTIME_CLOSED' },
      });
      await tx.waitlistEntry.updateMany({
        where: { showtimeId, status: { in: ['ACTIVE', 'NOTICE_QUEUED', 'NOTIFIED'] } },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return tx.showtimeCancellation.upsert({
        where: { showtimeId },
        create: { showtimeId, actorId: actor.id, reason: reason.trim() },
        update: {},
      });
    });
    this.seats.invalidate(showtimeId);
    return job;
  }
  async processShowBatch() {
    const jobs = await this.db.showtimeCancellation.findMany({
      where: { status: { in: ['QUEUED', 'RUNNING'] } },
      take: 5,
    });
    for (const job of jobs) {
      await this.db.showtimeCancellation.update({
        where: { showtimeId: job.showtimeId },
        data: { status: 'RUNNING', updatedAt: new Date() },
      });
      const orders = await this.db.order.findMany({
        where: { showtimeId: job.showtimeId, status: 'PAID' },
        orderBy: { id: 'asc' },
        take: 20,
        select: { id: true },
      });
      try {
        for (const order of orders)
          await this.cancel(
            order.id,
            { id: job.actorId, email: '', roles: ['ORGANIZER'] },
            true,
          );
        if (!orders.length)
          await this.db.showtimeCancellation.update({
            where: { showtimeId: job.showtimeId },
            data: {
              status: 'COMPLETED',
              failureCode: null,
              updatedAt: new Date(),
            },
          });
      } catch {
        await this.db.showtimeCancellation.update({
          where: { showtimeId: job.showtimeId },
          data: {
            status: 'FAILED',
            failureCode: 'BATCH_REQUIRES_REVIEW',
            updatedAt: new Date(),
          },
        });
      }
    }
  }
  async processRefundBatch() {
    this.enabled();
    await this.db.refund.updateMany({
      where: {
        status: 'SENDING',
        attempts: { gte: 3 },
        leaseUntil: { lte: new Date() },
      },
      data: {
        status: 'UNKNOWN',
        failureCode: 'LEASE_EXPIRED_AFTER_FINAL_ATTEMPT',
        leaseUntil: null,
      },
    });
    for (let n = 0; n < 10; n++) {
      const token = randomUUID();
      const [refund] = await this.db.$queryRaw<Refund[]>`WITH candidate AS (
        SELECT id FROM refunds WHERE ((status='QUEUED' AND "nextAttemptAt"<=clock_timestamp()) OR (status='SENDING' AND "leaseUntil"<=clock_timestamp())) AND attempts<3 ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE refunds r SET status='SENDING', attempts=r.attempts+1,"leaseToken"=${token}::uuid,"leaseUntil"=clock_timestamp()+interval '30 seconds',"updatedAt"=clock_timestamp() FROM candidate WHERE r.id=candidate.id RETURNING r.*`;
      if (!refund) break;
      const fail = Number(
        this.config.get('MOCK_REFUND_FAIL_FIRST_ATTEMPTS') ?? 0,
      );
      const result = await new MockRefundGateway(fail).refund(
        refund.id,
        refund.amount,
        refund.attempts,
      );
      await this.db.$transaction(async (tx) => {
        const data =
          result.status === 'SUCCEEDED'
            ? {
                status: 'SUCCEEDED',
                providerRef: result.providerRef,
                completedAt: new Date(),
                failureCode: null,
              }
            : {
                status: refund.attempts >= 3 ? 'FAILED' : 'QUEUED',
                failureCode: result.code,
                nextAttemptAt: new Date(
                  Date.now() + 5000 * 3 ** (refund.attempts - 1),
                ),
              };
        const updated = await tx.refund.updateMany({
          where: { id: refund.id, status: 'SENDING', leaseToken: token },
          data: {
            ...data,
            leaseUntil: null,
            leaseToken: null,
            updatedAt: new Date(),
          },
        });
        if (updated.count)
          await tx.refundAttempt.create({
            data: {
              refundId: refund.id,
              attempt: refund.attempts,
              status: result.status,
              reason: result.status === 'FAILED' ? result.code : null,
            },
          });
      });
    }
  }
  async resolveMockFailure(id: string, actor: AuthenticatedUser) {
    this.enabled();
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM refunds WHERE id=${id}::uuid FOR UPDATE`;
      const refund = await tx.refund.findUnique({ where: { id } });
      if (!refund) throw new NotFoundException('Không tìm thấy lệnh hoàn.');
      if (!['FAILED', 'UNKNOWN'].includes(refund.status))
        throw new ConflictException('Chỉ xử lý lệnh lỗi/chưa rõ kết quả.');
      await tx.$queryRaw`SELECT set_config('app.actor_id',${actor.id},true)`;
      // Explicit manual simulation; real-provider unknown outcomes are unsupported.
      return tx.refund.update({
        where: { id },
        data: {
          status: 'SUCCEEDED',
          providerRef: `mock-refund-${id}`,
          completedAt: new Date(),
          failureCode: null,
          updatedAt: new Date(),
        },
      });
    });
  }
}
