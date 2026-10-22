import {
  Controller,
  Get,
  Header,
  Injectable,
  Logger,
  Module,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { metrics } from './metrics.js';

type Sample = {
  at: number;
  requests: number;
  errors: number;
  conflicts: number;
  rejected: number;
  buckets: Record<string, number>;
};
export type WindowStats = {
  requests: number;
  errorRatePercent: number;
  holdConflicts: number;
  webhookRejected: number;
  p95Ms: number | null;
};
export function localAlertCodes(stats: WindowStats) {
  const codes: string[] = [];
  if (stats.requests >= 10 && stats.errorRatePercent >= 5)
    codes.push('HIGH_ERROR_RATE');
  if (stats.p95Ms !== null && stats.p95Ms >= 1000)
    codes.push('HIGH_P95_LATENCY');
  if (stats.holdConflicts >= 10) codes.push('HOLD_CONFLICT_BURST');
  if (stats.webhookRejected >= 1) codes.push('REJECTED_WEBHOOK');
  return codes;
}
@Injectable()
export class LocalDashboard implements OnModuleInit, OnModuleDestroy {
  private samples: Sample[] = [
    {
      at: Date.now(),
      requests: 0,
      errors: 0,
      conflicts: 0,
      rejected: 0,
      buckets: {},
    },
  ];
  private firing = new Set<string>();
  private history: { code: string; state: string; at: string }[] = [];
  private logger = new Logger(LocalDashboard.name);
  private timer?: ReturnType<typeof setInterval>;
  onModuleInit() {
    if (process.env.MONITORING_ENABLED === 'true') {
      this.timer = setInterval(() => {
        void this.read().catch(() => {});
      }, 5000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async read() {
    if (process.env.MONITORING_ENABLED !== 'true')
      return {
        enabled: false,
        stats: null,
        alerts: [],
        history: [],
        message: 'Giám sát đang tắt; không coi số0 là hệ thống khoẻ.',
      };
    const all = await metrics.registry.getMetricsAsJSON();
    const now: Sample = {
      at: Date.now(),
      requests: 0,
      errors: 0,
      conflicts: 0,
      rejected: 0,
      buckets: {},
    };
    for (const m of all)
      for (const v of m.values) {
        if (m.name === 'ticket_http_requests_total') {
          now.requests += v.value;
          if (Number(v.labels.status) >= 500) now.errors += v.value;
        }
        if (m.name === 'ticket_hold_conflicts_total') now.conflicts += v.value;
        if (m.name === 'ticket_webhook_rejections_total')
          now.rejected += v.value;
        if (
          m.name === 'ticket_http_request_duration_seconds' &&
          'le' in v.labels
        ) {
          const bound = String(v.labels.le);
          now.buckets[bound] = (now.buckets[bound] ?? 0) + v.value;
        }
      }
    this.samples = this.samples.filter((s) => s.at >= now.at - 300000);
    const first = this.samples[0] ?? now;
    this.samples.push(now);
    // Bound memory even if several dashboard users poll very rapidly.
    if (this.samples.length > 600)
      this.samples.splice(1, this.samples.length - 600);
    const requests = Math.max(0, now.requests - first.requests),
      target = requests * 0.95;
    let p95Ms: number | null = null;
    let p95Censored = false;
    if (requests > 0) {
      for (const bound of Object.keys(now.buckets)
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b)) {
        if (
          (now.buckets[String(bound)] ?? 0) -
            (first.buckets[String(bound)] ?? 0) >=
          target
        ) {
          p95Ms = bound * 1000;
          break;
        }
      }
      if (p95Ms === null && Object.keys(now.buckets).length) {
        p95Ms =
          Math.max(
            ...Object.keys(now.buckets).map(Number).filter(Number.isFinite),
          ) * 1000;
        p95Censored = true;
      }
    }
    const stats: WindowStats = {
      requests,
      errorRatePercent: requests
        ? (Math.max(0, now.errors - first.errors) / requests) * 100
        : 0,
      holdConflicts: Math.max(0, now.conflicts - first.conflicts),
      webhookRejected: Math.max(0, now.rejected - first.rejected),
      p95Ms,
    };
    const next = new Set(localAlertCodes(stats));
    for (const code of new Set([...this.firing, ...next]))
      if (this.firing.has(code) !== next.has(code)) {
        const event = {
          code,
          state: next.has(code) ? 'FIRING' : 'RESOLVED',
          at: new Date().toISOString(),
        };
        this.history.unshift(event);
        this.logger.warn(
          JSON.stringify({ event: 'local_monitoring_alert', ...event }),
        );
      }
    this.history = this.history.slice(0, 100);
    this.firing = next;
    return {
      enabled: true,
      stats,
      p95Censored,
      alerts: [...next],
      history: this.history,
      windowSeconds: Math.round((now.at - first.at) / 1000),
      channel: 'IN_APP_LOCAL',
      p95Method: 'Prometheus histogram upper bucket bound',
      thresholds: {
        minRequestsForErrorAlert: 10,
        errorRatePercent: 5,
        p95Ms: 1000,
        holdConflicts: 10,
        webhookRejected: 1,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
@Controller('operations/monitoring')
@Roles('ADMIN')
class LocalDashboardController {
  constructor(private readonly dashboard: LocalDashboard) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  read() {
    return this.dashboard.read();
  }
}
@Module({
  controllers: [LocalDashboardController],
  providers: [LocalDashboard],
})
export class LocalDashboardModule {}
