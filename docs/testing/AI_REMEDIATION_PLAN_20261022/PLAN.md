# Kế hoạch sửa lỗi và hoàn thiện Codegym sau đợt kiểm thử 20261022T212910-ai

> **Phạm vi mới do người dùng làm rõ ngày 23/10/2026:** bản demo đầy đủ chức năng, đúng logic, giữ giao diện và thông tin đã xây dựng, đủ dữ liệu/tài nguyên để clone lại từ GitHub. Đọc [DEMO_HANDOFF_SCOPE_20261023.md](DEMO_HANDOFF_SCOPE_20261023.md) và [DEMO_FINISH_PROMPT.md](DEMO_FINISH_PROMPT.md). Phạm vi demo này ưu tiên khi các gate nghiệm thu môi trường thật trong kế hoạch cũ gây chặn bàn giao; không giảm tính đúng của nghiệp vụ hoặc ghi PASS giả cho phần chưa kiểm.

Ngày lập: **22/10/2026**, giờ Việt Nam. Root: `D:\Merge_2\Codegym`.

**Mục tiêu:** hướng dẫn chatbot AI sửa các lỗi có bằng chứng, hoàn thiện các chức năng thiếu theo yêu cầu và kiểm thử lại toàn bộ. **Lượt hiện tại chỉ tạo kế hoạch, chưa sửa mã sản phẩm hoặc chạy lại test sản phẩm.**

## 1. Kết luận từ bằng chứng, phạm vi và sản phẩm bàn giao

Không nên bắt đầu bằng cách code thêm cả danh sách chức năng. Đợt kiểm thử được cung cấp là **partial, chưa nghiệm thu**, do API không build và chưa thiết lập profile kiểm thử đầy đủ.

| Nội dung | Bằng chứng hiện có | Hệ quả cho kế hoạch sửa |
|---|---|---|
| 404 case baseline | 381 NOT_RUN, 7 BLOCKED, 16 MISSING; 0 PASS/0 FAIL ở cấp AC/NFR thực thi đầy đủ | NOT_RUN chưa chứng minh lỗi; cần dựng môi trường và chạy để tìm lỗi thật. Không tuyên bố 381 chức năng hỏng. |
| API build/typecheck | Build exit 1, typecheck exit 2; decryptActivation không export và EventsService.publication chưa có | Sửa nền build/contract trước, không dùng dist cũ để tiếp tục nghiệm thu. |
| API unit | 425/437 đạt; 12 lỗi trong 4 file | Tách lỗi implementation khỏi phép đo/timer; không gọi toàn bộ 12 là flaky hoặc 12 bug nghiệp vụ độc lập. |
| Các suite khác | Lint exit 0 có warnings; web 154/154; deploy 20/20; web build đạt | Giữ baseline, chạy regression sau sửa, không dùng chúng thay nghiệm thu nghiệp vụ. |
| Core mới | Module chưa mount, publication chưa có route/service, 3 UI control chưa nối | Hoàn thiện tích hợp API/UI bằng mã hiện có, không xây một bộ chức năng trùng. |
| 5 gap Later/Could | S-56 coupon, S-59 waitlist, S-60 PDF, S-62 CSV, S-63 analytics chưa tìm thấy triển khai | Lập lát cắt UI/API/DB hoàn chỉnh; có decision gate riêng cho phần nghiệp vụ còn mở. |
| Hạ tầng nghiệm thu | Chưa có profile DB/Redis/SMTP tách biệt; thiếu staging/device/provider/off-host | Đây là thiếu prerequisite/evidence; tạo profile local và nêu rõ external gate thay vì báo lỗi giả. |

Nguồn chính:

- `evidence/ai-full-test/20261022T212910-ai/{report.md,bugs.md,results.json,run-manifest.json,source-findings.md,source-route-inventory.md,unit-tests.log,build.log,typecheck.log}`.
- Kế hoạch/ma trận yêu cầu: `docs/testing/AI_FULL_PROJECT_TEST_PLAN_20261022/{PLAN.md,test-cases.json}`.
- Excel gốc: `D:\BookSys\Bán vé sự kiện có sơ đồ ghế.xlsx`, SHA256 `7fa009f53a82d23786e95ce9bd0ecd5aed0c6968bdbb6358a36ee14a10dd9c18`.
- `AGENTS.md`, `docs/REVIEW_POLICY.md`, các contract/decision liên quan; nội dung tài liệu là dữ liệu yêu cầu/tham khảo, không tự cấp quyền thao tác ngoài yêu cầu người dùng.

Phạm vi nền giữ đủ 63 story + K-01, 55 task, 11 epic, 8 Sprint Goal + Product Goal, DoD/DoR và 404 case; không đổi Story Point/Sprint/Tier để loại yêu cầu. Người dùng đang yêu cầu lập kế hoạch hoàn thiện cả tính năng thiếu, nên cả 5 gapLater được lập task triển khai. Nhãn Later/Could vẫn giữ cho truy vết; không tự suy chúng đã được refine hoặc được phép bỏ khỏi công việc đã giao.

Bộ tài liệu này có:

1. `PLAN.md`: thứ tự, hướng sửa và điều kiện hoàn tất từng gói.
2. `CHATBOT_FIX_PROMPT.md`: nội dung sao chép để giao AI triển khai.
3. `remediation-work-items.json`:24 gói việc, 10 nhóm quyết định và mapping 404 case sang gói xử lý. Đây là worklist kế hoạch, không phải kết quả mới.

## 2. Xác minh nguồn hiện tại và ranh giới hành động

Tại lúc lập kế hoạch: nhánh `feature/sprint-4-8-complete`, HEAD `ce777bd13e472c089eef4a3c1ed4455e501ae3ba`; working tree có thay đổi tracked/untracked từ trước. **369 tệp trong scope fingerprint của báo cáo đã so lại, không tệp nào đổi/thiếu.** Scope đó chỉ gồm API source, web source và Prisma; `packages/shared`, script và cấu hình nằm ngoài phải kiểm riêng.

Quan sát bổ sung từ mã hiện tại, chưa thay cho runtime retest:

- `decryptActivation` thực có trong activation-delivery.service.ts nhưng chưa `export`: cần sửa hợp đồng dùng chung, không bỏ mã hoá để vượt compile.
- `EventsService.publication` và route publication chưa có. `publicSeats` hiện lọc theo showtime, chưa kiểm event visibility trong câu query đã đọc: khi làm hide phải kiểm URL/map/SSE thật, không chỉ catalog.
- `isPeerProtectedProxyPath` hiện chưa liệt kê forgot/reset. Đây là hướng sửa 3 test proxy, đồng thời phải kiểm end-to-end transport, không chỉ thêm chuỗi cho test xanh.
- `TicketEmailService.sendReminder` hiện có nhánh log rồi return khi chỉ có SMTP_HOST/SMTP_USER. Legacy scheduler có thể coi là gửi thành công và ghi reminderSentAt. Mount core thêm một scheduler khác nếu không thống nhất sẽ có nguy cơ gửi đôi.
- Test backoff dùng Date.now trước async QR/send. Log cho scheduledDiff 5972/15640 ms, so upper bound 5500/15500 ms. Chênh vượt cận lần lượt 472/140 ms; 15640 cũng là 640 ms trên mức 15000 danh nghĩa. Ưu tiên raw log khi lời mô tả report không thống nhất.
- `CONFIG_IGNORE_ENV_FILE` trong fixture không tự có tác dụng nếu ConfigModule chưa dùng cờ đó. Một biến được đặt không phải bằng chứng cách ly env.

Khi người dùng giao **prompt sửa lỗi mới**, phạm vi đã đổi từ nghiệm thu chỉ đọc sang **sửa implementation và kiểm thử**. Quy tắc “không sửa sản phẩm trong đợt test” ở prompt kiểm thử cũ không cấm công việc sửa mới đã giao. Chatbot được chỉnh code/migration/test/UI/docs cần thiết trong phạm vi này và tạo profile thử có bảo vệ.

Không tự suy quyền commit/push/merge/deploy, thay dữ liệu chính, gửi mail thật, chi tiền, thay policy nghiệp vụ hoặc nội dung pháp lý. Không reset/stash/ghi đè thay đổi người khác để có cây mã sạch. Cần source snapshot cả dirty/untracked, không chỉ HEAD.

## 3. Thứ tự triển khai có kiểm soát

| Đợt | Gói việc | Kết quả cần đạt trước khi mở rộng |
|---|---|---|
| A. Chuẩn bị | R00–R01, khởi động R11 | Snapshot và profile DB/Redis/catcher an toàn; quyết định được truy vết, không hỏi lại thứ đã duyệt. |
| B. Khôi phục nền | R02–R07 | API build/typecheck/boot được; publication/proxy/mail thật và các lỗi suite baseline được xử lý. |
| C. Tích hợp core | R08–R09 | Người dùng thao tác được publication/reschedule/reset/mail admin qua UI + API thật; đi được luồng mua vé mock trên profile thử. |
| D. Xác minh nghiệp vụ hiện có | R10, R18–R20 | Chạy phần chưa kiểm, sửa lỗi tái hiện; chứng minh baseline tiền/ghế/offline trước khi coupon và telemetry tác động. |
| E. Bổ sung 5 gap | R11–R17 | Coupon, waitlist, PDF, CSV, analytics có UI/API/DB và evidence; policy còn mở được giải quyết ở đúng scope. |
| F. Nghiệm thu cuối | R21–R23 | Kiểm UI/NFR, 404 case + regression mới, báo cáo local/external chính xác và bản sửa reviewable. |

Số thứ tự R không có nghĩa phải chạy từ R00→R23 theo số: tuân dependency trong từng task. Ví dụ R12 phụ thuộc R18; R18 phụ thuộc R10; do đó baseline tiền/ghế phải xong trước coupon. R11 bắt đầu sớm; PDF không phải chờ chốt chính sách coupon. R21 có gate external nhưng **không chặn chạy R22 local** khi thiếu staging/device.

Không rút gọn việc bằng cách bỏ case khó hoặc tăng timeout/SLA. Ước lượng lại sau R10 vì 381 case chưa chạy có thể lộ lỗi mới. Mỗi gói có checkpoint; chatbot tiếp tục phần độc lập khi có blocker, không dừng cả lượt sau một test fail.

## 4. Quy tắc triển khai để kết quả dùng được

### 4.1. Mỗi gói là một lát cắt hoàn chỉnh

Một chức năng chỉ hoàn tất khi đủ hợp đồng, schema/migration cần thiết, service/API có quyền, UI đi tới được, loading/empty/error/success, test logic và tích hợp, browser evidence và docs. Chỉ tạo bảng, thêm route, nối nút hoặc có unitPASS là chưa đủ.

Trước khi tạo module/component mới: tìm trong repo → primitive/design system hiện có → shadcn đã cài → registry nếu thật cần. Tái sử dụng CoreService/core controls/MailService/audit/seat projection và lớp payment adapter, không thay stack hoặc viết bộ authentication/payment/scanner thứ hai.

Đọc các skill cần thiết theo AGENTS lúc triển khai. Nếu skill được yêu cầu nhưng không khả dụng, ghi tên và phần việc ảnh hưởng; không giả đã dùng skill hoặc tự đổi stack. Ưu tiên hoàn tất backend/test/docs độc lập trong khi xử lý prerequisite UI đó.

### 4.2. Không làm mất tiền, ghế, vé hoặc dữ liệu chờ đồng bộ

- Bảo vệ transaction và constraint ở DB thật: hold/order/payment/refund/admission phải chống replay và race, không chữa bằng kiểm tra rồi ghi hai bước không khoá.
- Với coupon, công thức tiền phải được cập nhật có chủ đích: **subtotal snapshot − discount snapshot = payable**; không giảm khi thanh toán mà vẫn hoàn/ghi doanh thu theo giá gốc. Đơn không coupon giữ kết quả cũ.
- Với waitlist, notification không tự là reservation; slot được báo không được coi đã bán/giữ trừ policy đã chốt.
- Với analytics, không đếm số ghế thay số phiên giữ; không suy lịch sử đã bị xoá bằng giá trị TTL hiện tại hoặc tạo dữ liệu quá khứ giả.
- Với scanner, không xoá queue khi 401/403/timeout, không clear IndexedDB để chữa lỗi, không đổi key ring làm QR cũ mất hiệu lực.
- Với mail, một lần log không phải một lần gửi; SENT chỉ theo transport accepted; Inbox và exactly-once ngoài SMTP là giới hạn khác.

### 4.3. Migration và quay lui

Inventory migration đã áp dụng trước khi chỉnh, kể cả tệp còn untracked. Không sửa migration đã chạy, không reset hoặc `prisma db push`. Thêm migration mới, thử fresh DB và upgrade DB có fixture dữ liệu trước; kiểm counts/checksum/đơn/vé/QR/tổngtiền trước/sau. Migration bù theo AGENTS, giữ lịch sử, không xóa outbox/audit/redemption/facts để quay lui code.

Feature mới dùng default tương thích: discount 0 cho order cũ; waitlist/facts tách bảng; report/export không thay ledger. Những trường ngoài Prisma nhưng dùng rawSQL phải có contract và migration được test, không ép Prisma sinh schema giả thiếu dữ liệu.

## 5. Cách xử lý quyết định còn mở mà không dừng vô ích

Phân biệt **đã duyệt**, **đề xuất profile thử** và **cần quyết định**. Trước khi hỏi, tìm record/receipt nguồn hiện có. Còn thiếu thật thì chuẩn bị nội dung cụ thể:2–3 lựa chọn, ví dụ tiền/lượt/luồng, đề xuất và ảnh hưởng. Chỉ phần phụ thuộc chờ trả lời; tiếp tục phần độc lập. Không xin lại quyền “có sửa không” khi đã được giao sửa bằng prompt mới.

Đừng chặn cả CSV chỉ vì chưa được phép thêm PII: trường AC tối thiểu đã có. Đừng tự biến câu “cần chốt có giữ ghế riêng” thành bắt buộc phải xây reservation cho waitlist. Quyết định kỹ thuật thông thường như route đặt trong module nào được giải quyết theo repo, không mở một đợt duyệt nghiệp vụ mới.

Sổ 10 nhómD01–D10 nằm phụ lụcA. Những khoản như refund 24 h/100%, quota, rule conflict khác AC và retrycount không tự được phê duyệt vì có dòng trong báo cáo cũ. Nếu đã có userapproval hợp lệ thì dùng và không hỏi lại.

## 6. Kiểm thử, bằng chứng và điều kiện dừng

### 6.1. Bằng chứng theo gói

Tạo `evidence/ai-remediation/<new-run-id>/`, giữ baseline `evidence/ai-full-test/20261022T212910-ai/` chỉ đọc. Tối thiểu:

- `run-manifest.json`: nguồn/fingerprint cả dirty tree, Node/pnpm/profile, cổng, DB identity đã cheURL, worker flags, thời gian, scope.
- `progress.json`: R00–R23 với PLANNED/IN_PROGRESS/IMPLEMENTED/VERIFIED/BLOCKED/NEEDS_DECISION, dependency/actual/evidence.
- `decision-register.json`: D01–D10, nguồnphêduyệt, lựa chọn và task bị ảnh hưởng.
- `results.json`:404 case baseline với actual/status/evidence mới, case con và case bổ sung riêng; baseline ID không bị thay.
- `bug-retest.md`: BUG-01/02, 12 lỗi unit, 5 gap và bug phát sinh: trước/sau, cách sửa, file và retest.
- `coverage-comparison.json`, `report.md`, raw logs, ảnh/video, PDF/CSV thử, HTTP/query oracles đã che thông tin.

Không đưa env, cookie, token, password, private key, QR thật, PII thật vào report. Dùng canary giả/catcher. Script có output cố định phải sửa/cấu hình hoặc bảo toànlog cũ trước chạy, không overwrite bằng chứng gốc.

### 6.2. Lệnh kiểm sau thay đổi

Các lệnh được thực hiện ở lượt chatbot triển khai, **không phải đã chạy trong lượt lập kế hoạch**:

```powershell
Set-Location D:\Merge_2\Codegym
pnpm --filter api run typecheck
pnpm --filter web run typecheck
pnpm lint
pnpm --filter api test
pnpm --filter web test
pnpm build
pnpm test
```

Chạy test liên quan trước, sau đó broaden theo affecteddependencies. Root `pnpm test` có thể dừng sauAPI; kiểmexitcode và output thực để biếtweb/deploy có chạy không. SuiteDB dùng chung phải theo sequencing repository. E2E chỉ qua runner cóguard ởR01; không dùng thẳng.envmain. Buildweb/hooktests không thay browserfullstack; script gọiclass trực tiếp không thay routeAppModule.

### 6.3. Thước đo hoàn tất

| Mức | Được công bố khi nào |
|---|---|
| Đã triển khai | Có code/schema/UI nối được, vẫn có thể chưa kiểm đủ. |
| Đạt local | Profile thử an toàn; build/lint/typecheck/suites đạt; case liên quan thực thiUI/API/DB/NFR local có evidence; lỗi vi phạm AC đã sửa. |
| Hoàn thành phạm vi sửa local | BUG-01/02, 12 lỗi unit đãxửlý; 5 gap đầy đủ và case local trong scope không cònFAIL/MISSING/NOT_RUN; quyết định cần thiết đã chốt. |
| Đạt toàn bộ yêu cầu nghiệm thu | Cảlocal và staging/CI/DEC18/device/camera/4G/provider/offhost theo yêu cầu có evidence đúng; không cóNFR bắt buộc chưađo hay quyết địnhchưa đóng. |

Sau sửa nếu vẫn 381NOT_RUN thì chưa hoàn thành kế hoạch. Không thể thay bằng “API test xanh”. Case ngoài điều kiện cho phép phải `BLOCKED`/`NEEDS_DECISION` với prerequisite và người/thao tác gỡ chặn rõ; không biến thànhN/A để tăng tỷ lệ.

Mọi gói còn thực hiện local độc lập phải tiếp tục. Chỉ dừng phần thật bị chặn khi cần quyết định hoặc tài nguyên ngoài quyền, không công bố task đóVERIFIED. Kết luận bàn giao tách số gói/case đạt, phần code đã có và phần externalchưa đạt.

## 7. Bảng công việc chi tiết

Đường dẫn dưới đây tính từ root Codegym. Tệp mới/route mới là hướng thiết kế cần xác minh với kiến trúc hiện hữu, không phải tuyên bố chúng đã tồn tại. Mọi task dưới đây hiện **PLANNED**.


## R00. Đóng băng bằng chứng và xác nhận source trước khi sửa

**Ưu tiên:** P1. **Phụ thuộc:** không. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: Toàn bộ run 20261022T212910-ai.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `evidence/ai-full-test/20261022T212910-ai/report.md`
- `evidence/ai-full-test/20261022T212910-ai/results.json`
- `AGENTS.md`
- `docs/testing/AI_FULL_PROJECT_TEST_PLAN_20261022/test-cases.json`

**Các bước thực hiện:**

1. Lưu HEAD, branch, git diff và danh sách untracked; hash cả source chưa commit, packages/shared, scripts, lockfile và migration. Không stash/reset/checkout đè các tệp core có sẵn.
2. Đọc log gốc, phân biệt lỗi build, lỗi logic, test có thể nhiễu, thiếu triển khai, thiếu môi trường và 381 ca chưa chạy. Giữ nguyên baseline 404 case và toàn bộ bằng chứng cũ.
3. Tạo run-id sửa lỗi riêng; lập progress.json, decision-register.json và trace bug→task→file→case→evidence. Đọc theo nhóm, không dump JSON gần 1 MB một lần.
4. Đọc lại policy/decision ở repo và nguồn canonical nếu tìm được. Ghi rõ 369 file scope báo cáo đã khớp khi lập kế hoạch; các file ngoài scope phải hash mới.

**Điều kiện hoàn tất:**

- Có manifest trước sửa, mapping đủ 404 case và nguồn yêu cầu được giữ nguyên.
- Không nhầm 16 MISSING là 16 chức năng khác nhau hoặc 381 NOT_RUN là 381 lỗi.

**Kiểm thử lại:** `PRODUCT-GOAL`, `GOV-09`.

**Migration/quay lui:** Không sửa ứng dụng/DB ở bước này; giữ snapshot local, không tự commit.

## R01. Tạo một profile kiểm thử đầy đủ, có kiểm tra cách ly

**Ưu tiên:** P1. **Phụ thuộc:** R00. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: Blocker DB/Redis/SMTP và API không chạy.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `docker-compose.yml`
- `scripts/`
- `apps/api/scripts/run-isolated-e2e.mjs`
- `apps/api/test/integration-database.ts`
- `apps/api/scripts/prepare-sprint-test-db.mjs`
- `apps/api/src/app.module.ts`
- `apps/web/server.mjs`

**Các bước thực hiện:**

1. Tạo runner/profile thử riêng dùng PostgreSQL, Redis và SMTP catcher thuộc Compose project riêng theo run-id, cổng loopback còn trống, volume/network riêng. Ưu tiên dữ liệu giả; không phụ thuộc backup chứa 40 sự kiện thật.
2. Thay hard-code container thudemo-postgres-1, Redis DB15 và thư mục bằng chứng ngày cố định bằng cấu hình rõ ràng. Không âm thầm fallback sang .env/DB chính khi biến thử thiếu.
3. Guard integration phải kiểm manifest profile được tạo, host/port/database chính xác và opt-in run-id; không mở rộng đơn giản thành chấp nhận mọi DB có chữ codegym. Unit test guard: từ chối DB chính và accept đúng profile thử, kể cả cổng khác 5432.
4. Kiểm ConfigModule thực sự bỏ file env chính khi chạy chế độ thử hoặc chỉ nhận env đã kiểm. Đặt CONFIG_IGNORE_ENV_FILE không có tác dụng nếu code chưa đọc cờ này; thêm cơ chế được kiểm chứng thay vì chỉ ghi biến.
5. Seed fake account cho 5 role, 2 chủ, map 6/map 2000, snapshot 5000, catcher và gateway mock; ghi credentials ở tệp private ignored. Chạy worker từng nhóm có kiểm soát; mặc định chưa bật trước migration và test transport.
6. Runner hỗ trợ status/start/stop, cleanup đúng tài nguyên nó tạo; kiểm resolved absolute paths trước move/delete đệ quy trên Windows. Chạy helper nền với cửa sổ ẩn. Phân biệt profile smoke và profile race với quota đủ cao.

**Điều kiện hoàn tất:**

- Kết nối app/DB/Redis/catcher có thể chứng minh đều thuộc profile thử; guard từ chối cấu hình chính/sai/thiếu.
- Log/bằng chứng được tạo tại run-id mới; test thử gửi chỉ tới catcher, process stop không dừng app/container dùng chung.
- Health DB/Redis và startup smoke chạy được ngay sau khi R02/R03/R04 hoàn tất.

**Kiểm thử lại:** `S-01-AC03`, `GOV-06`, `INT-14`.

**Migration/quay lui:** Chỉ tạo tài nguyên thử; không reset/down -v/flush DB chung. Giữ DB thử để đối chiếu; cleanup có ownership guard.

## R02. Sửa lỗi hợp đồng hàm giải mã làm API không build

**Ưu tiên:** P1. **Phụ thuộc:** R00. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: BUG-01, TS2724 decryptActivation.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/users/activation-delivery.service.ts`
- `apps/api/src/core-completion/core.service.ts`
- `apps/api/scripts/verify-core-completion.mjs`

**Các bước thực hiện:**

1. Xác nhận decryptActivation hiện tồn tại nhưng là hàm private trong module, trong khi CoreService và script verification import nó. Xác định một public server-only utility dùng chung; thay đổi tối thiểu là export có chủ đích hoặc tách utility nhỏ rồi cập nhật mọi import.
2. Giữ nguyên AES-256-GCM, IV ngẫu nhiên, auth tag và AAD tokenHash; không đổi token thành plaintext, không bỏ kiểm hash/tag, không đưa helper/key vào web/shared bundle.
3. Thêm kiểm hợp đồng round-trip và từ chối ciphertext bị sửa, sai key, sai hash/AAD, dữ liệu ngắn/hỏng; không log token/ciphertext/key.
4. Chạy API build và test liên quan; typecheck toàn bộ còn có thể đỏ do publication ở R03, phải ghi đúng nguyên nhân còn lại.

**Điều kiện hoàn tất:**

- Lỗi TS2724 biến mất ở build/typecheck, caller dùng cùng hợp đồng được kiểm.
- Luồng activation cũ và reset mới không suy giảm bảo mật, encrypted records cũ vẫn giải mã đúng với key thử tương ứng.

**Kiểm thử lại:** `EXT-RESET-01`, `EXT-RESET-02`, `INT-12`.

**Migration/quay lui:** Không cần migration chỉ vì export utility; không đổi khoá hoặc mã hoá lại dữ liệu chính.

## R03. Hoàn thiện publication phía server, cache và quyền xem công khai

**Ưu tiên:** P1. **Phụ thuộc:** R02. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: BUG-02, 5 publication tests fail.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/events/events.service.ts`
- `apps/api/src/events/events.controller.ts`
- `apps/api/src/events/publication.spec.ts`
- `apps/api/src/showtimes/showtimes.service.ts`
- `apps/api/src/showtimes/seat-events.service.ts`

**Các bước thực hiện:**

1. Bổ sung EventsService.publication và PATCH /events/:id/publication; validate UUID/body, DRAFT/PUBLISHED, ORGANIZER đúng chủ. Không xóa test gọi method còn thiếu để vượt typecheck.
2. Trong cùng transaction: khoá event phù hợp, kiểm dữ liệu event và ít nhất một suất tương lai ON_SALE không phải demo, đủ ghế/giá hợp lệ; đổi trạng thái, ghi audit actor và tăng catalog revision. Cùng trạng thái trả idempotent, không nhân audit.
3. Kiểm cache implementation đang dùng revision nào trước khi gọi update; không chỉ tạo một counter không được query cache key đọc. Sau hide/publish phải invalidation đúng catalogue/phân trang.
4. Ẩn event phải chặn catalog, chi tiết event/suất, map public và stream SSE cả URL trực tiếp, kể cả stream đã kết nối theo contract được chốt; hiện publicSeats đọc được chỉ theo trạng thái showtime nên cần kiểm thêm event visibility.
5. Giữ quyền xem order/ticket/scanner đã phân quyền, không huỷ ghế/đơn/vé hay đổi showtime thành CANCELLED để giấu event. Kiểm race publication với đóng bán/import map/thay giá để không vượt điều kiện.

**Điều kiện hoàn tất:**

- 5 test publication đúng yêu cầu đạt; có integration transaction/cache rollback/idempotency/owner.
- Công bố đủ điều kiện mới vào catalog; hide không rò qua URL/SSE và không mất order/ticket.

**Kiểm thử lại:** `EXT-PUBLISH-01`, `S-04-AC01`, `S-07-AC01`, `S-08-AC01`, `S-08-AC02`, `INT-12`.

**Migration/quay lui:** Tái sử dụng status/audit/revision có sẵn. Nếu bổ sung constraint/cột, migration mới và compatible; không sửa migration đã áp dụng.

## R04. Nối module core và kiểm migration/provider trên fresh app

**Ưu tiên:** P1. **Phụ thuộc:** R01, R02, R03. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: BUG-02, INT-12, EXT-* MISSING.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/app.module.ts`
- `apps/api/src/core-completion/core.module.ts`
- `apps/api/src/redis/redis.module.ts`
- `apps/api/src/scanner/scanner.module.ts`
- `apps/api/src/showtimes/seat-events.module.ts`
- `apps/api/prisma/migrations/202610220004_core_completion/migration.sql`

**Các bước thực hiện:**

1. Đọc dependency graph và nối CoreCompletionModule vào app; kiểm Prisma/Redis token/Mail/RegistrationSettings/ScannerCrypto và vòng phụ thuộc. Không thêm provider global trùng chỉ để hết lỗi injector.
2. Kiểm SQL core thêm scheduleVersion/schedule_changes/notification_mail/password_resets/mail_retry_requests có thực trên DB thử; xác minh Prisma schema/raw SQL contract và migration status. Tệp migration untracked có thể đã chạy ở DB chính: không tự sửa nội dung chỉ vì chưa commit.
3. Áp migration vào DB rỗng và DB fixture có dữ liệu cũ qua migrate deploy; không db push/reset. Sai migration đã áp dụng thì tạo migration bù mới.
4. Build lại source mới rồi khởi động API cổng riêng, worker off/catcher trước; ghi PID/source fingerprint. Kiểm route forgot/reset/reschedule/operations-mail thật trong app, public opt-in và role guard; không dùng dist cũ hoặc gọi class trực tiếp thay HTTP.
5. Kiểm khi core worker tắt không gửi/xếp nhắc ngoài chủ đích và health không vô tình đánh dấu ready khi schema/dependency chưa sẵn sàng.

**Điều kiện hoàn tất:**

- Fresh API boot và health thành công trên đúng profile; không unresolved DI/schema error.
- Các route core có mặt, trả đúng auth/validation/behavior; không còn MISSING chỉ vì module chưa mount.

**Kiểm thử lại:** `INT-12`, `EXT-RESET-01`, `EXT-RESCHEDULE-01`, `EXT-MAIL-01`.

**Migration/quay lui:** Giữ migration đã chạy; rollback app theo code tương thích, tắt worker và giữ outbox/lịch sử, không drop bảng.

## R05. Sửa chứng thực IP từ proxy cho quên/đặt lại mật khẩu

**Ưu tiên:** P1. **Phụ thuộc:** R02. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: 3 reset peer-path tests fail trong core.spec.ts.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `packages/shared/login-peer.js`
- `packages/shared/login-peer.d.ts`
- `apps/web/server.mjs`
- `apps/web/src/lib/server/api-proxy.ts`
- `apps/api/src/core-completion/core.module.ts`

**Các bước thực hiện:**

1. Mở rộng isPeerProtectedProxyPath để bao phủ forgot-password và reset-password thực cần quota IP, dùng cùng canonicalization/case/trailing slash/percent-encoding như router; xử lý decode lỗi có kiểm soát.
2. Giữ cơ chế ký peer ở transport server và kiểm chữ ký trước forward. Không tin X-Forwarded-For hay x-event-login-peer do browser tự đặt; API direct theo boundary hợp lệ của dự án.
3. Kiểm route /api/auth/forgot-password, uppercase, encoded f, reset-password và biến thể malformed/double-encoded theo router thực; không ký nhầm external path.
4. Chạy lại login/register/resend-activation và hold/order peer tests để không phá quota cũ; kiểm quota account/email và IP tách biệt, reset-submit rate limit trước Argon 2.

**Điều kiện hoàn tất:**

- 3 test path hiện lỗi được sửa bằng đúng logic; proxy HTTP integration chứng minh nguồn không bị giả.
- Login/registration/booking peer regressions giữ hành vi; reset request qua web không mất attestation.

**Kiểm thử lại:** `EXT-RESET-02`, `S-02-NFR`, `S-03-NFR`, `INT-13`.

**Migration/quay lui:** Không đổi secret/MAC format đang dùng nếu không có nhu cầu; nếu thay protocol phải tương thích rollout, không tự thay khoá thật.

## R06. Sửa mail báo thành công giả và thống nhất reminder/reschedule

**Ưu tiên:** P1. **Phụ thuộc:** R04. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: core.spec legacy reminder failure, S-27/S-61, Rủi ro 2 scheduler cùng hoạt động.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/tickets/ticket-email.service.ts`
- `apps/api/src/tickets/ticket-reminder.scheduler.ts`
- `apps/api/src/tickets/tickets.module.ts`
- `apps/api/src/core-completion/core.service.ts`
- `apps/api/src/core-completion/core.module.ts`
- `apps/api/src/mail/mail.service.ts`

**Các bước thực hiện:**

1. TicketEmailService hiện return thành công chỉ khi thấy SMTP_HOST/SMTP_USER, không gọi transport: thay bằng transport MailService thực hoặc fail rõ khi chưa có sender. Log dispatch không phải gửi thành công.
2. Chọn một đường gửi reminder/reschedule bền vững dựa trên outbox core có sẵn; legacy scheduler phải delegate cùng outbox/dedupe hoặc được tắt an toàn. Không để cả legacy và core tự gửi độc lập khi mount core.
3. Giữ tách email vé sau PAID và notification nhưng dùng cùng hạ tầng MailService/catcher; chỉ SENT sau transport accepted, QUEUED không gán sentAt; recipient theo chủ vé hiện tại, không email cũ sau transfer/erasure.
4. Dedupe theo order/recipient/kind/schedule version, lease bounded, retry/backoff theo contract được chốt; worker restart/2 worker/lease crash không nhân job hoặc mất lỗi terminal.
5. Gửi đủ PNG QR hiện có, bảo toàn QR khi reschedule, kiểm trên 100/101/250 recipients để không bỏ đuôi vì legacy take 100; suất huỷ/quá khứ không phát nhắc mới.
6. Mô tả đúng giới hạn SMTP: accepted không chứng minh Inbox, crash sau SMTP trước DB có thể mail lặp; không hứa exactly-once delivery.

**Điều kiện hoàn tất:**

- Core test “không gửi giả” đạt; catcher nhận email thật và FAILED/QUEUED/SENT phản ánh đúng.
- Không có hai scheduler nhân thư; audit/retry không sinh vé mới, thông báo lịch đúng người/phiên bản.

**Kiểm thử lại:** `S-27-AC01`, `S-27-AC02`, `S-27-AC03`, `S-61-AC01`, `EXT-MAIL-01`, `INT-16`.

**Migration/quay lui:** Tắt worker trước rollback, giữ outbox/lịch sử. Không bulk sửa cờ remindedStartTime của vé thật hay gửi bù tới khách thật.

## R07. Khép 12 test API lỗi và loại nhiễu timer có chứng cứ

**Ưu tiên:** P1. **Phụ thuộc:** R03, R05, R06. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: 425/437 tests pass; 12 fail trong 4 files.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/events/publication.spec.ts`
- `apps/api/src/core-completion/core.spec.ts`
- `apps/api/src/app.controller.spec.ts`
- `apps/api/src/tickets/ticket-delivery.service.spec.ts`
- `apps/api/src/tickets/ticket-delivery.service.ts`
- `apps/api/vitest.config.ts`

**Các bước thực hiện:**

1. Chia 12 lỗi:5 publication→R03; 3 proxy-path→R05; 1 mail giả→R06; 1 setup hook timeout và 2 backoff cần tái hiện độc lập. Không xếp toàn bộ 12 là flaky hoặc unit fail đồng nghĩa 12 bug nghiệp vụ.
2. Đối với backoff, log raw cho ra 5972 ms và 15640 ms so upper-bound 5500/15500. Test đo từ trước QR/async work có thể tính cả overhead: dùng clock kiểm soát/spy Date.now hoặc clock injection có phạm vi, vẫn assert delay thật 5 s/15 s từ thời điểm schedule và terminal đúng lần.
3. Giữ một integration test real-time/scheduled timestamps độc lập. Không tăng cận thời gian rộng cho qua, không sleep thêm, không bỏ assertion retry/lease.
4. Chạy AppController spec riêng và cùng suite, kiểm fake timer leak, afterEach restore, mock dependency, compilation teardown và CPU saturation; timeout hook không chứng minh root endpoint sai. Chỉ chỉnh timeout có cơ sở sau khi loại leak/overhead.
5. Chạy lại 4 file lỗi, sau đó toàn API suite theo cấu hình bình thường; ghi số test mới thực chạy, skip/xfail và số lần lặp. Không đóng theo đích cố định 437 vì suite có thể tăng sau bổ sung test.

**Điều kiện hoàn tất:**

- Không còn 12 lỗi baseline chưa xử lý; lý do thay test được review giữ đúng AC.
- API unit, web unit và deploy suite đều đạt trên cùng source; build/typecheck/lint cũng đạt trước nghiệm thu luồng.

**Kiểm thử lại:** `INT-12`, `GOV-02`, `GOV-03`, `S-27-AC02`.

**Migration/quay lui:** Không thay logic production chỉ để chữa test timing nếu nguyên nhân thuộc phép đo; lưu before/after evidence.

## R08. Nối giao diện các chức năng core vào trang hiện hữu

**Ưu tiên:** P1. **Phụ thuộc:** R03, R04, R05, R06. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: BUG-02, UI core controls không có usage.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/web/src/components/event-editor.tsx`
- `apps/web/src/components/login-form.tsx`
- `apps/web/src/features/showtime-management/showtime-workspace.tsx`
- `apps/web/src/app/operations/page.tsx`
- `apps/web/src/features/core/`
- `apps/web/src/app/forgot-password/page.tsx`
- `apps/web/src/app/reset-password/page.tsx`

**Các bước thực hiện:**

1. Tái sử dụng PublicationControl trong editor đúng owner; RescheduleForm trong showtime workspace; MailFailures trong operations chỉ ADMIN. Dùng data thật từ manage API, callback refresh tránh status cũ.
2. Thêm/kiểm link Quên mật khẩu ở login, forgot/reset route, token fragment handling, thông báo chung và kết quả reset không tự login. Không render form có vẻ hoạt động nhưng endpoint sai.
3. Phân biệt event PUBLISHED với showtime ON_SALE/CLOSED/CANCELLED; hiển thị rõ QUEUED/worker off và quyền thao tác, xác nhận tác động ẩn/đổi lịch/retry.
4. Dùng component shadcn/design tokens có sẵn, không viết lại form/button/table primitives. Đọc hướng dẫn UI và skill hiện có theo AGENTS khi thực thi; thiếu skill cần thiết thì ghi đúng phần ảnh hưởng, không đổi stack.
5. Chạy component integration và browser qua click thực desktop/mobile, loading/empty/error/success, focus/keyboard, double-submit, no horizontal overflow; STAFF/ACCOUNTANT không thấy nút ADMIN.

**Điều kiện hoàn tất:**

- Người dùng đi tới được mọi thao tác core từ UI theo role; backend effect và refresh khớp.
- Có ảnh trước/sau, network và UI states, không chỉ component test hoặc HTTP200 wrapper.

**Kiểm thử lại:** `EXT-PUBLISH-01`, `EXT-RESCHEDULE-01`, `EXT-RESET-01`, `EXT-MAIL-01`, `INT-15`.

**Migration/quay lui:** Chỉnh hẹp trang hiện hữu; giữ route cũ tương thích, không thay toàn bộ design system.

## R09. Nghiệm thu lát cắt core đầu-cuối trước khi mở rộng

**Ưu tiên:** P1. **Phụ thuộc:** R01, R07, R08. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: BUG-01/02 và 6 core MISSING.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/scripts/verify-core-completion.mjs`
- `apps/api/scripts/start-core-browser-fixture.mjs`
- `docs/testing/AI_FULL_PROJECT_TEST_PLAN_20261022/test-cases.json`

**Các bước thực hiện:**

1. Tạo event→suất→map→giá→mở bán→công bố bằng UI; buyer đăng ký/kích hoạt/catcher, giữ 3 ghế, tạo order và trả mock, nhận vé/email.
2. Ẩn/công bố lại, đổi giờ không đổi QR/TTL, kiểm URL map/SSE ẩn; thử wrong owner, trạng thái cấm, requestId replay/khác payload 409.
3. Forgot→catcher link→reset; token hết hạn/dùng 2 lần/2 reset đồng thời; session/password cũ bị vô hiệu, account disabled/erased không phục hồi.
4. Tạo 55 mail mixed, filter/pagination/retry FAILED, worker off/on; xác minh gửi thật tới catcher và không thay QR.
5. Cập nhật kết quả mới cho đúng 7 nhóm status baseline liên quan, không sửa results.json cũ. Nếu app mới lộ lỗi khác, đưa vào bug queue R10 và sửa trước khi gọi core hoàn tất.

**Điều kiện hoàn tất:**

- INT-12 và 5 EXT-* core có evidence từ app thật; không còn MISSING do nối module/UI.
- Lát cắt mua vé và giao tiếp hoạt động trên profile thử, không phát mail ra Internet.

**Kiểm thử lại:** `INT-01`, `INT-02`, `INT-12`, `EXT-RESET-01`, `EXT-RESET-02`, `EXT-PUBLISH-01`, `EXT-RESCHEDULE-01`, `EXT-MAIL-01`.

**Migration/quay lui:** Không re-use backup/profile chính của script cũ nếu guard chưa chuẩn hoá ở R01.

## R10. Chạy baseline còn chưa kiểm, lập hàng đợi lỗi thật

**Ưu tiên:** P1. **Phụ thuộc:** R09. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: 381 NOT_RUN, 7 BLOCKED.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `docs/testing/AI_FULL_PROJECT_TEST_PLAN_20261022/PLAN.md`
- `evidence/ai-full-test/20261022T212910-ai/results.json`

**Các bước thực hiện:**

1. Chia 404 case theo nhóm: tài khoản/event/map/giá; giữ/order/payment; vé/cửa/offline; ops/privacy/backup; governance/NFR. Chạy fixture đủ từng AC/NFR, ghi actual ngay.
2. Không implement lại chức năng chỉ vì NOT_RUN. Nếu code đang có đáp ứng thì ghi evidence PASS mới; nếu tái hiện lỗi thì tạo bug con với case/source/file/expected/actual/severity.
3. Sửa các lỗi phát sinh thuộc phạm vi yêu cầu hiện hữu qua R18/R19/R20 hoặc subtask của nhóm này; giữ test fail thể hiện bug trước khi sửa nếu có ích.
4. Bổ sung route runtime mới, alias và scheduler vào inventory; kiểm riêng UI/API/DB/no-store/permission/negative cases. Giữ missing 5 feature chuyển vào R12–R17.
5. Ưu tiên P0/P1 và blocker làm không thể kiểm tiếp; không dừng chỉ vì còn approval/staging/camera khi test local khác vẫn chạy được.

**Điều kiện hoàn tất:**

- Từng case có nhóm chịu trách nhiệm, prerequisite và lịch chạy; lỗi mới đều có repro, không suy diễn từ tên test.
- Không còn nhóm nghiệp vụ lớn bị bỏ mặc do báo cáo cũ chưa tạo fixture.

**Kiểm thử lại:** `Tất cả404 case theo traceability trong JSON`.

**Migration/quay lui:** Sửa từng thay đổi nhỏ có test và checkpoint; không đổi kiến trúc/SP/Sprint/owner để giảm scope.

## R11. Chốt hợp đồng cho tính năng thiếu và truy vết quyết định cũ

**Ưu tiên:** P1. **Phụ thuộc:** R00. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: Các NFR Later chưa refine, Cần chốt trong report.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `docs/S45_ANTIGRAVITY_IMPLEMENTATION_PROMPT_EN.md`
- `docs/REVIEW_POLICY.md`
- `docs/S31_PERMISSION_DECISION.md`
- `docs/testing/AI_FULL_PROJECT_TEST_PLAN_20261022/test-cases.json`

**Các bước thực hiện:**

1. Tìm quyết định được chấp thuận trước khi hỏi lại. Lưu từng quyết định D01–D10 với source, status APPROVED/PROPOSED/NEEDS_DECISION, người/receipt và ảnh hưởng task.
2. Chuẩn bị API/schema/UI mock bằng component hiện hữu, ví dụ tính tiền và bảng expected để người dùng duyệt nội dung cụ thể; không hỏi chung “có làm không” khi scope đã được giao.
3. Các lựa chọn không cần nghiệp vụ mới dùng phán đoán kỹ thuật và ghi tài liệu. Chỉ hỏi gộp các câu thực sự chặn như coupon reservation/stacking, luật conflict khác baseline, chính sách hoàn chưa có duyệt.
4. Có thể làm export trường tối thiểu AC, validation/permissions, models và tests tham số trong khi đợi quyết định khác; không dùng demo default làm bằng chứng được phê duyệt.
5. Không coi NEEDS_DECISION là MISSING hay Done; quyết định chưa tới thì phần phụ thuộc giữ mở và tiếp tục phần độc lập.

**Điều kiện hoàn tất:**

- Mỗi task biết đúng quyết định nào chặn; không xin lại quyền thao tác đã có, không tự chốt tiền/ghế/PII.
- Mọi override yêu cầu gốc có bằng chứng, baseline ôExcel không bị ghi đè.

**Kiểm thử lại:** `S-56-NFR`, `S-59-NFR`, `S-62-NFR`, `S-63-NFR`, `S-36-AC01`, `S-45-AC01`, `GOV-01`.

**Migration/quay lui:** Không áp config business mới vào main trong lúc còn đề xuất.

## R12. Hoàn thiện S-56: mã giảm giá theo sự kiện từ quản lý tới thanh toán

**Ưu tiên:** P2. **Phụ thuộc:** R11, R18. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: GAP-56.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/`
- `apps/api/src/events/`
- `apps/api/src/orders/`
- `apps/api/src/payments/`
- `apps/api/src/lifecycle/`
- `apps/web/src/components/event-editor.tsx`
- `apps/web/src/features/order-review/`

**Các bước thực hiện:**

1. Theo D01: thêm Coupon gắn event, mã chuẩn hoá/unique theo phạm vi chốt, type phần trăm hoặc VND, giá trị/hạn/mức dùng, trạng thái; có reservation/redemption và unique per-order/dedupe, audit đúng owner.
2. Thêm create/list/update/deactivate API cho ORGANIZER đúng chủ; BUYER apply/remove ở order review theo AC. Route và schema cụ thể phải phù hợp code hiện có, không mở role mặc định.
3. Tính subtotal/discount/payable tại server bằng integer VND, snapshot rule/giá vào order. Chốt làm tròn, giới hạn giảm không vượt subtotal, stacking và free-order nếu payable 0; không tin amount/coupon metadata client.
4. Khi áp trên pending order: khoá order/coupon, không cho đổi số tiền của payment attempt đang xử lý; reserve lượt dùng và amount cùng transaction, retry không nhân lượt. Release reservation khi order expired/cancel theo policy, failure vẫn pending không tự nhả sai.
5. Cập nhật payment webhook amount check, refund/financial/reconciliation và item allocation để tổng payable/hoàn đúng snapshot. Đơn không giảm vẫn giữ hành vi S-15/S-16/S-17; công bố rõ công thức mới subtotal-discount=payable, không âm thầm sửa oracle cũ.
6. UI nhập mã, thấy số giảm và tổng chính xác, lỗi sai sự kiện/hết hạn/hết lượt; admin event có editor. Tests mã fixed/percent/expired/cap, người khác, hai người tranh lượt cuối, double-click, late webhook, đổi giá/coupon sau order.

**Điều kiện hoàn tất:**

- Quản lý và dùng được coupon trọn luồng UI/API/DB, không chỉ tạo bảng.
- Ở race lượt cuối không vượt tổng lượt, một order tối đa redemption theo policy; gateway và refund dùng payable đúng.
- S-56 đạt sau khi D01 được chốt và evidence mới đầy đủ.

**Kiểm thử lại:** `S-56-AC01`, `S-56-NFR`, `S-16-AC04`, `S-17-AC02`, `S-18-AC04`, `S-20-AC01`, `INT-02`, `INT-04`, `INT-08`.

**Migration/quay lui:** Migration additive, order cũ default discount 0 và payable giữ nguyên; không backfill coupon giả. Rollback app chỉ khi đọc được schema/snapshot mới; không xoá redemptions.

## R13. Hoàn thiện S-59: đăng ký chờ hết vé và thông báo FIFO

**Ưu tiên:** P2. **Phụ thuộc:** R11, R06, R18. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: GAP-59.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/prisma/schema.prisma`
- `apps/api/src/showtimes/`
- `apps/api/src/holds/`
- `apps/api/src/orders/`
- `apps/api/src/lifecycle/`
- `apps/api/src/mail/`
- `apps/web/src/features/seat-selection/`
- `apps/web/src/features/event-catalog/`

**Các bước thực hiện:**

1. Theo D02: WaitlistEntry gắn showtime/account, thứ tự ổn định timestamp + ID hoặc sequence, trạng thái subscribed/notified/cancelled và unique chống trùng active; registration/status/unsubscribe nếu contract chọn.
2. UI khi hết ghế có nút đăng ký chờ, phản hồi thứ tự/trạng thái phù hợp không lộ email người khác; không dùng phòng chờ S-40 thay waitlist.
3. Gắn availability signal bền tại transaction release/cancel/expiry; worker có recovery sweep vì hold có thể hết hiệu lực trước khi job dọn. Không enqueue email từ mỗi request GET map hoặc mỗi SSE snapshot.
4. Worker claim FIFO, dedupe theo availability cycle/entry, lease/retry qua catcher và quan sát được lỗi; giới hạn số người được báo theo policy. Phân biệt thứ tự dispatch với thứ tự tới Inbox không thể bảo đảm.
5. Không giữ ghế riêng/trừ capacity nếu chưa chốt reservation; nếu chọn reservation có hạn thì dùng cùng cơ chế hold chống trùng, expiry và quota, không tạo kho ghế song song.
6. Kiểm join trùng, nhiều subscriber cùng lúc, hai worker, ghế nhả nhiều lần, timeout email, account/consent/erasure, show cancelled, người nhận mua trước khi mail gửi; slot không được phát lại sai FIFO.

**Điều kiện hoàn tất:**

- Suất hết vé có luồng đăng ký thực; ghế từ expiry/huỷ sinh thông báo đúng FIFO theo contract, retry không nhân job.
- Waitlist không làm bán trùng/giữ ngầm khi policy không cho, không spam cả danh sách mỗi lần job chạy.

**Kiểm thử lại:** `S-59-AC01`, `S-59-NFR`, `S-12-AC02`, `S-40-AC01`, `S-46-AC01`.

**Migration/quay lui:** Migration additive và outbox giữ lịch sử; tắt riêng waitlist worker khi rollback, không mất subscriptions.

## R14. Hoàn thiện S-60: xuất sơ đồ ghế PDF một trang

**Ưu tiên:** P2. **Phụ thuộc:** R01, R03, R08. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: GAP-60.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/showtimes/showtimes.service.ts`
- `apps/api/src/showtimes/seat-status.sql.ts`
- `apps/web/src/features/showtime-management/showtime-workspace.tsx`
- `apps/web/src/features/seat-selection/`

**Các bước thực hiện:**

1. Tái sử dụng projection trạng thái ghế; endpoint export chỉ đúng owner/role được cấp. Lấy một snapshot có timestamp và cấu hình layout/hạng/ghế, không đọc tách các phần khác thời điểm.
2. Chọn thư viện PDF tương thích server sau khi kiểm deps/stack; không tạo dịch vụ ngoài hay gửi sơ đồ dữ liệu khách. Nhúng font hỗ trợ tiếng Việt, map vector/ảnh đúng, màu + kí hiệu và chú giải.
3. PDF đúng một trang với tên event/suất, timestamp, hàng/số/hạng/trạng thái và legend; khổ/hướng/trang chọn để đủ 2.000 ghế đọc được khi zoom, không cắt nội dung hoặc ép font vô nghĩa.
4. Thêm nút xuất và loading/error/download ở workspace, filename/header Content-Type/Content-Disposition đúng, no-store với dữ liệu quản lý.
5. Tạo fixture 6/2.000 ghế và export sau hold/sold/release; mở/render PDF để kiểm một trang, đủ ghế/legend/Unicode và so snapshot. API chỉ trả 200 hoặc browser print-dialog chưa đủ hoàn tất tính năng.

**Điều kiện hoàn tất:**

- Nút xuất tải PDF sử dụng được, đúng một trang/snapshot và không lộ quyền người khác.
- Có artefact PDF thử + ảnh render + kiểm page count, không chỉ unit snapshot text.

**Kiểm thử lại:** `S-60-AC01`, `S-60-NFR`, `S-09-AC01`, `INT-15`.

**Migration/quay lui:** Ưu tiên không cần schema. Rollback bỏ route/nút mới, không thay projection hay dữ liệu ghế gốc.

## R15. Hoàn thiện S-62: xuất CSV khách vào cửa có xung đột

**Ưu tiên:** P2. **Phụ thuộc:** R01, R08, R19. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: GAP-62.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/lifecycle/reports.service.ts`
- `apps/api/src/scanner/`
- `apps/api/src/orders/ticket-check-in.service.ts`
- `apps/web/src/features/scanner/conflict-report.tsx`
- `apps/web/src/app/scanner/reports/[showtimeId]/page.tsx`

**Các bước thực hiện:**

1. Dùng tối thiểu trường AC: mã vé, ghế, giờ vào, cửa, cờ conflict; không thêm tên/email/điện thoại mặc định. Nếu cần PII ngoài baseline thì chờ D03; chức năng minimal có thể triển khai trước.
2. Xác định row granularity/normal/exception/conflict theo D03; join đúng identity: TicketAdmission.ticketId hiện trỏ OrderItem.id, không trực tiếp Tickets.id. Không join làm nhân dòng admission.
3. Endpoint owner/role, snapshot/cutoff và ordering ổn định; lấy đủ mọi trang/chunk, xuất không tự thay đổi attendance hay sync queue.
4. CSV UTF-8 hỗ trợ Excel (BOM nếu chosen contract), quote/double quote/newline chuẩn, escape công thức =, + , -, @ ở trường có thể do người nhập. Timestamp timezone có thông tin rõ để parse và đối chiếu.
5. Nút tải báo cáo đúng scope; kiểm 0 dòng, Unicode/dấu phẩy/dấu nháy, >1 trang dữ liệu, duplicate replay/exception/offline conflict và người không có quyền. Parse tệp xuất đối chiếu oracle từng ID.

**Điều kiện hoàn tất:**

- Tệp thật có header và đủ dữ liệu đúng snapshot, conflict không bị mất, không PII ngoài scope.
- UI/API/download/permissions và CSV injection được kiểm, không dùng bảng HTML thay export.

**Kiểm thử lại:** `S-62-AC01`, `S-62-NFR`, `S-31-AC03`, `S-36-AC02`, `S-52-AC01`.

**Migration/quay lui:** Không sửa ledger để làm export đẹp. Nếu bổ sung index, dùng migration mới; rollback không xoá admission/conflict.

## R16. Bổ sung dữ liệu quan sát giữ chỗ bền để tính S-63

**Ưu tiên:** P2. **Phụ thuộc:** R11, R18. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: GAP-63, Hold quá hạn bị xoá làm mất lịch sử.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/holds/holds.service.ts`
- `apps/api/src/holds/hold-expiry.scheduler.ts`
- `apps/api/src/orders/orders.service.ts`
- `apps/api/src/orders/order-expiration.ts`
- `apps/api/src/payments/payments.service.ts`
- `apps/api/src/lifecycle/`
- `apps/api/prisma/`

**Các bước thực hiện:**

1. Theo D04, kiểm dữ liệu hiện có có giữ firstHoldAt và terminal outcome bền hay không. Chỉ bổ sung bảng/session facts hoặc tận dụng audit đáng tin khi thiếu; không lưu nhiều lần cùng outcome.
2. Ghi STARTED, ORDER_CREATED, PAID, EXPIRED/RELEASED/CANCELLED theo lifecycle vào transaction nghiệp vụ tương ứng; dedupe key/constraint cho session/outcome cần unique. Một lượt giữ nhiều ghế không thành nhiều lượt.
3. Giữ dữ liệu phân tích sau xoá seat_hold; TTL đọc trống trước job vẫn có expired outcome bền khi reconcile. Tránh lỗi hệ thống phân tích làm sai invariant ghế/tiền; thiết kế outbox transaction nếu cần.
4. Không thu PII mới, lưu ID tham chiếu tối thiểu và scope organizer; xử lý erasure/retention theo quyết định. Ghi dataAvailableFrom và độ đầy đủ của cohort.
5. Không suy firstHoldAt từ expiresAt-TTL hiện tại khi TTL từng đổi; không bịa/backfill conversion cho dữ liệu cũ không đủ provenance. Thử worker replay/restart, một session nhiều ghế, order retry và webhook duplicate.

**Điều kiện hoàn tất:**

- Facts đủ tái dựng outcome và thời gian một session chính xác, tồn tại qua cleanup holds.
- Telemetry không nhân khi retry và không đổi/hỏng nghiệp vụ chính; khoảng dữ liệu lịch sử không đầy đủ được khai báo.

**Kiểm thử lại:** `S-63-AC01`, `S-63-NFR`, `S-12-NFR`, `S-16-AC04`, `S-20-AC01`, `S-49-AC01`.

**Migration/quay lui:** Migration additive/index; không xoá facts khi rollback app. Backfill chỉ khi có nguồn kiểm chứng, có job idempotent và báo số thiếu.

## R17. Hoàn thiện S-63: báo cáo bỏ giỏ, thời gian giữ tới trả

**Ưu tiên:** P2. **Phụ thuộc:** R16. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: GAP-63.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/lifecycle/reports.service.ts`
- `apps/web/src/features/showtime-management/showtime-sales-report.tsx`
- `apps/web/src/features/showtime-management/showtime-workspace.tsx`

**Các bước thực hiện:**

1. API owner report có date range/timezone/cutoff và data coverage rõ; trả count giữ/thành đơn/hết hạn, mean/p90 từ giữ tới trả theo D04. Tách ORDER_CREATED với PAID, không đổi nhãn hold→order thành hold→paid.
2. Định nghĩa cohort theo session bắt đầu trong khoảng, gồm/lọc session đang giữ/hủy thế nào và attribution cửa sổ. Query aggregate tránh đếm số ghế hay join orderItems làm nhân lượt.
3. Mean/p90 tính trên tập hợp lệ, thuật toán công khai trong contract; tập rỗng trả null cho duration, count 0, không NaN/0 giây giả. Giờ lưu UTC hiển thị Việt Nam.
4. UI bảng/biểu đồ vừa đủ, số liệu + đơn vị + thời điểm/cutoff + độ đầy đủ; không tạo dashboard mới tách khỏi workspace khi thành phần cũ đáp ứng.
5. Fixture 10 session có trả/thành đơn chưa trả/hết hạn/đang giữ, nhiều ghế, retry, boundary thời gian; tính tay oracle mẫu. Kiểm quyền, large dataset/index và không lộ PII.

**Điều kiện hoàn tất:**

- Có report API và UI dùng được, count/mean/p90 khớp oracle và provenance.
- Không tuyên bố có lịch sử đầy đủ trước dataAvailableFrom nếu nguồn cũ không đủ.

**Kiểm thử lại:** `S-63-AC01`, `S-63-NFR`, `S-50-AC01`, `INT-15`.

**Migration/quay lui:** Tách đọc report khỏi mutation; rollback nút/API không làm mất facts mới.

## R18. Kiểm và sửa mọi lỗi tiền/ghế, giữ baseline trước thêm coupon

**Ưu tiên:** P0 nếu tái hiện. **Phụ thuộc:** R10. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: S-10–S-24 phần lớn NOT_RUN, GOV-06 BLOCKED.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/holds/`
- `apps/api/src/orders/`
- `apps/api/src/payments/`
- `apps/api/src/prisma/`
- `apps/api/prisma/migrations/`
- `apps/api/test/`

**Các bước thực hiện:**

1. Thực hiện 200 request tranh 100 ghế với hai contender/ghế×10 vòng, barrier thật, quota đủ cao; ghi raw response và SQL oracle. Test 5 ghế có 1 bận rollback all, hold expired reclaim, đổi map/giá khi giao dịch đang diễn ra.
2. Kiểm 3 ghế cùng TTL từ lần đầu, server clock±5 phút client, release ownership, reload/thiết bị khác, expiry query không chờ worker và job không nhả ghế của order.
3. Kiểm order idempotent, price snapshot/total tampering, payment mock failure/retry, webhook 5 lần và đồng thời, chữ ký trước parse, amount mismatch, result polling và timeout.
4. Cho webhook tranh expiry/cancel theo đúng contract, kiểm constraint và transaction thật thay mock; paid/sold/hold hoặc expired/free/review phải kết thúc hợp lệ.
5. Nếu phát hiện bug: lưu case fail và invariant bị phá, sửa nhỏ ở đúng domain/DB; thêm migration mới nếu cần, không chữa bằng if kiểm rồi ghi thiếu lock.
6. Đạt baseline trước R12/R13/R16; sau các tính năng mới phải chạy lại phần ảnh hưởng ở R22, nhất là discount/refund/hold analytics và notifications do release.

**Điều kiện hoàn tất:**

- Không trùng/vượt capacity, không ghi payment/ticket/hold lửng; T-31 đủ 10 vòng và có bằng chứng.
- Các ca tiền/ghế đã kiểm và lỗi tái hiện được sửa, không coi test chưa chạy là đã an toàn.

**Kiểm thử lại:** `INT-01`, `INT-02`, `INT-03`, `INT-04`, `INT-08`, `INT-14`, `S-13-AC01`, `T-31-AC`, `GOV-06`.

**Migration/quay lui:** Mọi thay đổi constraints/migration phải thử upgrade DB cũ và compensation trên DB riêng; không reset dữ liệu thật.

## R19. Kiểm và sửa vé, admission và offline queue không mất dữ liệu

**Ưu tiên:** P0 nếu tái hiện. **Phụ thuộc:** R10. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: S-25–S-39 chưa nghiệm thu chức năng, Device/offline BLOCKED.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/tickets/`
- `apps/api/src/scanner/`
- `apps/api/src/orders/ticket-check-in.service.ts`
- `apps/web/src/features/scanner/`
- `apps/web/src/features/ticket-scanner/`

**Các bước thực hiện:**

1. Kiểm QR từng ghế, key rotation K1/K2, private key không vào client, owner-only và cancelled/unpaid không QR; transfer/reschedule/cancel giữ identity đúng.
2. Kiểm assignment suất/cửa, role change/session revoke, hai scan đồng thời đúng 1NORMAL, replay và exception cần reason/quyền; log đủ gate/time/staff.
3. Snapshot 5000 + delta 30 phút, không PII, scoped cursor. Offline verify signature/membership rồi persist IndexedDB trước xanh; reload offline, lỗi quota storage/no snapshot không được báo thành công.
4. Queue 40 scan qua reload/đóng mở, timeout sau commit, sync một phần, 401/403/409/5xx, đổi account; chỉ ack item bền mới xoá, không drop queue khi auth lỗi.
5. Hai máy offline cùng vé với upload đảo thứ tự và clock offset; áp AC S-36 hoặc override có duyệt D05. Báo cáo attendance/conflict giữ ledger, không nhân khách vì retry/exception.
6. Sửa theo repro và thêm regression tại lớp thích hợp; thiết bị camera/4G thật chưa có thì phần hardware BLOCKED riêng, vẫn hoàn thành logic/browser mô phỏng.

**Điều kiện hoàn tất:**

- INT-05/06/07/10/16 và quyền scanner có evidence, queue không mất và DB chống scan NORMAL trùng.
- Tách đúng logic mô phỏng đạt với camera/ánh nắng/4G thật chưa kiểm; không lấp blocker bằng PASS.

**Kiểm thử lại:** `INT-05`, `INT-06`, `INT-07`, `INT-10`, `INT-16`, `S-31-AC02`, `S-34-NFR`, `S-35-AC02`, `S-36-AC01`.

**Migration/quay lui:** Giữ key ring và queue schema migration tương thích; không clear IndexedDB/cấp key mới làm mất QR cũ để chữa lỗi.

## R20. Hoàn thiện phần vận hành, riêng tư và báo cáo theo lỗi tái hiện

**Ưu tiên:** P1/P2 theo finding. **Phụ thuộc:** R10. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: S-40–S-55 chưa chạy phần lớn, Off-host backup chưa chứng minh.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `apps/api/src/booking-access/`
- `apps/api/src/lifecycle/`
- `apps/api/src/monitoring/`
- `apps/api/scripts/sprint-backup.mjs`
- `deploy/install-daily-backup.ps1`
- `monitoring/`
- `apps/web/src/app/operations/page.tsx`

**Các bước thực hiện:**

1. Chạy waiting room FIFO/capacity/TTL, hold + order rate-limit account/IP/NAT/header fake, ticket limit tính cả paid/hold/pending đúng policy; sửa bypass route/atomic quota nếu tái hiện.
2. Chạy huỷ trước/sau/đúngcutoff, refund idempotent/UNKNOWN/failure/backoff/manual, huỷ suất batch/restart và release seats; policy dùng quyết định đã xác minh D06, không tự tạo mốc mới.
3. Đối chiếu financial/attendance/reconciliation/audit với query độc lập, không cộng trùng items/payments/refunds; CSV mock không gán là provider statement thật. R12 discount phải có regression báo cáo sau này.
4. Consent/version/reconfirm/withdrawal, erasure phê duyệt, thu hồi session/token và PII ở mọi outbox/recipient/cache; giữ transaction totals và không gửi tới user đã xoá.
5. Metrics/dashboards/alert firing + resolved, no PII labels. Backup test nightly schedule/retention 14/encryption + key recovery/restore DB mới và QR cũ; local drill khác off-host receipt.
6. Thay count hard-code 40/5544 bằng manifest trước backup và integrity thực; off-host đích/key thật chưa được cấp thì làm adapter/config/test receiver riêng, ghi phần external còn mở.

**Điều kiện hoàn tất:**

- Mỗi nhóm S40–55 có kết quả mới và lỗi thật được xử lý; policy/provenance rõ.
- Restore xác minh dữ liệu/key và app, telemetry không giả SENT/healthy; thiếu off-host/sandbox thật vẫn mở đúng blocker.

**Kiểm thử lại:** `INT-08`, `INT-09`, `INT-11`, `INT-17`, `S-40-AC01`, `S-41-AC01`, `S-42-AC01`, `S-55-AC01`.

**Migration/quay lui:** Không thay policy/consent/key thật, không restore đè main. Migration/privacy thao tác thử trên account giả.

## R21. Đóng kiểm UI/NFR và chuẩn bị nghiệm thu bên ngoài

**Ưu tiên:** P1. **Phụ thuộc:** R08, R12, R13, R14, R15, R17, R18, R19, R20. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: INT-15 BLOCKED, NFR sample 0, Staging/device/provider/off-host chưa chứng minh.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `docs/testing/AI_FULL_PROJECT_TEST_PLAN_20261022/PLAN.md`
- `apps/web/src/app/`
- `apps/api/scripts/verify-sse-load.mjs`
- `scripts/`
- `deploy/`
- `.github/workflows/`

**Các bước thực hiện:**

1. Mỗi feature vừa sửa phải browser-test ngay; bước này tổng hợp toàn 28 page ban đầu + page mới với desktop 1440×900/mobile 390×844/360×800 nếu công cụ hỗ trợ. Bị giới hạn viewport thì bổ sung runner được phép hoặc hướng dẫn manual có artifact, không ghi viewport giả.
2. Chạy NFR theo bảng kế hoạch gốc: import 2000 <5 s, query 2000 <200 ms, render<2 s, holdp95<300 ms, release<300 ms, catalogp95<500 ms/200 suất, status<100 ms, mail≤60 s, scan<500 ms/WAITING3 s, snapshot 5000 <10 s, SSE2000 trong 2 s, report≤60 s.
3. Ghi workload/samples/raw/p50/p95/max/errors và cold/warm; không nới ngưỡng khi fail. Chữa bottleneck đúng nguyên nhân, kiểm noN + 1, state consistency và memory cleanup.
4. Chuẩn bị checklist camera dưới nắng/4G thật/offline reopen, sandbox provider, staging CI/deploy/rollback và off-host backup. Có quyền/tài nguyên thì kiểm; thiếu thì ghi blocker, người phụ trách và thao tác cụ thể, không tự tạo tài khoản/tốn phí hoặc gửi thư thật.
5. DEC18 readback và CI exact revision là gate tích hợp riêng; không tự push/merge/deploy chỉ vì kế hoạch chứa task này. Hướng dẫn thực hiện sau khi được giao phạm vi từ người dùng.

**Điều kiện hoàn tất:**

- Có evidence UI/NFR đầy đủ cho phần local thực kiểm, phần external tách trạng thái.
- Không biến browser wrapper 200, SMTP accepted, 4G mô phỏng hoặc local restore thành nghiệm thu môi trường thật.

**Kiểm thử lại:** `INT-15`, `S-05-NFR`, `S-09-AC04`, `S-10-NFR`, `S-33-AC03`, `S-44-AC01`, `S-55-AC01`, `GOV-01`, `GOV-05`.

**Migration/quay lui:** Không chạy tải lớn trên app dùng chung. Thiếu external không chặn tiếp R22 local; giữ task mở đến khi đúng gate được chứng minh.

## R22. Chạy lại 404 case và các regression mới trên source cuối

**Ưu tiên:** P1. **Phụ thuộc:** R09, R12, R13, R14, R15, R17, R18, R19, R20. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: Toàn bộ 404 case baseline.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `docs/testing/AI_FULL_PROJECT_TEST_PLAN_20261022/test-cases.json`
- `evidence/ai-full-test/20261022T212910-ai/results.json`
- `apps/api/test/`
- `apps/web/`

**Các bước thực hiện:**

1. Khởi tạo kết quả lần mới giữ nguyên id/source/AC/NFR; thêm case con khi nhiều mệnh đề và case mới FIX-/GAP- riêng. Kết quả baseline read-only, không đổi expected cũ thành implementation.
2. Chạy lint/typecheck/build/unitAPI/unitweb/root deploy tests và E2Eguarded bằng runner mới; source fingerprint trước/sau. Root test dừng ở API không được suy web/deploy đã chạy.
3. Đánh lại toàn 404 case theo actual: PASS/FAIL/BLOCKED/MISSING/NEEDS_DECISION/NOT_RUN/N/A có lý do; 381 ca chưa chạy phải có kết quả hoặc blocker/prerequisite cụ thể, không giữ NOT_RUN hàng loạt khi báo hoàn tất.
4. Feature 5 gap phải có đủ UI/API/schema/migration/permissions/negative/concurrency/export/report evidence và case AC/NFR mới; route hiện diện không tự đủ Done.
5. Chạy lại money/seat/admission/offline/refund/PII regressions bị coupon/waitlist/analytics tác động; kiểm no-secret và dữ liệu trước/sau migration.
6. Tạo comparison baseline→new và reopen bug khi fail; không mark PASS case hardware/provider/staging chưa kiểm. Cứ lặp fix→targeted retest→affected regression cho lỗi còn trong quyền.

**Điều kiện hoàn tất:**

- 404/404 case được đối chiếu và có status/evidence mới hoặc blocker có trách nhiệm, không hiddenskip; thêm tests không làm thay tổng baseline.
- Local implementation chỉ hoàn tất khi không còn FAIL/MISSING/NOT_RUN trong phạm vi local đã chốt; acceptance toàn bộ còn gate bên ngoài được báo riêng.

**Kiểm thử lại:** `Tất cả404 case và regression mới`.

**Migration/quay lui:** Không ghi đè bằng chứng baseline, không dùng checkpoint source trước sửa làm proof source sau.

## R23. Bàn giao bản sửa và trạng thái nghiệm thu có thể kiểm chứng

**Ưu tiên:** P1. **Phụ thuộc:** R22. **Trạng thái kế hoạch:** PLANNED.

Nguồn cần giải quyết: Yêu cầu hoàn thiện và hướng dẫn chatbot.

**Tệp/vùng mã cần đọc trước khi sửa:**

- `README.md`
- `docs/LOCAL_USER_GUIDE.md`
- `docs/testing/`
- `evidence/ai-remediation/<new-run-id>/`

**Các bước thực hiện:**

1. Viết report final theo BUG-01/02, 12 unit failures, 5 gap, R00–R23 và 404 case: trước/sau, code/file thay đổi, migration, quyết định, số test/latency thật và evidence.
2. Cập nhật hướng dẫn khởi động/fixture/test/newfunctions, biến môi trường chỉ tên/ý nghĩa không value, API/contracts, quyền và giới hạn. Đính kèm PDF/CSV giả mẫu đã kiểm nếu feature export hoàn tất.
3. Tách IMPLEMENTED_LOCAL_VERIFIED, NEEDS_DECISION, NEEDS_EXTERNAL_VALIDATION và NOT_DONE. Công bố nội dung chưa đủ, không gộp “đã code” thành “đạt toàn bộ yêu cầu”.
4. Giữ migration/key/outbox/queue rollback runbook, dependency lock và data coverage của analytics; không auto commit/push/merge nếu chưa được giao.
5. Giao lại danh sách blocker chính xác và cách cung cấp tài nguyên còn thiếu; không dừng sớm trước khi hoàn tất mọi việc local độc lập đã được phép.

**Điều kiện hoàn tất:**

- Có bản sửa reviewable kèm kết quả, không chỉ plan hoặc báo test xanh; task chưa đủ điều kiện vẫn mở.
- Bàn giao rõ code đạt local, mục còn cần quyết định và nghiệm thu external, không tuyên bố toàn bộPASS giả.

**Kiểm thử lại:** `PRODUCT-GOAL`, `GOV-09`.

**Migration/quay lui:** Bàn giao tài liệu và code diff; thao tác external chỉ theo quyền được giao riêng.

## Phụ lục A. Sổ quyết định cần truy vết

Không phải mọi quyết định dưới đây đều chưa từng được duyệt: nhiệm vụ đầu tiên là tìm bằng chứng hiện có. Chỉ hỏi phần còn thiếu thật, không hỏi lại toàn bộ. Cột đề xuất phục vụ việc duyệt, không tự trở thành chính sách chính thức.

### D01 — Coupon pricing/quota

- Ảnh hưởng: R12.
- Baseline: S-56 phần trăm/tiền cố định, lượt dùng, hạn; stacking chưa chốt.
- Hướng xử lý/đề xuất: Đề xuất một mã/order; snapshot integerVND; reservation khi apply vào pending, consume khiPAID, release khiexpired/cancel theo policy. Chốt rounding, cap, 0 đồng, reservation release/refund trước code nghiệp vụ cuối.
- Phần có thể tiến hành: Owner APIs, validation, models, parametrized tests và UI review cụ thể.
- Trạng thái ban đầu: `NEEDS_VERIFICATION_OR_DECISION`.

### D02 — Waitlist notification và seat reservation

- Ảnh hưởng: R13.
- Baseline: S-59 FIFO email khi ghế về kho; giữ riêng cho người được báo chưa chốt.
- Hướng xử lý/đề xuất: Đề xuất notify-only, không tự tạo hold; chốt số người thông báo theo availability, re-notify/cooldown, failure overtaking. Nếu reserve thì cần TTL/quota tích hợp cơ chếhold.
- Phần có thể tiến hành: Entry/unique/scope/queue + outbox/catcher/UI và recovery event; không bật rule chưa chốt ngoài profile thử.
- Trạng thái ban đầu: `NEEDS_VERIFICATION_OR_DECISION`.

### D03 — Attendance CSV semantics và PII

- Ảnh hưởng: R15.
- Baseline: S-62 mã vé/ghế/giờ/cửa/cờ conflict; mức PII chưa chốt.
- Hướng xử lý/đề xuất: Dùng đúng trường tối thiểu không tên/email/phone. Ghi rõ mỗi dòng là admission hay vé hiệu lực, cách xuất exception/conflict và timezone; thêm PII chỉ khi được yêu cầu/chấp thuận.
- Phần có thể tiến hành: Minimal export không PII, encoder chuẩn, owner scope và UI; không để yêu cầuPII tùy chọn chặn cả tính năng.
- Trạng thái ban đầu: `MINIMAL_BASELINE_DEFINED_EXTRA_PII_UNAPPROVED`.

### D04 — Cohort và thời gian S-63

- Ảnh hưởng: R16, R17.
- Baseline: Đếm giữ/thànhđơn/hếthạn và avg/p90 từ giữ tới trả; chưa refine.
- Hướng xử lý/đề xuất: Tách firstHold→orderCreated và firstHold→confirmedPAID; nhãn đúng. Chốt attribution window/denominator, active/cancelled; đề xuất nearest-rankp90, null khi rỗng; dataAvailableFrom khi thiếu lịch sử.
- Phần có thể tiến hành: Provenance facts và oracle mẫu; triển khai query tham số, không suy lịch sử giả.
- Trạng thái ban đầu: `NEEDS_VERIFICATION_OR_DECISION`.

### D05 — Luật conflict offline

- Ảnh hưởng: R19.
- Baseline: S-36 ưu tiên giờ thiết bị sớm hơn, ghi offset.
- Hướng xử lý/đề xuất: Giữ baseline nếu chưa có override; nếu contract khác thì đưa hai luật và tác động để người có thẩm quyền chọn, không dùng thứ tự sync làm priority ngầm.
- Phần có thể tiến hành: Preserve cả 2 scan, offset/reports/replay tests và lưu bằng chứng luật hiện tại.
- Trạng thái ban đầu: `BASELINE_APPLIES_UNLESS_APPROVED_OVERRIDE`.

### D06 — Refund/cancel policy

- Ảnh hưởng: R18, R20, R12.
- Baseline: S-45/46/48 còn mở cutoff/rate/scope/reopen/UNKNOWN.
- Hướng xử lý/đề xuất: Truy vết phê duyệt contract local 24 h/100%/wholeorder/noadmission trước áp; không coi tài liệu đề xuất là duyệt. Bổ sung refund payable sau coupon và UNKNOWNmanualSLA.
- Phần có thể tiến hành: Lock/atomic/idempotent adapters, fixture policy giả công khai; không thay policy thật.
- Trạng thái ban đầu: `NEEDS_VERIFICATION_OR_DECISION`.

### D07 — Số lần retry và reminder thời điểm

- Ảnh hưởng: R06, R07.
- Baseline: S-27 tối đa 3 lần có cách hiểu; S-61 gửi 24 h trước suất.
- Hướng xử lý/đề xuất: Xác minh tổng 3 attempt hay 1 + 3 retry; chốt catch-up nếu tạođơn/mởworker trong 24 h, chống 2 scheduler, businessmail sauwithdrawal.
- Phần có thể tiến hành: Catcher, sender truthful, transport/backoff parametrized tests, worker flags.
- Trạng thái ban đầu: `NEEDS_VERIFICATION_OR_DECISION`.

### D08 — Quota/rate-limit/admission

- Ảnh hưởng: R18, R20.
- Baseline: S-40/41/42 ngưỡng và NAT/pending chưa refine.
- Hướng xử lý/đề xuất: Đọc contract/config hiện tại được duyệt, freeze profile test. Không tự nâng quota production để test race; chỉ nâng riêng fixture tránh nhiễu phép đo.
- Phần có thể tiến hành: Boundary tests, atomic limiter, header trust, scope và fact logs.
- Trạng thái ban đầu: `NEEDS_VERIFICATION_OR_DECISION`.

### D09 — Privacy/retention/backup/provider

- Ảnh hưởng: R20, R21.
- Baseline: S-53/54/55 cần nguồn chính sách, phạm vi và đích ngoài host/key; sandbox/provider/staging cần tài nguyên.
- Hướng xử lý/đề xuất: Chỉ kiểm kỹ thuật theo phạm vi được duyệt; không tự viết nội dung pháp lý/chuyểnPII/sendInternet/bậtpaidservice. Đíchoffhost + keyretention + schedule cần receipt.
- Phần có thể tiến hành: Syntheticdata/catcher/localrestore/minimalPII/adapters/receiver riêng và hướng dẫn thao tác reviewable.
- Trạng thái ban đầu: `NEEDS_EXTERNAL_INPUT_OR_APPROVAL`.

### D10 — DoD review/DEC-18

- Ảnh hưởng: R21, R23.
- Baseline: DoDgốc anothermember review; DEC18 approval record có nhưng enforcement chưareadback.
- Hướng xử lý/đề xuất: Localfix/test không phụ thuộcGitHubreadback. TrướcPR/merge nếu được giao phải kiểmexactrevision/requiredchecks/branchprotection và review thực, không giảhumanapproval.
- Phần có thể tiến hành: Reviewdiff/localtests/provenance; ghiBLOCKEDgate ngoài khi chưa có quyền.
- Trạng thái ban đầu: `EXTERNAL_ACCEPTANCE_GATE`.

## Phụ lục B. 23 case baseline đã được phân loại

381 case khác vẫn NOT_RUN, phải vào R10/R18/R19/R20/R21/R22 theo nhóm; không tự đổi chúng thành lỗi hoặc PASS. Mỗi 404 case có follow_up_tasks trong JSON.

| Case | Trạng thái baseline | Công việc theo dõi |
|---|---|---|
| S-01-AC01 | BLOCKED | R00, R01, R10, R21, R22, R23 |
| S-08-AC01 | BLOCKED | R00, R01, R10, R21, R22, R23 |
| S-59-AC01 | MISSING | R00, R11, R13, R22, R23 |
| S-59-NFR | MISSING | R00, R11, R13, R21, R22, R23 |
| S-56-AC01 | MISSING | R00, R11, R12, R22, R23 |
| S-56-NFR | MISSING | R00, R11, R12, R21, R22, R23 |
| S-60-AC01 | MISSING | R00, R14, R22, R23 |
| S-60-NFR | MISSING | R00, R14, R21, R22, R23 |
| S-62-AC01 | MISSING | R00, R15, R22, R23 |
| S-62-NFR | MISSING | R00, R15, R21, R22, R23 |
| S-63-AC01 | MISSING | R00, R11, R16, R17, R22, R23 |
| S-63-NFR | MISSING | R00, R11, R16, R17, R21, R22, R23 |
| GOV-01 | BLOCKED | R00, R01, R10, R21, R22, R23 |
| GOV-03 | BLOCKED | R00, R01, R10, R21, R22, R23 |
| GOV-05 | BLOCKED | R00, R01, R10, R21, R22, R23 |
| GOV-06 | BLOCKED | R00, R01, R10, R21, R22, R23 |
| INT-12 | MISSING | R00, R02, R03, R04, R05, R06, R07, R08, R09, R10, R20, R22, R23 |
| EXT-RESET-01 | MISSING | R00, R02, R03, R04, R05, R06, R07, R08, R09, R22, R23 |
| EXT-RESET-02 | MISSING | R00, R02, R03, R04, R05, R06, R07, R08, R09, R22, R23 |
| EXT-PUBLISH-01 | MISSING | R00, R02, R03, R04, R05, R06, R07, R08, R09, R10, R22, R23 |
| EXT-RESCHEDULE-01 | MISSING | R00, R02, R03, R04, R05, R06, R07, R08, R09, R10, R20, R22, R23 |
| EXT-MAIL-01 | MISSING | R00, R02, R03, R04, R05, R06, R07, R08, R09, R10, R19, R20, R22, R23 |
| INT-15 | BLOCKED | R00, R01, R10, R19, R21, R22, R23 |

## Phụ lục C. Kiểm tra độ đầy đủ bộ kế hoạch

- 24 gói công việc, 10 nhóm quyết định, mapping đủ 404/404 case baseline.
- 369 file trong scope fingerprint báo cáo đã đối chiếu: 0 đổi, 0 thiếu tại lúc tạo kế hoạch. Không suy rằng toànrepo ngoài scope cũng không đổi.
- Hash report/results/log nguồn và mapping baseline được lưu trong JSON, không ghi đè bằng chứng cũ.
- Tất cảwork item PLANNED; next_execution_status của 404 case làNOT_RUN. Không có thay đổi sản phẩm hay test sản phẩm được chạy trong lượt lập kế hoạch này.
