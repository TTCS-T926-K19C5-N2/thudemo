import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class WebhookSecurityFilter implements ExceptionFilter {
  private readonly logger = new Logger(WebhookSecurityFilter.name);

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
      const isSyntaxError =
        exception instanceof SyntaxError ||
        (exception as any)?.type === 'entity.parse.failed';
      const status =
        exception instanceof HttpException
          ? exception.getStatus()
          : (exception as any)?.status ?? (exception as any)?.statusCode;

      // When payload is not valid JSON or fails body parsing on webhook endpoint
      if (isSyntaxError || status === HttpStatus.BAD_REQUEST) {
        const clientIp =
          (req.headers['x-forwarded-for'] as string) ||
          req.ip ||
          req.socket?.remoteAddress;

        this.logger.warn(
          `Webhook signature verification failed from IP: ${clientIp ?? 'unknown'}`,
        );

        return res.status(HttpStatus.UNAUTHORIZED).json({
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Chữ ký không hợp lệ.',
        });
      }
    }

    // Default handling for other routes and exceptions
    if (exception instanceof HttpException) {
      return res.status(exception.getStatus()).json(exception.getResponse());
    }

    const statusCode =
      (exception as any)?.status ??
      (exception as any)?.statusCode ??
      HttpStatus.INTERNAL_SERVER_ERROR;
    const message = (exception as any)?.message ?? 'Internal server error';

    return res.status(statusCode).json({
      statusCode,
      message,
    });
  }
}
