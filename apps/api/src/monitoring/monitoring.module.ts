import {
  Injectable,
  Logger,
  Module,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { metrics } from './metrics.js';

@Injectable()
class MetricsExporter implements OnModuleInit, OnModuleDestroy {
  private server?: Server;
  private readonly logger = new Logger(MetricsExporter.name);
  onModuleInit() {
    if (process.env.MONITORING_ENABLED !== 'true') return;
    try {
      metrics.safe(() => metrics.workerEnabled.set(
        process.env.HOLD_EXPIRY_MODE === 'off' || !process.env.HOLD_EXPIRY_MODE ? 0 : 1,
      ));
      const token = process.env.METRICS_TOKEN_FILE
        ? readFileSync(process.env.METRICS_TOKEN_FILE, 'utf8').trim()
        : process.env.METRICS_TOKEN;
      if (!token || token.length < 32)
        throw new Error('Missing metrics credential');
      const expected = Buffer.from(`Bearer ${token}`);
      this.server = createServer((req, res) => {
        const supplied = Buffer.from(req.headers.authorization ?? '');
        if (
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        ) {
          res.writeHead(401).end();
          return;
        }
        if (req.method !== 'GET' || req.url !== '/metrics') {
          res.writeHead(404).end();
          return;
        }
        void metrics.registry
          .metrics()
          .then((body) => {
            res
              .writeHead(200, {
                'Content-Type': metrics.registry.contentType,
                'Cache-Control': 'no-store',
              })
              .end(body);
          })
          .catch(() => res.writeHead(503).end());
      });
      this.server.requestTimeout = 5000;
      this.server.headersTimeout = 5000;
      this.server.on('error', () =>
        this.logger.error('metrics_exporter_unavailable'),
      );
      this.server.listen(
        Number(process.env.METRICS_PORT ?? 9464),
        process.env.METRICS_HOST ?? '127.0.0.1',
      );
    } catch {
      this.logger.error('metrics_exporter_unavailable');
    }
  }
  async onModuleDestroy() {
    const server = this.server;
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}
@Module({ providers: [MetricsExporter] })
export class MonitoringModule {}
