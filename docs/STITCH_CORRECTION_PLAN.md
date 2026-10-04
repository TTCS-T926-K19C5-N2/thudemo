# Sửa độ khớp Stitch và code sản phẩm — 04/10/2026

Nguồn yêu cầu mới: ../docs/prompts/PROMPT_CORRECT_STITCH_FIDELITY_AND_PRODUCT_CODE.md. Snapshot WIP hiện tại: .git/stitch-correction-20261004. Evidence mới: evidence/stitch-correction/20261004, giữ nguyên run trước. Node24.21/pnpm10.15.1/TECH01+02 giữ nguyên.

| Cũ | Trách nhiệm → mới | Nơi gọi / hồi quy |
|---|---|---|
| components/sprint2/shell | components/layout/PublicLayout,OrganizerLayout | public/home/login/owned routes, responsive |
| public-catalog | features/event-catalog/EventCatalog | cursor/cache/data/asset stable |
| public-show | features/event-catalog/PublicShowtime + features/seat-selection/SeatSelection | detail metadata, auth return, canvas |
| showtime-manager(mode) | workspace fetch/context; forms tách seat-map-import/seat-pricing; sale control showtime-management | ownership/import preview DB0/save/status locks |
| seat-map money/types | renderer components/seat-map; lib/formatting; lib/contracts | 2000 keyboard/status/render benchmark |
| request generic cast | lib/api/client + runtime decoders | status/code/field/conflict errors preserved |
| sprint2.css/s2-* | product.css + product-* tokens sourced from exact HTML | before/after29ledger, computedfont |
| public/sprint2/modulo | images/events; nullable event presentation fields | DB stable mapping; pagination sameasset |
| catalog:sprint2 | catalog:showtimes:contract-v3 | namespace/revision/cold warmtests |
| login presets/dark branch | real LoginForm consistent accepted light layout | wrong password/offline/sessionexpired/return |

Contract addition minimal: event posterPath/mobilePosterPath/bannerPath/categoryLabel nullable; seed only stable known synthetic IDs in separate fidelity DB; no CMS/upload/genre filter feature. Existing data untouched, fallback noimage meaningful. Applied migration001 unchanged; additive migration004.

Read all29 raw HTML via parser source-specs.json, trace SHA256/config/styles/control classes. HTML/render overrides generaldesignMd. Use accepted desktop1280/mobile390 CSS dimensions, not 2x bitmap. Geist, exact per-screen tokens; source rows6fixture controlled, future filters disabled honestly. Gatehold states remain unintegrated, no fake success.

Order: snapshot → sharedcontracts/layout/token/asset → workflow forms → catalog and all main/state screens → browser/diff/29ledger → localregression+bench → report. No production/remote writes, no workbook/task status edits. Rollback selectively snapshot; don't reset WIP or edit applied migration.
