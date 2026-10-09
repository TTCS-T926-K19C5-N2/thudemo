# 📋 QUY ĐỊNH BÁO CÁO TIẾN ĐỘ HÀNG NGÀY (DAILY REPORT)
**Thành viên thực hiện:** Vũ Ngọc Sơn (DTC245160061)  
**Nhóm:** Khối 19 - Nhóm 2 (`TTCS_T926_K19C5_N2`)  
**Dự án:** Event Ticketing Platform (`thudemo`)

---

## 1. Nguyên Tắc & Mục Đích
1. **Tính kỷ luật hàng ngày**: Mỗi ngày nộp 1 bản báo cáo file Word (`.docx`) vào nhóm Zalo thực tập trước 22:00.
2. **Quy tắc tự động hóa dự phòng**: Nếu trong ngày công việc được giải quyết nhanh hoặc chưa có commit mới trên Git, hệ thống tự động sinh báo cáo tiến độ bám sát backlog Jira (Sprint 4, Sprint 5) để đảm bảo không bị gián đoạn chuỗi báo cáo.
3. **Phong cách viết**: Ngắn gọn, súc tích, phản ánh đúng kỹ thuật chuyên ngành CNTT (mã task Jira, tên hàm/service, giải thuật, kiểm thử).
4. **Không hình thức**: Không thêm tiêu ngữ trường viện, không kẻ bảng rườm rà, không thêm mục ký tên.

---

## 2. Định Dạng & Quy Chuẩn Đặt Tên File
- **Định dạng file**: Microsoft Word Document (`.docx`).
- **Quy tắc đặt tên file**:
  ```text
  baocaongayDD_MM_VuNgocSon_K19C5_N2.docx
  ```
  *(Ví dụ: `baocaongay10_10_VuNgocSon_K19C5_N2.docx`)*
- **Thư mục lưu trữ**: `C:\Users\zeecu\Downloads\` hoặc thư mục `reports/` trong dự án.

---

## 3. Cấu Trúc Nội Dung Báo Cáo (3 Mục Chuẩn)

```text
Họ và tên: Vũ Ngọc Sơn
Mã sinh viên: DTC245160061
Lớp: KHMT K23A
Khối / Nhóm: Khối 19 - Nhóm 2 (TTCS_T926_K19C5_N2)
Ngày báo cáo: DD/MM/YYYY

BÁO CÁO CÔNG VIỆC HẰNG NGÀY

Việc đã làm:
- [Mô tả chi tiết 2-3 đầu việc đã làm trong ngày, kèm mã task Jira SCRUM-xx / S-xx]
- [Trạng thái kiểm thử / tích hợp / đẩy code]

Kế hoạch hôm nay (hoặc ngày mai):
- [1-2 gạch đầu dòng công việc tiếp theo bám sát backlog]

3. Khó khăn:
- Không có (hoặc ghi nhận vướng mắc cần nhóm hỗ trợ)
```

---

## 4. Lộ Trình Công Việc Đã Chuẩn Bị Sẵn (10/10/2026 - 18/10/2026)
Toàn bộ 9 file báo cáo cho đợt Sprint 4 & Sprint 5 đã được sinh sẵn và lưu tại thư mục `Downloads` của máy:
* **10/10/2026**: Nghiên cứu và hiện thực hàm ký vé Ed25519 cho mã QR (S-26).
* **11/10/2026**: Cơ chế hỗ trợ đa phiên bản khóa công khai (key rotation) & chống giả mạo QR (S-26).
* **12/10/2026**: Hoàn thiện TicketSigningService, chạy 100% test Vitest và đẩy code S-26.
* **13/10/2026**: Thiết kế bảng OfflineScanRecord & lắng nghe trạng thái mạng cho máy quét (S-35).
* **14/10/2026**: Hiện thực API batch sync và cơ chế retry khi mạng chập chờn (S-35).
* **15/10/2026**: Thuật toán phát hiện xung đột soát vé 2 cửa khi đồng bộ (S-36).
* **16/10/2026**: Giao diện cảnh báo xung đột cửa soát vé và kịch bản test giả lập (S-36).
* **17/10/2026**: Kiểm thử E2E toàn bộ luồng quét offline - sync - xung đột và tài liệu vận hành.
* **18/10/2026**: Kiểm thử tổng thể trên staging, chuẩn bị tài liệu review Sprint.
