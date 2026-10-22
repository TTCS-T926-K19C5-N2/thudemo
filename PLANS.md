# Kế hoạch tích hợp candidate-1

## Quyết định đã chốt

- Sau B1, người dùng xác nhận phương án A và duyệt **chỉ Sprint 1–3 theo Deps**. Mỗi nhóm story phải pass build/lint/typecheck/test/E2E trước commit; dừng sau Sprint 1–3. Không tối ưu hiệu năng trong lượt này; chỉ chạy lại tải nếu story trực tiếp sửa luồng giữ ghế.
- Ở mốc B1, người dùng chọn **A**, chỉ cho phép kiểm chứng B1 và tối ưu SQL bằng migration forward mới trong đợt này. Dừng sau báo cáo; chưa được tích hợp Sprint 1–3.
- Giữ lineage candidate ngày 22/10: **v6 recovery → v5 quota/demo/audit → v4**, cùng chữ ký đầu vào và sáu trường trả về. Không đổi caller hoặc hợp đồng HTTP.
- Hai đường migration bắt buộc: DB trống và DB tái dựng 35 migration từ staging lịch sử `34deec00c18ac987a7db56e9d1c61abac2222bca`. Đây là DB fixture cô lập, không phải bản sao dữ liệu staging thật.
- Candidate cuối có **46 migration**: 42 gốc và bốn migration forward của hai thử nghiệm/bù. Cài mới **46/46 PASS**; nâng cấp **35→46 PASS**, không migration failed, chạy deploy lần hai không còn pending. Checksum fixture trước/sau `6f4867c8c5a8ab7d33fbc443e8220fbf`; recovery v6 giữ nguyên token và deadline gốc.
- Mọi phép đo tải giữ nguyên **200 request đồng thời / 100 ghế ×10 vòng**, hai API, pool 10 mỗi API, xác thực thật, PostgreSQL, ngưỡng **p95 <300 ms**. Không tăng pool/worker hoặc nới ngưỡng; không bỏ vòng đầu. Ghi cả p95 toàn bộ, steady và từng vòng.
- Baseline p95 **339,77 ms**; thử khóa hàng ghế **386,21 ms**; bù khóa **294,09 ms**; thử chỉ mục **344,00 ms**. Các phép đo này đều đúng ghế 10/10 vòng. Không kết luận cải thiện từ một lần pass nằm giữa nhiều lần fail.
- Khóa hàng ghế không được giữ: `202610220008_claim_seat_row_lock` được bù bởi `202610220009_restore_claim_lock_strategy`. Chỉ mục không được giữ: `202610220010_account_round_lookup_index` được bù bởi `202610220011_revert_account_round_lookup_index`. Giữ file đã áp dụng bất biến; trạng thái SQL cuối trở lại chiến lược khóa gốc, không có chỉ mục thử nghiệm.
- Lần đo sau bù chỉ mục có p95 **347,26 ms**, đúng ghế 10/10; phần restart worker bị build chạy chồng xóa `dist`, nên lần đó không được tính là harness pass toàn bộ. Giữ nguyên log và chạy lại sau các gate hồi quy.
- Lần xác nhận cuối hoàn tất42/42: p95 tổng **297.88 ms**, steady **236.47 ms**, nhưng vòng1 **381,36 ms** và vòng8 **301,52 ms**; kết quả tổng pass sát ngưỡng, độ ổn định chưa được chứng minh. Build/lint/typecheck,604 test và151 E2E PASS. Kết quả và các gate được ghi tại [báo cáo B1 A](docs/B1_A_VERIFICATION.md) và [STATUS](docs/STATUS.md). **Chưa chốt PASS hiệu năng hoặc DoD.**

### Migration donor bị loại khỏi tập tích hợp

Các file dưới đây vốn chưa có trong candidate. “Loại” nghĩa là **không nhập**, không xóa file ở thư mục nguồn:

| Tên chính xác | Lý do |
|---|---|
| `202610190002_account_hold_recovery/migration.sql` | Định nghĩa v5 recovery thuộc lineage 19/10; trùng tên/signature với v5 quota/demo/audit của candidate 22/10. |
| `202610190003_atomic_account_quota/migration.sql` | Định nghĩa v6 quota trả chín trường; xung đột v6 recovery sáu trường và phụ thuộc v5 donor cũ. |
| `202610190004_configurable_hold_ttl/migration.sql` | Phụ thuộc v6 donor cũ để tạo v7 và thay v1; không ghép vào lineage A. Phần TTL được forward-port qua migration mới202610220012 ở S-10, không nhập wrapper/caller donor. |

Không sửa hoặc loại bất kỳ migration gốc đã có của candidate. Không tự nâng cấp DB đã dùng lineage donor 19/10; nếu gặp phải dừng trình kế hoạch hòa giải riêng.

## Phần đang chờ

1. Sprint 1–3 đã hợp nhất local sau B1; đã dừng theo [sổ tích hợp](docs/SPRINT_1_3_INTEGRATION.md), rồi dừng. Sprint 4–5 và 6–8 vẫn chờ xác nhận riêng.
2. Khi được phép: theo Deps, Sprint 1–3 → dừng; Sprint 4–5 → dừng; Sprint 6–8 → dừng. Mỗi nhóm báo build/lint/typecheck/test/E2E thực chạy.
3. S-44 không chặn tiến độ: khi tới slice đó, dùng polling nếu đúng AC hoặc ghi không tích hợp; không tự thay API trong B1.
4. Review độc lập và xác nhận/nghiệm thu staging cần người thật. Local fixture/test không thay thế các gate này; `DoD_complete` vẫn false.

## Phạm vi an toàn

Chỉ ghi trong `D:\Development\03_Academic\thudemo-integration`, nhánh `integration/candidate-1`. Các nguồn `thudemo*` dưới workspace gốc chỉ đọc. Không push, đổi main/develop, reset/rewrite lịch sử, cài thư viện hoặc đọc/in `.env`. Các container/DB thử riêng giữ dữ liệu để đối chiếu; không đụng staging thật.
