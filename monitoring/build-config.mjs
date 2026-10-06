// Reproducible dashboard and rule sources. No runtime secrets, no demo data.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = import.meta.dirname;
const write = (path, obj) => {
  const dest = resolve(root, path);
  mkdirSync(resolve(dest, ".."), { recursive: true });
  writeFileSync(dest, JSON.stringify(obj, null, 2) + "\n");
};
const scope = 'service="api"';
const live = `and on (service,environment) (min by(service,environment)(up{job="ticketing",service="api"}) == 1) and on (service,environment) (count by(service,environment)(up{job="ticketing",service="api"}) == 2)`;
const total = `sum by(service,environment)(rate(ticket_http_requests_total{${scope}}[5m]))`;
const minimum = `sum by(service,environment)(increase(ticket_http_requests_total{${scope}}[5m])) >= 100`;
const errors = `(sum by(service,environment)(rate(ticket_http_requests_total{${scope},status=~"5.."}[5m])) or on(service,environment) (${total} * 0)) / ${total}`;
const p95 =
  'histogram_quantile(0.95,sum by(le,service,environment,route)(rate(ticket_http_request_duration_seconds_bucket{service="api",method="POST",route="/showtimes/:id/holds"}[5m])))';
const annotation = (metric, threshold, window) => ({
  metric,
  threshold,
  window,
  value: '{{ printf "%.4f" $value }}',
  dashboard: "http://localhost:13000/d/s43-monitoring",
  runbook:
    "https://github.com/TTCS-T926-K19C5-N2/thudemo/blob/main/docs/S43_MONITORING_RUNBOOK.md",
});
const alert = (name, expr, period, metric, threshold, window) => ({
  alert: name,
  expr,
  for: period,
  labels: { severity: "warning" },
  annotations: annotation(metric, threshold, window),
});
write("rules.json", {
  groups: [
    {
      name: "s43",
      rules: [
        alert(
          "S43ScrapeUnavailable",
          'up{job="ticketing"} == 0',
          "1m",
          "up",
          "1",
          "1m",
        ),
        alert(
          "S43TargetMissing",
          '(count by(service,environment)(up{job="ticketing",service="api"}) < 2) or absent(up{job="ticketing",service="api"}) or absent(up{job="ticketing",service="worker"})',
          "1m",
          "up",
          "expected two API instances and one worker; configure when topology changes",
          "1m",
        ),
        alert(
          "S43SystemErrors",
          `(${errors} > 0.05) and (${minimum}) ${live}`,
          "2m",
          "5xx ratio",
          "0.05 technical proposal",
          "5m; minimum 100 responses",
        ),
        alert(
          "S43RequestVolume",
          `(${total} > 50) ${live}`,
          "2m",
          "RPS",
          "50 technical proposal, baseline calibration pending",
          "5m",
        ),
        alert(
          "S43HoldP95",
          `(${p95} > 0.3) and on(service,environment) (sum by(service,environment)(increase(ticket_http_request_duration_seconds_count{service="api",method="POST",route="/showtimes/:id/holds"}[5m])) >= 100) ${live}`,
          "2m",
          "hold p95 seconds",
          "0.3 approved NFR; estimated histogram",
          "5m; minimum 100 hold responses",
        ),
        alert(
          "S43HoldConflictSurge",
          `(sum by(service,environment)(increase(ticket_hold_conflicts_total{service="api"}[5m])) > 100) ${live}`,
          "2m",
          "conflicted requests",
          "100 technical proposal",
          "5m",
        ),
        alert(
          "S43WebhookRejectionSurge",
          '(sum by(service,environment)(increase(ticket_webhook_rejections_total[5m])) > 20) and on(service,environment) (max by(service,environment)(ticket_producer_available{subsystem="webhook"}) == 1)',
          "2m",
          "webhook rejections",
          "20 technical proposal",
          "5m; real producer required",
        ),
        alert(
          "S43WorkerStale",
          '(ticket_worker_enabled{service="worker"} == 1) unless on(instance) (time()-ticket_worker_last_success_timestamp_seconds{service="worker"} < 180)',
          "1m",
          "worker last success age seconds",
          "180 technical proposal",
          "1m; cadence unchanged at 60s",
        ),
        alert(
          "S43NotificationDeliveryFailed",
          "increase(alertmanager_notifications_failed_total[5m]) > 0",
          "1m",
          "notification failures",
          "0",
          "5m; per integration",
        ),
      ],
    },
  ],
});
write("grafana/provisioning/datasources/prometheus.yaml", {
  apiVersion: 1,
  datasources: [
    {
      name: "S43 Prometheus",
      uid: "s43-prometheus",
      type: "prometheus",
      access: "proxy",
      url: "http://prometheus:9090",
      isDefault: true,
      editable: false,
    },
  ],
});
write("grafana/provisioning/dashboards/s43.yaml", {
  apiVersion: 1,
  providers: [
    {
      name: "S43",
      type: "file",
      disableDeletion: true,
      allowUiUpdates: false,
      options: { path: "/etc/grafana/dashboards" },
    },
  ],
});
const filter =
  'environment=~"$environment",instance=~"$instance",service="api"';
const fresh =
  'and on(environment) (min by(environment)(up{job="ticketing",service="api",environment=~"$environment"}) == 1) and on(environment) (count by(environment)(up{job="ticketing",service="api",environment=~"$environment"}) == 2)';
const req = `sum by(environment)(rate(ticket_http_requests_total{${filter}}[5m]))`;
let id = 0;
const panel = (title, expr, unit = "short", type = "timeseries") => ({
  id: ++id,
  title,
  type,
  datasource: { type: "prometheus", uid: "s43-prometheus" },
  gridPos: {
    x: ((id - 1) % 2) * 12,
    y: Math.floor((id - 1) / 2) * 8,
    w: 12,
    h: 8,
  },
  targets: [
    {
      refId: "A",
      expr,
      legendFormat:
        "{{service}} {{instance}} {{route}} {{status}} {{reason}} {{state}}",
    },
  ],
  fieldConfig: {
    defaults: { unit, noValue: "No data / Unknown" },
    overrides: [],
  },
  options: {
    tooltip: { mode: "multi" },
    legend: { displayMode: "table", placement: "bottom" },
  },
});
const panels = [
  panel("Request RPS — completed + aborted, 5m", `${req} ${fresh}`, "reqps"),
  panel(
    "Completed / aborted responses — increase 5m",
    `sum by(environment)(increase(ticket_http_requests_total{${filter}}[5m])) ${fresh}`,
  ),
  panel(
    "5xx system error ratio — denominator all responses, 5m",
    `((sum by(environment)(rate(ticket_http_requests_total{${filter},status=~"5.."}[5m])) or on(environment) (${req} * 0)) / ${req}) and (${req}>0) ${fresh}`,
    "percentunit",
  ),
  panel(
    "4xx / business 409 / aborted 499 — 5m",
    `sum by(status,environment)(rate(ticket_http_requests_total{${filter},status=~"4.."}[5m])) ${fresh}`,
    "reqps",
  ),
  panel(
    "Estimated p95 by route — aggregated buckets, 5m",
    `histogram_quantile(0.95,sum by(le,route,environment)(rate(ticket_http_request_duration_seconds_bucket{${filter}}[5m]))) ${fresh}`,
    "s",
  ),
  panel(
    "Hold conflict requests — SEAT_CONFLICT only, 5m",
    `sum by(environment)(increase(ticket_hold_conflicts_total{${filter}}[5m])) ${fresh}`,
  ),
  panel(
    "Webhook rejection — unavailable until real producer",
    `sum by(reason,environment)(increase(ticket_webhook_rejections_total{${filter}}[5m])) and on(environment) (max by(environment)(ticket_producer_available{${filter},subsystem="webhook"}) == 1)`,
  ),
  panel(
    "Scrape health — 0 DOWN; absent UNKNOWN",
    'up{job="ticketing",environment=~"$environment",instance=~"$instance"}',
    "short",
    "stat",
  ),
  panel(
    "Scrape sample freshness age",
    'time()-timestamp(up{job="ticketing",environment=~"$environment",instance=~"$instance"})',
    "s",
  ),
  panel(
    "Alerts — Pending / Firing (Normal when scrape healthy and no alerts)",
    'ALERTS{environment=~"$environment"}',
    "short",
    "state-timeline",
  ),
  panel(
    "Expiry worker last success age — off/down/never successful means Unknown",
    '(time()-ticket_worker_last_success_timestamp_seconds{service="worker",environment=~"$environment"}) and on(instance)(up{job="ticketing",service="worker"} == 1) and on(instance)(ticket_worker_enabled{service="worker"} == 1) and on(instance)(ticket_worker_last_success_timestamp_seconds > 0)',
    "s",
  ),
  panel(
    "Worker sweep duration p95 / cleaned claims",
    'histogram_quantile(0.95,sum by(le)(rate(ticket_worker_run_duration_seconds_bucket{service="worker",environment=~"$environment"}[5m]) and on(instance)(up{job="ticketing",service="worker"} == 1) and on(instance)(ticket_worker_enabled == 1)))',
    "s",
  ),
  panel(
    "Worker failures — 5m",
    'sum(increase(ticket_worker_errors_total{service="worker",environment=~"$environment"}[5m]) and on(instance)(up{job="ticketing",service="worker"} == 1) and on(instance)(ticket_worker_enabled == 1))',
  ),
  panel(
    "Expired holds cleaned — 5m",
    'sum(increase(ticket_worker_cleaned_holds_total{service="worker",environment=~"$environment"}[5m]) and on(instance)(up{job="ticketing",service="worker"} == 1) and on(instance)(ticket_worker_enabled == 1))',
  ),
  panel(
    "Notification attempts/failures by transport — provider acceptance only",
    "sum by(integration)(increase(alertmanager_notifications_total[5m]))",
  ),
  panel(
    "Notification failures — retry/backoff per channel",
    "sum by(integration)(increase(alertmanager_notifications_failed_total[5m]))",
  ),
];
panels.find((p) => p.title.startsWith("Alerts")).targets[0].legendFormat =
  "{{alertname}} {{alertstate}}";
panels.push({
  id: ++id,
  title: "Availability and alert lifecycle",
  type: "text",
  gridPos: { x: 0, y: 64, w: 24, h: 4 },
  options: {
    mode: "markdown",
    content:
      "**Webhook: Chưa có nguồn webhook. Email/refund jobs: chưa có producer.** Backlog/oldest job age chưa có query được nghiệm thu. No samples / denominator zero / stale scrape = Unknown. Normal chỉ khi scrape healthy và không có alert; ALERTS hiển thị Pending/Firing và lịch sử chuyển về absent khi Resolved. Receiver/provider log chứng minh Resolved. SMTP accepted/Telegram message ID không chứng minh người nhận đã đọc. Ngưỡng 50 RPS, 5%/100 samples, 100 conflicts và 20 rejections là đề xuất kỹ thuật; hold p95 300ms là NFR. Operator chưa có SLA/lịch trực đã chốt.",
  },
});
write("grafana/dashboards/s43.json", {
  uid: "s43-monitoring",
  title: "S-43 — Ticketing operations",
  schemaVersion: 41,
  version: 1,
  editable: false,
  refresh: "5s",
  time: { from: "now-30m", to: "now" },
  tags: ["S-43"],
  templating: {
    list: [
      {
        name: "environment",
        type: "query",
        datasource: { uid: "s43-prometheus", type: "prometheus" },
        query: 'label_values(up{job="ticketing"}, environment)',
        refresh: 1,
        includeAll: true,
        allValue: ".*",
      },
      {
        name: "instance",
        type: "query",
        datasource: { uid: "s43-prometheus", type: "prometheus" },
        query:
          'label_values(up{job="ticketing",environment=~"$environment"}, instance)',
        refresh: 1,
        includeAll: true,
        allValue: ".*",
      },
    ],
  },
  panels,
});
console.log("Rules, provisioning and dashboard generated");
