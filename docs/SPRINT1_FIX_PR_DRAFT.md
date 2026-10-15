Sprint1 login thiếu giới hạn IP, thời gian suất diễn phụ thuộc múi giờ máy và form không khôi phục khi hết phiên. Bản sửa dùng Redis counter chung, HMAC xác thực transport peer qua custom web entry, UTC/VN roundtrip và draft recovery đúng người dùng; giữ V1, account5fail/15phút, isActive và STAFF từ develop.

Git Flow: feature/sprint1-acceptance-20261015 → develop (baseline07d683fc). Không tích hợp S-32 từ main hoặc sửa migration. Dependency patches Next16.3.8/sharp0.35.5/deepmerge8/mysql2_3.23.1/source-map-js1.2.2; devundici6.28.1/tmp0.2.7. Vendor nguyên byte CSS MIT từ shadcn4.21.0 rồi bỏ CLI runtime.

Local validation: frozen install, build/lint/typecheck;219API+104web unit;85integration ở DB riêng;15browser desktop/mobile; real API/Redis TTL/restart; Docker image build AND runtime smoke. Coverage cùng Vitest/V8_4.1.11: API lines7.89→76.57%,web23.94→77.52%; changed-line/branch report có mẫu số riêng. Prod audit0; full audit còn1high braces chưa có bản vá. Security diff không finding mới trong snapshot/supplement đã ghi; không là review người thật.

Config mới: AUTH_PROXY_SECRET server-only≥32ký tự khớpweb/API; WEB_PORT; supported custom entry, không bare next start. Không migration mới. Guarded demo3440/3441/PG15445/cache16395; private credentials .sprint1-local/config.json, không đưa vàoPR.

Draft để review, chưa merge: full dependency DoD chưa sạch; candidate CI sau push còn chờ; ít nhất một thành viên khác review; laptop LAN staging (thay Render theo người dùng) + HTTPS/team access/autodeploy<10min/failure-retains-old/rollback và K01 staging/NFR chưa đạt. Cloudflare Tunnel là giai đoạn sau. Không dùng xanhCI/localDocker để tuyên bố SprintDone.

Rollback: revert code qua PR được review, giữ DB/volume/khóa hiện hữu; dùng migration bù nếu sau này có schema change. Không reset hoặc bypass protection.
