import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { isOrderExpired } from '../orders/order-expiration.js';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from './gateways/payment-gateway.interface.js';
import { AccountantNotifier } from './accountant-notifier.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly db: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly accountantNotifier: AccountantNotifier,
    private readonly config: ConfigService,
  ) {}

  async initiatePayment(
    orderId: string,
    userId: string,
    returnUrl?: string,
  ): Promise<{ redirectUrl: string; gatewayRef: string; paymentId: string }> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            seat: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    const now = new Date();
    if (order.status !== OrderStatus.PENDING || isOrderExpired(order, now)) {
      throw new BadRequestException(
        'Đơn hàng đã hết hạn hoặc không ở trạng thái chờ thanh toán.',
      );
    }

    // Authoritative calculation strictly from DB prices
    let authoritativeTotal = 0;
    for (const item of order.items) {
      const price = item.seat?.category?.price ?? item.unitPrice;
      authoritativeTotal += price;
    }

    if (authoritativeTotal <= 0) {
      throw new BadRequestException('Tổng tiền đơn hàng không hợp lệ.');
    }

    const webOrigin =
      this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    const finalReturnUrl =
      returnUrl || `${webOrigin}/payment/result?orderId=${order.id}`;

    const gatewayResult = await this.gateway.createPayment({
      orderId: order.id,
      amount: authoritativeTotal,
      returnUrl: finalReturnUrl,
    });

    const payment = await this.db.payment.create({
      data: {
        orderId: order.id,
        amount: authoritativeTotal,
        status: PaymentStatus.INITIATED,
        gateway: this.gateway.name,
        gatewayRef: gatewayResult.gatewayRef,
      },
    });

    return {
      redirectUrl: gatewayResult.redirectUrl,
      gatewayRef: gatewayResult.gatewayRef,
      paymentId: payment.id,
    };
  }

  async handleWebhook(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
    clientIp?: string,
  ): Promise<{ received: boolean; status: string }> {
    // 1. Verify signature
    const isValid = await this.gateway.verifyWebhook(body, headers);
    if (!isValid) {
      this.logger.warn(
        `Webhook signature verification failed from IP: ${clientIp ?? 'unknown'}`,
      );
      throw new UnauthorizedException('Chữ ký không hợp lệ.');
    }

    // 2. Parse webhook
    const event = await this.gateway.parseWebhook(body);
    if (!event.orderId) {
      this.logger.warn(
        `Webhook payload missing valid orderId from IP: ${clientIp ?? 'unknown'}`,
      );
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    const order = await this.db.order.findUnique({
      where: { id: event.orderId },
      include: {
        items: {
          include: {
            seat: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      this.logger.warn(
        `Webhook order not found: ${event.orderId} from IP: ${clientIp ?? 'unknown'}`,
      );
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    // Calculate authoritative order total from DB
    let orderTotal = 0;
    for (const item of order.items) {
      orderTotal += item.seat?.category?.price ?? item.unitPrice;
    }

    // 3. Amount mismatch check
    if (event.status === 'SUCCESS' && event.amount !== orderTotal) {
      await this.db.$transaction([
        this.db.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.NEEDS_REVIEW },
        }),
        this.db.payment.create({
          data: {
            orderId: order.id,
            amount: event.amount,
            status: PaymentStatus.AMOUNT_MISMATCH,
            gateway: this.gateway.name,
            gatewayRef: event.gatewayRef,
            transactionId: event.transactionId,
          },
        }),
      ]);

      await this.accountantNotifier.notifyAmountMismatch({
        orderId: order.id,
        expectedAmount: orderTotal,
        receivedAmount: event.amount,
        transactionId: event.transactionId,
        gatewayRef: event.gatewayRef,
        reason:
          'Số tiền thanh toán nhận từ cổng không khớp với tổng tiền đơn hàng',
      });

      return { received: true, status: 'AMOUNT_MISMATCH' };
    }

    // 4. Successful event with matched amount in a SINGLE TRANSACTION
    if (event.status === 'SUCCESS') {
      await this.db.$transaction(async (tx) => {
        // (a) Order -> PAID
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PAID },
        });

        // (b) Seats -> SOLD (isSold = true)
        const seatIds = order.items.map((item) => item.seatId);
        if (seatIds.length > 0) {
          await tx.seat.updateMany({
            where: { id: { in: seatIds } },
            data: { isSold: true },
          });

          // (c) Delete holds on these seats
          await tx.seatHold.deleteMany({
            where: { seatId: { in: seatIds } },
          });
        }

        // (d) Payment -> SUCCEEDED with gateway transaction ID
        const existingPayment = await tx.payment.findFirst({
          where: { gatewayRef: event.gatewayRef },
        });

        if (existingPayment) {
          await tx.payment.update({
            where: { id: existingPayment.id },
            data: {
              status: PaymentStatus.SUCCEEDED,
              transactionId: event.transactionId,
            },
          });
        } else {
          await tx.payment.create({
            data: {
              orderId: order.id,
              amount: event.amount,
              status: PaymentStatus.SUCCEEDED,
              gateway: this.gateway.name,
              gatewayRef: event.gatewayRef,
              transactionId: event.transactionId,
            },
          });
        }
      });

      return { received: true, status: 'PAID' };
    }

    // 5. Failed event: Payment -> FAILED, order remains PENDING
    const existingPayment = await this.db.payment.findFirst({
      where: { gatewayRef: event.gatewayRef },
    });

    if (existingPayment) {
      await this.db.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: PaymentStatus.FAILED,
          transactionId: event.transactionId,
        },
      });
    } else {
      await this.db.payment.create({
        data: {
          orderId: order.id,
          amount: event.amount,
          status: PaymentStatus.FAILED,
          gateway: this.gateway.name,
          gatewayRef: event.gatewayRef,
          transactionId: event.transactionId,
        },
      });
    }

    return { received: true, status: 'FAILED' };
  }
}
