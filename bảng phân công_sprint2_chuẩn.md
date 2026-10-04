Có, cần tạo nhánh riêng — nhưng tạo theo từng task, không tạo một nhánh chung cho từng người và không để cả nhóm cùng code trên `sprint2`.

Mô hình nên dùng:

```text
main
├── task/T-11-seat-schema
├── task/T-12-seat-json-import
├── task/T-19-seat-status-query
├── task/T-22-seat-hold-storage
└── ...
```

Mỗi task tương ứng với:

- Một GitHub Issue.
- Một branch.
- Một hoặc vài commit.
- Một Pull Request.
- Một người viết code.
- Một người khác review.
- Chỉ được gộp khi test và CI đều đạt.

## 1. Phân công chi tiết

### Tô Văn Quyền — Nhập và kiểm tra sơ đồ ghế

Người review chính: Nông Anh Quân.

| Thứ tự | Issue | Branch | Chỉ bắt đầu khi | Kết quả cần bàn giao |
|---:|---|---|---|---|
| 1 | [T-11 #5](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/5) | `task/T-11-seat-schema` | T-09 đã nằm trên `main` | Migration bảng ghế và hạng ghế, unique/index, bằng chứng migration |
| 2 | [T-12 #6](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/6) | `task/T-12-seat-json-import` | T-11 đã merge | API nhập JSON 2.000 ghế trong một giao dịch |
| 3 | [T-13 #7](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/7) | `task/T-13-seat-json-validation` | T-12 đã merge | Bộ kiểm tra tệp và unit test từng loại lỗi |
| 4 | [T-14 #8](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/8) | `task/T-14-seat-upload-ui` | T-13 đã merge | Giao diện tải tệp, xem trước, hiển thị lỗi |

Quyền cần ưu tiên T-11 trước vì T-19 và T-15 của hai thành viên khác đều đang chờ task này.

### Nông Anh Quân — Mở bán và sự kiện công khai

Người review chính: Nguyễn Văn Sáng.

| Thứ tự | Issue | Branch | Chỉ bắt đầu khi | Kết quả cần bàn giao |
|---:|---|---|---|---|
| 1 | [T-15 #9](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/9) | `task/T-15-showtime-sale-status` | T-11 đã merge | Trạng thái suất và luật mở/đóng bán |
| 2 | [T-16 #10](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/10) | `task/T-16-sale-controls-ui` | T-15 đã merge | Nút mở/đóng bán và lý do không đủ điều kiện |
| 3 | [T-17 #11](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/11) | `task/T-17-public-showtimes-query` | T-15 đã merge | API công khai có phân trang và cache |
| 4 | [T-18 #12](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/12) | `task/T-18-public-events-ui` | T-17 đã merge | Trang danh sách và chi tiết sự kiện |

### Phạm Ngọc Sơn — Truy vấn, hiển thị sơ đồ ghế và Bỏ chọn ghế

Người review chính: Hà Quang Tiến.

| Thứ tự | Issue | Branch | Chỉ bắt đầu khi | Kết quả cần bàn giao |
|---:|---|---|---|---|
| 1 | [T-19 #13](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/13) | `task/T-19-seat-status-query` | T-11 đã merge | Một truy vấn trả toàn bộ trạng thái 2.000 ghế |
| 2 | [T-20 #14](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/14) | `task/T-20-seat-map-ui` | T-19 đã merge | Sơ đồ ghế responsive, có màu và ký hiệu |
| 3 | [T-21 #15](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/15) | `task/T-21-seat-map-performance` | T-20 đã merge | Tệp mẫu, script sinh dữ liệu và số đo dưới 2 giây |
| 4 | [T-25 #26](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/26) | `task/T-25-seat-release-api` | T-23 đã merge | API bỏ chọn ghế, phản hồi dưới 300ms, chỉ chủ giữ chỗ mới hủy được |
| 5 | [T-26 #27](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/27) | `task/T-26-seat-release-ui` | T-25 và T-20 đã merge | Thao tác bỏ chọn ghế trên sơ đồ, trả ghế về trạng thái trống ngay, ẩn đồng hồ khi bỏ ghế cuối |

Sơn cần thống nhất hợp đồng dữ liệu T-19 với Tiến trước khi Tiến làm T-22.

### Hà Quang Tiến — Giữ ghế và tự nhả ghế

Người review chính: Nguyễn Văn Sáng.

| Thứ tự | Issue | Branch | Chỉ bắt đầu khi | Kết quả cần bàn giao |
|---:|---|---|---|---|
| 1 | [T-22 #16](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/16) | `task/T-22-seat-hold-storage` | T-19 và K-01 hoàn thành | Cơ chế lưu giữ ghế theo kết luận K-01 |
| 2 | [T-23 #17](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/17) | `task/T-23-seat-hold-api` | T-22 đã merge | API giữ nhiều ghế trong một giao dịch |
| 3 | [T-24 #18](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/18) | `task/T-24-seat-hold-countdown` | T-23 đã merge | Đồng hồ dùng thời hạn do máy chủ trả về |
| 4 | [T-27 #19](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/19) | `task/T-27-seat-expiry-job` | T-22 đã merge | Job nhả ghế quá hạn, chạy lại không gây lỗi |
| 5 | [T-28 #20](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/20) | `task/T-28-expired-hold-query` | T-27 đã merge | Ghế quá hạn được tính là trống ngay |

T-22 chưa được tự chọn Redis hoặc PostgreSQL. Phải dựa trên kết quả K-01.

### Nguyễn Văn Sáng — Chống giữ trùng, Khôi phục phiên và tích hợp

Người review code của Sáng: Tô Văn Quyền. Sáng không tự duyệt code của mình.

| Thứ tự | Issue | Branch | Chỉ bắt đầu khi | Kết quả cần bàn giao |
|---:|---|---|---|---|
| 1 | [T-29 #21](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/21) | `task/T-29-atomic-seat-hold` | T-22 và K-01 hoàn thành | Chỉ một người giữ thành công cùng một ghế |
| 2 | [T-30 #22](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/22) | `task/T-30-seat-conflict-409` | T-29 đã merge | Trả 409 và danh sách ghế bị từ chối |
| 3 | [T-31 #23](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/23) | `task/T-31-concurrent-seat-test` | T-30 đã merge | 200 yêu cầu/100 ghế, đúng 100 thành công trong 10 lần |
| 4 | [T-32 #28](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/28) | `task/T-32-seat-hold-session-restore` | T-22 và T-29 đã merge | API trả về danh sách ghế đang giữ và thời hạn còn lại từ máy chủ |
| 5 | [T-33 #29](https://github.com/TTCS-T926-K19C5-N2/thudemo/issues/29) | `task/T-33-seat-hold-reload-ui` | T-32 và T-20 đã merge | Khôi phục giao diện sơ đồ ghế và đồng hồ đếm ngược khi reload/mở lại trình duyệt |

Ngoài năm task trên, nhiệm vụ chính của Sáng là gỡ blocker, tổ chức review và kiểm soát việc merge.

## 2. Thứ tự triển khai toàn nhóm

```text
T-11
├── T-12 → T-13 → T-14
├── T-19 → T-20 → T-21
│          ├─────────────── T-26 (cần T-25 & T-20)
│          ├─────────────── T-33 (cần T-32 & T-20)
│          └───────────────┐
└── T-15 → T-16 ───────────┤
       └→ T-17 → T-18 ─────┘

T-19 + K-01 → T-22
               ├→ T-23 → T-24 ──→ T-25 (Sơn)
               ├→ T-27 → T-28
               └→ T-29 → T-30 → T-31
                  └─────→ T-32 → T-33 (Sáng)
```

Không giao việc chỉ theo ngày. Hãy giao theo điều kiện: dependency đã merge thì task mới chuyển từ `Blocked` sang `Ready`.

## 3. Kế hoạch 5 ngày Sprint 2

### Trước ngày 05/10

Sáng phải hoàn thành:

- PR Sprint 1 cần thiết đã merge vào `main`.
- T-09 có trên `main`, vì T-11 phụ thuộc T-09.
- K-01 có kết luận kỹ thuật được review.
- `main` chạy xanh.
- Nhờ quản trị viên bật bảo vệ nhánh.
- Lấy GitHub username của Quyền, Quân, Sơn và Tiến; thêm họ vào repository rồi gán issue.

Hiện bốn thành viên chưa xuất hiện trong danh sách assignee GitHub nên mới chỉ được ghi tên trong nội dung issue.

### Ngày 05/10

- Quyền hoàn thành T-11 trước.
- Sau khi T-11 merge:
  - Quyền bắt đầu T-12.
  - Sơn bắt đầu T-19.
  - Quân bắt đầu T-15.
- Tiến và Sáng chưa tự viết T-22/T-29 nếu K-01 hoặc T-19 chưa xong.

### Ngày 06/10

- Quyền: T-12 → T-13.
- Quân: T-15 → T-16.
- Sơn: T-19 → T-20.
- Tiến: T-22 nếu đủ dependency.
- Sáng: review migration, hợp đồng API và gỡ xung đột.

### Ngày 07/10

- Quyền: T-14.
- Quân: T-17.
- Sơn: T-21.
- Tiến: T-23, T-27.
- Sáng: T-29, T-30.

### Ngày 08/10

- Quân: T-18.
- Tiến: T-24 và T-28.
- Sơn: T-25 (khi T-23 của Tiến đã merge).
- Sáng: T-31 và T-32 (khôi phục phiên giữ chỗ).
- Gộp và kiểm thử luồng nhập sơ đồ → mở bán → giữ ghế.

### Ngày 09/10

- Sơn: Hoàn thành T-26 (UI bỏ chọn ghế).
- Sáng: Hoàn thành T-33 (UI khôi phục phiên giữ chỗ).
- Quân: Hỗ trợ review, kiểm thử các màn hình công khai.
- Từ buổi chiều không nhận tính năng mới.
- Chỉ sửa lỗi tích hợp.
- Chạy toàn bộ test.
- Demo trên staging bằng dữ liệu giả.
- Ghi lại task chưa hoàn thành, không đánh Done giả để đủ kế hoạch.

## 4. Mỗi thành viên bắt đầu task như thế nào?

Mỗi người phải clone repository vào máy của mình. Không dùng chung một thư mục dự án qua USB, Drive hoặc máy của Sáng.

Ví dụ Quyền bắt đầu T-11:

```powershell
git switch main
git pull --ff-only origin main
git switch -c task/T-11-seat-schema
```

Sau khi viết code:

```powershell
git status
git add <cac-file-thuoc-T-11>
git commit -m "feat(T-11): add seat schema and migration"
git push -u origin task/T-11-seat-schema
```

Sau đó mở Pull Request từ `task/T-11-seat-schema` vào `main`.

Nếu `main` thay đổi trong lúc đang làm:

```powershell
git fetch origin
git merge origin/main
```

Nếu có conflict:

- Không bấm chọn “Accept all incoming/current”.
- Không xoá file của thành viên khác.
- Báo Sáng và người viết phần code bị conflict.
- Sau khi xử lý phải chạy lại test.

## 5. Quy tắc đặt commit

Dùng mẫu:

```text
feat(T-11): add seat schema and migration
fix(T-23): keep one expiry for all held seats
feat(T-25): add seat release endpoint
feat(T-32): restore held seats session for reload
test(T-31): add concurrent seat hold scenario
docs(T-21): record seat map performance evidence
```

Không dùng:

```text
update
fix bug
code moi
final
final lan 2
```

Một commit chỉ nên có một mục đích rõ ràng.

## 6. Mẫu Pull Request chung

## Task

Closes #<số issue>

Task ID: T-XX
Người thực hiện: <tên thành viên>
Người review: <tên người review>

## Thay đổi

-
-
-

## Dependency

- Task bắt buộc đã merge:
- Commit hoặc Pull Request liên quan:

## Acceptance Criteria

- [ ] AC 1:
- [ ] AC 2:
- [ ] AC 3:

## Bằng chứng kiểm thử

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] E2E liên quan
- [ ] Ảnh hoặc video đối với thay đổi giao diện
- [ ] Số đo hiệu năng hoặc đồng thời nếu task yêu cầu

## Database migration

- [ ] Không thay đổi database
- [ ] Hoặc đã kiểm tra migration tiến
- [ ] Đã kiểm tra migration bù
- [ ] Đã kiểm tra migration mới tái áp dụng
- [ ] Không dùng `prisma db push` hoặc reset database để thay bằng chứng migration

## An toàn

- [ ] Không commit `.env`
- [ ] Không có mật khẩu, token hoặc chuỗi kết nối trong code/log
- [ ] Đã kiểm tra quyền truy cập phía máy chủ
- [ ] Không đưa thay đổi ngoài phạm vi task vào PR

## Rủi ro và lưu ý cho reviewer

-

## 7. Điều kiện để được merge

Sáng chỉ merge khi đủ tất cả:

- Pull Request liên kết đúng issue bằng `Closes #...`.
- Dependency đã merge.
- Không có file ngoài phạm vi task.
- Không có secret hoặc `.env`.
- Reviewer không phải người viết code.
- Tất cả nhận xét review đã được xử lý.
- CI xanh:
  - `T-02 / build-and-typecheck`
  - `T-02 / lint`
  - `T-02 / test`
- Task giao diện có ảnh/video desktop và mobile.
- Task migration có bằng chứng migration tiến, migration bù và tái áp dụng.
- Task hiệu năng có kết quả đo, không chỉ nói “chạy nhanh”.
- Task đồng thời có kết quả đúng số lượng yêu cầu thành công.
- Branch đã cập nhật với `main`.

Nên chọn `Squash and merge`. Sau khi merge, xoá branch trên GitHub.

## 8. Có cần nhánh `sprint2` chung không?

Không khuyến nghị.

Nếu tạo một nhánh chung như `sprint2` và tất cả cùng đẩy code vào đó:

- Khó biết code thuộc task nào.
- Một người có thể làm hỏng code của cả nhóm.
- Khó review độc lập.
- CI xanh nhưng không biết task nào đạt.
- Cuối Sprint có một lần merge rất lớn và nhiều conflict.

Cách đúng là gộp từng task nhỏ vào `main` theo dependency. Khi task cuối cùng merge và toàn bộ test xanh, `main` chính là Sprint 2 hoàn chỉnh.

Không cần tạo thêm một “mega PR Sprint 2”.

## 9. Sáng quản lý hằng ngày như thế nào?

Mỗi sáng:

- Kiểm tra `main` có xanh không.
- Chuyển issue đủ dependency sang `Ready`.
- Mỗi người chỉ có một task `In progress`.
- Ghi rõ task nào đang `Blocked` và đang chờ ai.

Khoảng giữa ngày:

- Review các PR nền như T-11, T-19, T-22 trước.
- Không để PR chờ review quá nửa ngày.
- Kiểm tra người review đã xem code và bằng chứng, không chỉ bấm Approve.

Cuối ngày:

- Gộp các PR đạt điều kiện.
- Cập nhật lại các task vừa được mở khoá.
- Ghi một dòng trạng thái cho từng người.
- Kiểm tra task nào có nguy cơ trễ và điều chỉnh sớm.

Mẫu báo cáo cuối ngày:

```text
Ngày: 06/10/2026

Đã merge:
- T-11 #5
- T-19 #13

Đang review:
- T-12 #6
- T-15 #9

Đang làm:
- Quyền: T-13
- Quân: T-16
- Sơn: T-20
- Tiến: T-22
- Sáng: review T-22, chuẩn bị T-29

Blocked:
- T-29 chờ T-22
- T-25 chờ T-23
- T-32 chờ T-29

Rủi ro:
- K-01 chưa có bằng chứng đo staging
```
