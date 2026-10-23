# Sprint 4–8 Test Matrix

Cập nhật 22/10/2026. Báo cáo này thay thế kết luận ngày 21/10; không dùng số đếm cũ hoặc hành vi bỏ queue khi HTTP4xx làm tiêu chí PASS.

Xem [kịch bản chi tiết và bằng chứng](SPRINT_4_8_TEST_SCENARIOS_20261022.md).

## Kết quả và bằng chứng

| Nhóm | Kết quả | Bằng chứng |
|---|---|---|
| API unit | 419 PASS / 51 files | `.cache/sprint4-8-evidence/20261022/api-unit-final.log` |
| Web unit | 148 PASS / 24 files | `.cache/sprint4-8-evidence/20261022/web-unit-final.log` |
| Sprint 4–5 | 45 PASS | `.cache/local-booking/sprint4-5-verification-20261022.json` |
| Sprint 6–8 | 42 PASS | `.cache/sprint4-8-evidence/20261022/sprint6-8-results.json` |
| 2.000 SSE | 2.000/2.000 <2s, p95 1593ms, max1622ms | `.cache/sprint4-8-evidence/20261022/sse-load-results.json` |
| Backup restore | 4 PASS; local drill | `.cache/sprint4-8-evidence/20261022/backup-drill-results.json` |
| Full E2E | 102 PASS / 17 files; không gộp với 87 ca sprint | `.cache/sprint4-8-evidence/20261022/full-e2e.log` |

