import {
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';
import { metrics } from '../monitoring/metrics.js';

@Catch()
export class WebhookSecurityFilter extends BaseExceptionFilter {
  private readonly filterLogger = new Logger(WebhookSecurityFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const path = req.path ?? req.url ?? '';
    const originalUrl = req.originalUrl ?? '';
    const isWebhookRoute =
      path.includes('/payments/webhook') ||
      originalUrl.includes('/payments/webhook');

    if (isWebhookRoute) {
      metrics.safe(() => metrics.producer.set({ subsystem: 'webhook' }, 1));
      const isSyntaxError =
        exception instanceof SyntaxError ||
        (exception as any)?.type === 'entity.parse.failed';
      const status =
        exception instanceof HttpException
          ? exception.getStatus()
          : ((exception as any)?.status ?? (exception as any)?.statusCode);
      if (isSyntaxError || [400, 401, 403].includes(Number(status)))
        metrics.rejectWebhook(
          isSyntaxError || status === 400
            ? 'schema'
            : status === 403
              ? 'permission'
              : 'signature',
        );

      // When payload is not valid JSON or fails body parsing on webhook endpoint
      if (isSyntaxError || status === HttpStatus.BAD_REQUEST) {
        const clientIp =
          (req.headers['x-forwarded-for'] as string) ||
          req.ip ||
          req.socket?.remoteAddress;

        this.filterLogger.warn(
          `Webhook signature verification failed from IP: ${clientIp ?? 'unknown'}`,
        );

        return res.status(HttpStatus.UNAUTHORIZED).json({
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Chữ ký không hợp lệ.',
        });
      }
    }

    super.catch(exception, host);
  }
}
