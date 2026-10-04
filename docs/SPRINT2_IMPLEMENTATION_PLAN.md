# Sprint 2 — checkpoint 1, 04/10/2026
> Cập nhật DEC-11 / 04-10-2026: Render Free, ngân sách 0; PO + review kỹ thuật tự động thực hiện review/chốt; chưa commit/push/PR/publish/upload/deploy. Quy định host/reviewer bên dưới là lịch sử. Xem [gói PO review hiện tại](SPRINT2_PO_REVIEW.md) và [runbook Render](RENDER_FREE_RUNBOOK.md). K-01 tạm thời vẫn chờ PO duyệt recommendation đã đo; không miễn staging/CI/NFR/DoD.

Root: thudemo. Branch: task/T-03-docker-packaging. WIP ban đầu được lưu trong `.git/sprint2-wip-20261004` (patch và bản sao file); không commit/push/deploy. TECH-01/02, DEC-02/03/09/10 có hiệu lực. Node 24.21.0; pnpm global 11.24.0 nên dùng runner pnpm@10.15.1, không đổi package manager dự án.

## Dependency và ma trận

| Task | AC / NFR | Hiện trạng ban đầu | Dependency | Triển khai / bằng chứng dự kiến |
|---|---|---|---|---|
| T-11 | unique suất/hàng/số, FK index, migration bù | chưa có | T-09 local có | schema seats/categories, migration cycle |
| T-12 | batch transaction 2000 <5s, lỗi cuối rollback | chưa có | T-11 | import API, integration và benchmark |
| T-13 | đủ lỗi, vị trí, hàm thuần | chưa có | T-12 | validator, unit tests |
| T-14 | preview không ghi, lỗi disable | chưa có | T-13 | /showtimes/:id/import, browser |
| T-15 | enum, đủ map/giá, reopen | chưa có | T-34 | central service, integration |
| T-16 | nút trạng thái, owner | chưa có | T-15 | /showtimes/:id/manage, browser |
| T-17 | cursor, giá 0, Redis30s, 200 suất <500ms | chưa có | T-15 | /showtimes, revision cache, tests/benchmark |
| T-18 | public detail, <=2click, safe login return, metadata | chưa có | T-17 | /, /shows/:id, browser |
| T-19 | one join 2000 <200ms, 3-state seam | chưa có | T-11 | query + sold/held fixture projection; real holds gated |
| T-20 | single canvas, zoom, touch, symbols | chưa có | T-19 | SeatMap component, browser |
| T-21 | generator configurable, render p95<2s README | chưa có | T-20 | fixture and production browser measurement |
| T-22 | authoritative holds chosen after K01 | chưa có | K01,T-19 | BLOCKED by K01 staging/review |
| T-23 | shared expiry, atomic set, closed409 | chưa có | T-22,T-15,T-29/30 | BLOCKED |
| T-24 | server countdown, expiry refresh | chưa có | T-23 | BLOCKED; no fake success/timer |
| T-27 | minute cleanup idempotent | chưa có | T-22 | BLOCKED |
| T-28 | DB clock expired available | chưa có | T-27 | BLOCKED; pure fixture contract only |
| T-29 | shared atomic winner | chưa có | T-22,K01 | BLOCKED |
| T-30 | conflicts409, rejected list, safe log | chưa có | T-29 | BLOCKED |
| T-31 | HTTP200/100,10runs,CI,staging | chưa có | T-30 | BLOCKED; local spike is not T31 |
| T-34 | nullable integer VND, migration cycle | chưa có | T-11 | categories price, DB CHECK |
| T-35 | form, negative reject, inspector price | chưa có | T-34,T-16,T-20 | /showtimes/:id/prices, browser |

Sprint1 local evidence exists for auth/ownership/schema, but independent review and staging absent. No newer K01 evidence found in checkout. Continue independent branches under prompt authorization; no task marked Done.

## Stitch mapping

Source: project 1184317708208520256; exact 29 IDs in parent outputs/stitch-sprint2-demo/README.md and prompt. Downloaded references retained under evidence/sprint2/20261004-local/design. Stitch is read-only.

| Screen | Route/component | Task / API / states |
|---|---|---|
| 01 + M01 + M14/15/16 | /, PublicCatalog | T18 / GET showtimes / loading,empty,error |
| 02 + M02 | /shows/:id | T18 / GET showtimes/:id / closed/notfound |
| 03 + M03 + 11/M11 | /shows/:id/seats, SeatMap | T20 / seats / selected draft; hold disabled at K01 gate |
| 04 + M04 | /showtimes/:id/manage | T16 / owned detail,status / pending,error,success |
| 05 + M05 + 09/M09 | /showtimes/:id/import | T14 / validate-map,seat-map / preview,all errors |
| 06 + M06 + 10/M10 | /showtimes/:id/prices | T35 / prices / validation,pending,saved |
| 07 + M07 | /showtimes/:id/map | T20 / owned seats / read-only inspector |
| 08 + M08 | /login?returnTo=/shows/:id/seats | T18/auth / server cookie only |
| 12/M12 + 13/M13 | hold conflict/expiry | blocked integration until K01; no simulated server state |

Public routes do not replace /events organizer. Reuse Button/Input/Label/Textarea, cn, Geist and Lucide. Canvas is custom business UI because primitives cannot draw 2000 seats with accessible inspector. Use scoped Sprint2 tokens so WIP design system remains intact.

## API contract

- Import/preview: `{seats:[{row:string,seatNumber:positive integer,category:string}]}`; <=2000, <=5MB; errors `{index,field,message}`. Preview POST validates only. Import locks showtime, batch inserts and commits categories/seats together; structural lock persists after first opening.
- Owned GET showtimes/:id/manage, /manage/seats; PATCH prices `{prices:[{id,price}]}` integer0..2147483647; PATCH status `{status:ON_SALE|CLOSED}`. Session + ORGANIZER + owner required.
- Public GET showtimes?cursor, showtimes/:id, showtimes/:id/seats; owner/internal fields omitted. Stable cursor (startTime,id); static snapshot only, no long-lived browsing snapshot guarantee across mutations.
- Cache page keys include transactional DB catalog revision, expiry30s; failures fall back to DB. In-flight old fills cannot populate new revision.
- Hold routes, timer, cleanup and T31 remain blocked; future import occupancy checks must join authoritative holds/tickets under the same showtime lock before those models are enabled.

## Rollback / checkpoints

Preserve applied migrations. Verify apply → new compensation → new reapply on a NEW isolated database, keeping all history. Compensation only on empty test database; shared database needs backup/data review. Restore code selectively from WIP snapshot, never reset whole tree. Checkpoint2 backend + tests; 3 Stitch UI; 4 real flows/security; 5 raw performance; 6 local gates and handoff. No external writes.
