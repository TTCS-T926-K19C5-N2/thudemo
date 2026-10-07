import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { metrics } from './monitoring/metrics.js';
import { validatePaymentGatewayConfig } from './payments/payments-config.validator.js';
import express, { type Request, type Response, type NextFunction } from 'express';

async function bootstrap() {
  validatePaymentGatewayConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    rawBody: true,
  });
  app.use(metrics.middleware);

  // Preserve raw body exclusively for /payments/webhook to avoid standard JSON parse crashes
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/payments/webhook') {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string | Buffer) => {
        data += chunk;
      });
      req.on('end', () => {
        (req as any).rawBody = data;
        try {
          req.body = JSON.parse(data);
        } catch {
          req.body = data;
        }
        next();
      });
      return;
    }
    return express.json({ limit: '5mb' })(req, res, next);
  });

  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
await bootstrap();
