import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const requests = (ok, err) => [
  {
    series:
      'ticket_http_requests_total{service="api",environment="local",instance="a",method="GET",route="/showtimes",status="200"}',
    values: `0+${ok}x15`,
  },
  {
    series:
      'ticket_http_requests_total{service="api",environment="local",instance="a",method="GET",route="/showtimes",status="500"}',
    values: `0+${err}x15`,
  },
  {
    series:
      'up{job="ticketing",service="api",environment="local",instance="a"}',
    values: "1+0x15",
  },
  {
    series:
      'up{job="ticketing",service="api",environment="local",instance="b"}',
    values: "1+0x15",
  },
];
const a = {
  alertname: "S43SystemErrors",
  service: "api",
  environment: "local",
  severity: "warning",
};
const annotations = {
  metric: "5xx ratio",
  threshold: "0.05 technical proposal",
  window: "5m; minimum 100 responses",
  value: "0.0909",
  dashboard: "http://localhost:13000/d/s43-monitoring",
  runbook:
    "https://github.com/TTCS-T926-K19C5-N2/thudemo/blob/main/docs/S43_MONITORING_RUNBOOK.md",
};
const p95 =
  "histogram_quantile(0.95,sum by(le)(rate(ticket_http_request_duration_seconds_bucket[5m])))";
const hist = [];
for (const [instance, distribution] of [
  ["a", [90, 90, 90, 90]],
  ["b", [0, 0, 10, 10]],
]) {
  for (const [index, le] of ["0.1", "0.3", "0.4", "+Inf"].entries())
    hist.push({
      series: `ticket_http_request_duration_seconds_bucket{instance="${instance}",le="${le}"}`,
      values: `0+${distribution[index]}x15`,
    });
}
const tests = [
  {
    name: "Error sustained threshold requires debounce",
    interval: "1m",
    input_series: requests(100, 10),
    alert_rule_test: [
      { eval_time: "1m", alertname: a.alertname, exp_alerts: [] },
      {
        eval_time: "3m",
        alertname: a.alertname,
        exp_alerts: [{ exp_labels: a, exp_annotations: annotations }],
      },
    ],
  },
  {
    name: "Exact 5 percent is not greater than threshold",
    interval: "1m",
    input_series: requests(95, 5),
    alert_rule_test: [
      { eval_time: "8m", alertname: a.alertname, exp_alerts: [] },
    ],
  },
  {
    name: "Minimum sample count enforced",
    interval: "1m",
    input_series: requests(1, 1),
    alert_rule_test: [
      { eval_time: "8m", alertname: a.alertname, exp_alerts: [] },
    ],
  },
  {
    name: "No samples never healthy zero",
    interval: "1m",
    input_series: [],
    promql_expr_test: [
      { expr: p95, eval_time: "5m", exp_samples: [] },
      {
        expr: "sum(rate(ticket_http_requests_total[5m])) / sum(rate(ticket_http_requests_total[5m]))",
        eval_time: "5m",
        exp_samples: [],
      },
    ],
  },
  {
    name: "Aggregate distribution before p95, never mean p95",
    interval: "1m",
    input_series: hist,
    promql_expr_test: [
      {
        expr: p95,
        eval_time: "5m",
        exp_samples: [{ labels: "{}", value: 0.35 }],
      },
    ],
  },
  {
    name: "Webhook seam absent or unavailable suppresses alert",
    interval: "1m",
    input_series: [
      {
        series:
          'ticket_webhook_rejections_total{service="api",environment="local",reason="signature"}',
        values: "0+100x15",
      },
      {
        series:
          'ticket_producer_available{service="api",environment="local",subsystem="webhook"}',
        values: "0+0x15",
      },
    ],
    alert_rule_test: [
      {
        eval_time: "8m",
        alertname: "S43WebhookRejectionSurge",
        exp_alerts: [],
      },
    ],
  },
  {
    name: "Counter reset rate stays nonnegative",
    interval: "1m",
    input_series: [
      {
        series: 'ticket_http_requests_total{instance="a"}',
        values: "0 100 200 0 100 200 300",
      },
    ],
    promql_expr_test: [
      {
        expr: "resets(ticket_http_requests_total[5m])",
        eval_time: "5m",
        exp_samples: [{ labels: '{instance="a"}', value: 1 }],
      },
      {
        expr: "rate(ticket_http_requests_total[5m]) >= bool 0",
        eval_time: "5m",
        exp_samples: [{ labels: '{instance="a"}', value: 1 }],
      },
    ],
  },
];
writeFileSync(
  resolve(import.meta.dirname, "rule-tests.json"),
  JSON.stringify(
    { rule_files: ["rules.json"], evaluation_interval: "1m", fuzzy_compare: true, tests },
    null,
    2,
  ) + "\n",
);
console.log("Promtool boundary/aggregation/no-data/reset fixtures generated");
