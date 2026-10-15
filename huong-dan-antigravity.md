# HƯỚNG DẪN XÂY DỰNG CHỨC NĂNG — WEB QUẢN LÝ SỰ KIỆN CÓ SƠ ĐỒ GHẾ NGỒI

> **Dành cho:** chatbot / agent trong Antigravity IDE.
> **Nguồn yêu cầu gốc:** file `ID.docx` gồm 4 user story **S-33, S-34, S-45, S-53**.
> **Nhiệm vụ:** bổ sung đúng và đủ 4 chức năng dưới đây vào **khung dự án đã có sẵn**. Không thêm chức năng ngoài phạm vi, không thay đổi những phần đã làm trước đó trừ khi file này yêu cầu.

---

## 0. Quy tắc làm việc (đọc trước khi viết code)

1. **Khảo sát codebase trước.** Trước khi sửa bất cứ thứ gì, hãy đọc: cấu trúc thư mục, tech stack, schema/migration CSDL, cách đặt tên, cách viết test, module phát hành vé & mã QR, module thanh toán, màn hình chọn suất của máy quét (S-29), module sơ đồ ghế và cơ chế giữ/khoá ghế. **Tuân theo tech stack và quy ước đang có**, không đổi framework, không refactor ngoài phạm vi.
2. **Tái sử dụng, đừng viết lại.** Nếu đã có sẵn thứ cần dùng (xác thực, phân quyền, component hiển thị kết quả quét, adapter thanh toán, hàm gửi mail…) thì dùng lại. Nếu thiếu thì bổ sung tối thiểu và nói rõ trong báo cáo.
3. **Làm tuần tự từng story:** `S-33 → S-34 → S-45 → S-53`. Mỗi story: (a) viết kế hoạch ngắn (file nào thêm/sửa, bảng/cột nào thêm, API nào), (b) cài đặt, (c) viết & chạy test, (d) báo cáo ngắn rồi mới sang story kế tiếp.
4. **Gặp điểm mơ hồ:** áp dụng *giả định mặc định* ở mục 8, ghi lại vào báo cáo, **không dừng lại hỏi** trừ khi quyết định đó có nguy cơ làm hỏng dữ liệu đang có.
5. **Migration:** chỉ thêm mới (bảng/cột/chỉ mục), không xoá hay đổi kiểu dữ liệu đang dùng, có thể rollback.
6. **Giao diện bằng tiếng Việt**, thông báo lỗi nói rõ nguyên nhân và cách xử lý. Thời gian lưu dạng UTC, hiển thị theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`).
7. **Không hard-code** các con số nghiệp vụ (30 phút, mốc huỷ vé, tỉ lệ hoàn…): đưa vào cấu hình/bảng cấu hình.
8. Tên đường dẫn API, tên bảng, tên cột trong file này chỉ là **gợi ý** — hãy đặt theo quy ước của dự án.

---

## 1. Phạm vi

| ID | Epic | Tóm tắt | Mức độ chi tiết yêu cầu |
|---|---|---|---|
| **S-33** | Vé điện tử và soát vé | Tải trước danh sách vé của suất diễn xuống máy quét | Đã rõ, có AC đầy đủ |
| **S-34** | Vé điện tử và soát vé | Soát vé ngoại tuyến bằng danh sách đã tải | Đã rõ, có AC đầy đủ |
| **S-45** | Huỷ vé và hoàn tiền | Khách huỷ vé trước hạn và được hoàn tiền theo chính sách | **Later**, chưa refine (~5 SP) → làm bản tối thiểu nhưng đúng hành vi |
| **S-53** | Vận hành và bảo vệ dữ liệu cá nhân | Khách yêu cầu xoá dữ liệu cá nhân (NĐ 13/2023/NĐ-CP) | **Later**, chưa refine (~5 SP) → làm bản tối thiểu nhưng đúng hành vi |

**Thuật ngữ**

- **Suất**: một suất diễn (showtime/session) của sự kiện.
- **Máy quét**: thiết bị của nhân viên soát vé chạy giao diện soát vé của web (trình duyệt/PWA trên điện thoại hoặc máy tính bảng, hoặc theo đúng cách khung dự án đang làm).
- **Đã vào**: vé đã được soát thành công (checked-in).
- **Cổng**: cổng thanh toán.
- **Vé hợp lệ**: vé đã thanh toán, chưa huỷ, thuộc suất đang xét.

---

## 2. Nguyên tắc xuyên suốt

- **Khoá riêng không bao giờ xuống máy quét.** Máy quét chỉ nhận khoá công khai.
- **Dữ liệu cá nhân tối thiểu trên thiết bị:** danh sách vé tải xuống máy quét **không chứa** họ tên, email, số điện thoại.
- **Một bộ mã kết quả quét duy nhất** dùng chung cho cả online và offline (ví dụ: `OK`, `INVALID_SIGNATURE`, `WRONG_SHOWTIME`, `NOT_IN_LIST`, `CANCELLED`, `ALREADY_CHECKED_IN`, `DUPLICATE_ON_DEVICE`, `NO_LIST_OFFLINE`), cùng một component hiển thị.
- **Idempotent:** các thao tác có thể bị gửi lặp (đồng bộ hàng đợi quét, gọi hoàn tiền, ẩn danh hoá) phải an toàn khi chạy lại.
- **Phân quyền ở server**, không chỉ ẩn nút ở giao diện: nhân viên soát vé chỉ lấy danh sách của suất được phân công; khách chỉ huỷ vé của chính mình; chỉ quản trị viên được duyệt yêu cầu xoá dữ liệu.
- **Ghi nhật ký (audit log)** cho thao tác nhạy cảm: tải danh sách, huỷ vé, hoàn tiền, duyệt/từ chối/thực thi xoá dữ liệu. Nhật ký **không** chứa dữ liệu cá nhân.

---

## 3. S-33 — Tải trước danh sách vé của suất xuống máy quét

### 3.1 Mục tiêu
> *Là nhân viên soát vé, tôi muốn máy quét có sẵn danh sách vé của suất để khi mất mạng vẫn biết vé nào hợp lệ.*

### 3.2 Tiêu chí chấp nhận (gốc)
| # | Giả sử | Khi | Thì |
|---|---|---|---|
| 1 | Đã chọn suất ở S-29 và đang có mạng | Bấm "tải danh sách" | Toàn bộ mã vé hợp lệ và trạng thái đã vào của suất được **lưu trên thiết bị** kèm **thời điểm tải** |
| 2 | Danh sách đã tải quá 30 phút | Còn mạng | Máy **tự tải lại phần thay đổi** |
| 3 | Suất có 5000 vé | Tải | **Xong dưới 10 giây** trên mạng 4G |

### 3.3 Yêu cầu chi tiết

**A. Giao diện (màn hình soát vé, sau khi chọn suất ở S-29)**
- Nút **"Tải danh sách"**.
- Khu vực trạng thái hiển thị: tên suất · số vé đã tải · thời điểm tải gần nhất · tình trạng (`Chưa tải` / `Đang tải…` / `Đã tải` / `Đã cũ — cần cập nhật` / `Lỗi`).
- Có tiến trình khi đang tải; khi mất mạng thì nút bị vô hiệu kèm dòng giải thích ngắn.
- Mỗi suất có một danh sách riêng; đổi suất thì hiển thị đúng trạng thái của suất đó.
- Nếu chưa có màn hình chọn suất (S-29) trong dự án, tạo bản tối thiểu (chọn suất được phân công) và ghi rõ trong báo cáo.

**B. Backend**
- Endpoint tải đầy đủ, ví dụ `GET /api/scanner/showtimes/{showtimeId}/tickets`.
- Cùng endpoint đó hỗ trợ tải **phần thay đổi**: `?since=<cursor>`.
- Dữ liệu trả về (gợi ý):

```json
{
  "showtimeId": "…",
  "generatedAt": "2026-10-08T03:00:00Z",
  "cursor": "…",
  "publicKey": { "keyId": "k1", "key": "…" },
  "tickets": [
    { "code": "…", "status": "valid|checked_in|cancelled", "checkedInAt": null, "seatLabel": "A-12", "ticketType": "VIP" }
  ]
}
```

- Tải đầy đủ: chỉ gồm **vé hợp lệ** kèm trạng thái đã vào.
- Tải thay đổi: gồm vé mới phát sinh, vé đổi trạng thái (đã vào) và **vé bị huỷ** (để máy quét cập nhật — liên quan S-45).
- `cursor` là mốc phiên bản/thời gian do server cấp, không dùng giờ của thiết bị.
- Nén phản hồi (gzip/brotli theo hạ tầng đang dùng). Chỉ gửi trường cần thiết (không có họ tên/email/SĐT).
- Kiểm tra quyền: người gọi phải là nhân viên soát vé được phân công cho sự kiện/suất đó, nếu không trả 403.
- Khoá công khai dùng để kiểm chữ ký QR được gửi kèm (xem S-34).

**C. Lưu trữ trên thiết bị**
- Lưu theo từng suất, gồm: danh sách vé (khoá tra cứu theo `code`), `downloadedAt`, `lastSyncAt`, `cursor`, `ticketCount`, `keyId` + khoá công khai.
- Dùng kho lưu trữ bền vững phù hợp nền tảng (với web: IndexedDB; không dùng localStorage cho danh sách lớn). Nếu khung dự án đã chọn cách lưu khác, theo khung dự án.
- **Ghi nguyên tử:** tải xong và kiểm tra đủ dữ liệu mới thay thế bản cũ; tải lỗi giữa chừng thì **giữ nguyên bản cũ**.

**D. Tự đồng bộ phần thay đổi**
- Hằng số cấu hình `SCANNER_LIST_STALE_MINUTES = 30`.
- Khi danh sách đã tải quá ngưỡng này **và còn mạng** → tự gọi tải phần thay đổi theo `cursor`, rồi gộp vào danh sách cục bộ.
- Kích hoạt: kiểm tra định kỳ (ví dụ mỗi phút) và khi thiết bị có mạng trở lại.
- Quy tắc gộp: thêm vé mới; cập nhật trạng thái; vé `cancelled` thì đánh dấu huỷ; **trạng thái "đã vào" ở cục bộ luôn thắng** (không bị ghi đè về "chưa vào" bởi dữ liệu server cũ hơn).
- Nếu trên máy còn hàng đợi quét ngoại tuyến chưa đẩy lên (S-34): **đẩy hàng đợi lên trước, rồi mới tải phần thay đổi**.
- Không chạy 2 lần đồng bộ chồng nhau. Thất bại thì giữ danh sách cũ, thử lại với giãn cách tăng dần, **không** hiện lỗi làm gián đoạn lúc đang quét (chỉ đổi chỉ báo trạng thái).

**E. Hiệu năng (AC #3)**
- Mục tiêu: suất 5000 vé tải xong **< 10 giây trên 4G**.
- Ngân sách gợi ý: mỗi vé ≲ 100 byte JSON → 5000 vé nén còn vài trăm KB; truy vấn server dùng chỉ mục (`showtime_id`, `updated_at`/cursor), không N+1; không tính toán nặng ở client khi tải (ghi hàng loạt trong một giao dịch).
- Tạo **dữ liệu mẫu 5000 vé** (và 20000 vé để kiểm tra dư địa) cho test hiệu năng; đo bằng giả lập mạng "Fast 4G" của trình duyệt và ghi kết quả đo vào báo cáo.

**F. Trường hợp biên**
- Bấm tải 2 lần liên tiếp → chỉ chạy một lần.
- Mất mạng giữa chừng → giữ bản cũ, báo lỗi có nút thử lại.
- Suất chưa có vé → tải thành công, hiển thị "0 vé".
- Phiên đăng nhập hết hạn → yêu cầu đăng nhập lại, không mất danh sách đã tải.
- Đổi suất → không lẫn dữ liệu giữa các suất.

### 3.4 Kiểm thử cần có
- Tải đầy đủ lưu đúng số vé, đúng trạng thái đã vào, có `downloadedAt`.
- Danh sách quá 30 phút + có mạng → tự gọi tải phần thay đổi; chưa quá 30 phút → không gọi.
- Tải phần thay đổi: vé mới, vé đã vào, vé huỷ đều được cập nhật; trạng thái đã vào cục bộ không bị ghi đè.
- Tải lỗi giữa chừng không làm mất bản cũ.
- Không có trường dữ liệu cá nhân trong phản hồi.
- Người không có quyền nhận 403.
- Đo hiệu năng với 5000 vé.

---

## 4. S-34 — Soát vé ngoại tuyến bằng danh sách đã tải

### 4.1 Mục tiêu
> *Là nhân viên soát vé, tôi muốn vẫn quét được vé khi khu vực cửa mất sóng để khách không phải chờ mạng.*

### 4.2 Tiêu chí chấp nhận (gốc)
| # | Giả sử | Khi | Thì |
|---|---|---|---|
| 1 | Máy mất mạng và đã có danh sách ở S-33 | Quét vé hợp lệ | Máy **kiểm chữ ký QR bằng khoá công khai**, **tra mã trong danh sách**, **báo xanh** và **ghi lần quét vào hàng đợi cục bộ** |
| 2 | Vé đã được đánh dấu đã vào trong danh sách tải về | Quét ngoại tuyến | **Báo đỏ** như khi có mạng |
| 3 | Cùng máy quét một vé hai lần khi mất mạng | Quét lần hai | **Bị từ chối** nhờ hàng đợi cục bộ |
| 4 | Máy chưa tải danh sách | Mất mạng | Màn hình **báo không soát được** và **hướng dẫn tải khi có mạng** |

### 4.3 Luồng xử lý một lần quét ngoại tuyến
Kiểm theo thứ tự, **dừng ở lỗi đầu tiên**:

1. **Chưa có danh sách của suất đang soát** → màn hình "Không soát được" kèm hướng dẫn: *"Hãy kết nối mạng và bấm 'Tải danh sách' trước khi vào cửa."* (AC #4)
2. Đọc QR và **kiểm chữ ký bằng khoá công khai đã lưu** → sai/thiếu chữ ký → **ĐỎ** `INVALID_SIGNATURE`.
3. QR không thuộc suất đang soát → **ĐỎ** `WRONG_SHOWTIME`.
4. Tra `code` trong danh sách cục bộ → không có → **ĐỎ** `NOT_IN_LIST` (kèm gợi ý "tải lại danh sách khi có mạng").
5. Trạng thái `cancelled` → **ĐỎ** `CANCELLED`.
6. Trạng thái `checked_in` trong danh sách tải về → **ĐỎ** `ALREADY_CHECKED_IN` (kèm giờ vào nếu có) — giống hệt khi có mạng. (AC #2)
7. Đã có trong hàng đợi cục bộ (đã quét offline trên máy này) → **ĐỎ** `DUPLICATE_ON_DEVICE`. (AC #3)
8. Hợp lệ → **XANH** `OK`, đồng thời **trong cùng một giao dịch cục bộ**: ghi bản ghi vào hàng đợi và đánh dấu vé là đã vào trong danh sách cục bộ. (AC #1)

### 4.4 Yêu cầu chi tiết

**A. Kiểm chữ ký QR**
- Dùng **đúng định dạng QR và thuật toán ký đang có** trong module phát hành vé của khung dự án.
- Chỉ khi dự án chưa có: ký bất đối xứng (Ed25519 hoặc ECDSA P-256) trên payload gồm mã vé + mã suất (+ `keyId`); khoá riêng chỉ nằm ở server (secret/biến môi trường); khoá công khai phát qua API của S-33 kèm `keyId` để sau này xoay khoá.
- Việc kiểm chữ ký phải chạy **hoàn toàn trên thiết bị, không cần mạng**.

**B. Hàng đợi quét cục bộ**
- Mỗi bản ghi (gợi ý): `scanId` (UUID sinh ở máy), `ticketCode`, `showtimeId`, `scannedAt` (giờ thiết bị), `deviceId`, `staffId`, `offline: true`, `syncStatus`.
- Lưu bền vững (sống sót khi tải lại trang/tắt app).
- Hiển thị số lần quét đang chờ đồng bộ ("n lần quét chờ đồng bộ").

**C. Đồng bộ hàng đợi khi có mạng** *(AC không nêu rõ, nhưng cần để hàng đợi có ý nghĩa — làm ở mức tối thiểu)*
- Khi có mạng: gửi hàng đợi lên server theo lô; server dùng `scanId` để chống ghi trùng.
- Server ghi nhận "đã vào" cho vé. Nếu vé đã được máy khác quét trước đó → **không lỗi, không ghi đè**: lưu một bản ghi quét trùng/xung đột để quản trị viên xem; người quét có thời điểm sớm nhất được tính là lần vào hợp lệ.
- Chỉ xoá khỏi hàng đợi sau khi server xác nhận; lỗi thì giữ lại và thử lại.
- Sau khi đẩy xong mới chạy tải phần thay đổi của S-33.

**D. Trải nghiệm quét**
- Màu **toàn màn hình**: xanh = cho vào, đỏ = từ chối, kèm lý do bằng chữ lớn; rung/âm thanh nếu thiết bị hỗ trợ.
- Có chỉ báo rõ **"Ngoại tuyến"** / **"Trực tuyến"**.
- Tra cứu theo khoá (`code`), **không duyệt tuyến tính** cả danh sách; phản hồi gần như tức thời sau khi giải mã QR (mục tiêu gợi ý < 300 ms).
- Sau mỗi lần quét tự sẵn sàng cho vé tiếp theo, không cần thao tác thêm.
- **Dùng chung** logic hiển thị và mã lý do với chế độ quét có mạng sẵn có; khi có mạng vẫn dùng luồng online hiện tại (server là nguồn xác nhận cuối).

### 4.5 Kiểm thử cần có
- Vé hợp lệ → xanh, có 1 bản ghi hàng đợi, vé được đánh dấu đã vào cục bộ.
- Vé đã vào trong danh sách tải về → đỏ, **không** thêm vào hàng đợi.
- Quét cùng vé lần 2 khi mất mạng → đỏ `DUPLICATE_ON_DEVICE`.
- Chưa có danh sách + mất mạng → màn hình "Không soát được" có hướng dẫn.
- QR sai chữ ký / sai suất / không có trong danh sách / vé đã huỷ → đỏ đúng lý do.
- Tắt/mở lại ứng dụng → hàng đợi và danh sách vẫn còn.
- Đồng bộ hàng đợi: gửi lặp không tạo bản ghi trùng; xung đột giữa 2 máy được ghi nhận.

---

## 5. S-45 — Khách huỷ vé trước hạn và được hoàn tiền theo chính sách

> **Tier Later, chưa refine chi tiết (~5 SP).** Hãy làm bản tối thiểu, đúng hành vi mô tả, thiết kế dễ mở rộng; không làm các tính năng nâng cao.

### 5.1 Mục tiêu
> *Là người mua vé, tôi muốn huỷ vé khi không đi được để lấy lại phần tiền theo quy định.*

### 5.2 Hành vi yêu cầu (gốc)
- **Huỷ trước mốc quy định** → vé chuyển sang **đã huỷ**; **lệnh hoàn theo tỉ lệ chính sách được gửi tới cổng**; khách **thấy số tiền sẽ nhận**.
- **Huỷ sau mốc** → **bị từ chối kèm lý do**.

### 5.3 Yêu cầu chi tiết

**A. Chính sách huỷ/hoàn (cấu hình, không hard-code)**
- Lưu theo sự kiện (hoặc suất), có mặc định chung. Gồm danh sách bậc: `{ hoursBeforeShowtime, refundPercent }` và quy tắc: không khớp bậc nào = **quá mốc, không được huỷ**.
- Ví dụ để seed dữ liệu thử (không phải yêu cầu nghiệp vụ): ≥ 72 giờ trước suất → hoàn 100%; ≥ 24 giờ → hoàn 50%; còn lại → không được huỷ.
- Mốc tính theo **giờ server** và giờ bắt đầu của suất.

**B. Giao diện khách (trang "Vé của tôi")**
- Mỗi vé hợp lệ có nút **"Huỷ vé"**.
- Hộp thoại xác nhận hiển thị: giá vé đã trả, tỉ lệ hoàn, **số tiền sẽ nhận**, hạn chót huỷ.
- Quá mốc → hiển thị lý do rõ ràng (ví dụ: *"Đã quá hạn huỷ vé. Hạn chót là hh:mm dd/mm/yyyy"*); nút có thể bị vô hiệu hoặc bấm vào thì nhận thông báo từ chối.
- Sau khi huỷ: vé hiện trạng thái **Đã huỷ**, hiện số tiền hoàn và trạng thái hoàn tiền (`Đang xử lý` / `Đã hoàn` / `Lỗi — sẽ thử lại`).

**C. Xử lý ở server (một giao dịch CSDL)**
1. Xác thực người gọi là **chủ vé/người mua**.
2. Kiểm tra vé: đang hợp lệ, **chưa đã vào**, chưa huỷ.
3. Tính hạn và tỉ lệ hoàn theo chính sách; quá mốc → từ chối kèm lý do.
4. Tính tiền hoàn bằng VND, số nguyên, **làm tròn xuống**, trên phần tiền của riêng vé đó (đơn nhiều vé thì huỷ **từng vé**).
5. Đổi vé sang `cancelled` (kèm `cancelledAt`).
6. Tạo bản ghi hoàn tiền: `ticketId`, `orderId`, `amount`, `percent`, `status` (`pending|succeeded|failed`), `idempotencyKey`, `gatewayRef`.
7. Gửi lệnh hoàn tới cổng; cập nhật trạng thái theo kết quả.

**D. Cổng thanh toán**
- Dùng adapter thanh toán sẵn có; nếu chưa có hàm hoàn tiền thì thêm vào adapter và làm kèm bản **mock/sandbox** để chạy thử.
- **Không bao giờ hoàn 2 lần** cho một vé (khoá bằng `idempotencyKey` + ràng buộc duy nhất).
- Cổng lỗi/chậm: vé vẫn ở trạng thái đã huỷ, bản ghi hoàn tiền ở `failed/pending` để **tự thử lại**; quản trị viên xem được danh sách hoàn tiền lỗi.
- Vé 0 đồng → không tạo lệnh hoàn.

**E. Liên đới với các phần khác**
- **Soát vé (S-33/S-34):** vé đã huỷ bị từ chối khi quét online; xuất hiện trong "phần thay đổi" của S-33 để máy quét offline cũng từ chối.
- **Sơ đồ ghế:** ghế của vé đã huỷ **được nhả về trạng thái trống** trên sơ đồ ghế (dùng cơ chế khoá/giữ ghế sẵn có, tránh bán trùng khi vừa nhả).
- **Báo cáo doanh thu:** huỷ vé tạo **giao dịch hoàn tiền riêng**, không xoá giao dịch gốc.

**F. Trường hợp biên**
- Vé đã vào → không cho huỷ.
- Vé đã huỷ → báo "Vé đã được huỷ trước đó".
- Bấm huỷ 2 lần / 2 tab song song → chỉ một lệnh hoàn được tạo.
- Người không phải chủ vé → 403.

### 5.4 Không làm (để tier sau)
Huỷ hàng loạt/huỷ cả sự kiện do ban tổ chức, hoàn tiền thủ công của quản trị viên, đổi vé, chính sách phức tạp theo hạng vé/khuyến mãi.

### 5.5 Kiểm thử cần có
- Huỷ trước mốc: vé → `cancelled`, tạo đúng 1 lệnh hoàn, số tiền đúng tỉ lệ & làm tròn, khách thấy số tiền.
- Huỷ sau mốc: bị từ chối, vé không đổi, có lý do.
- Vé đã vào / đã huỷ / không phải chủ vé → bị từ chối đúng.
- Gọi huỷ lặp → không hoàn trùng.
- Cổng lỗi → bản ghi hoàn tiền `failed`, được thử lại.
- Ghế được nhả; vé huỷ bị từ chối khi quét và có trong "phần thay đổi" của S-33.

---

## 6. S-53 — Khách yêu cầu xoá dữ liệu cá nhân

> **Tier Later, chưa refine chi tiết (~5 SP).** Làm bản tối thiểu, đúng hành vi mô tả.

### 6.1 Mục tiêu
> *Là người mua vé, tôi muốn yêu cầu xoá thông tin cá nhân của mình để thực hiện quyền theo Nghị định 13/2023/NĐ-CP.*

### 6.2 Hành vi yêu cầu (gốc)
Sau khi yêu cầu được **duyệt**:
- **Họ tên, email, số điện thoại** bị thay bằng **giá trị ẩn danh trong mọi bảng**.
- **Tài khoản không đăng nhập được nữa.**
- **Đơn hàng, giao dịch và số liệu doanh thu vẫn nguyên** để phục vụ kế toán.

### 6.3 Yêu cầu chi tiết

**A. Phía khách — gửi yêu cầu**
- Trang tài khoản/quyền riêng tư có nút **"Yêu cầu xoá dữ liệu cá nhân"**.
- Hộp thoại cảnh báo rõ: sẽ ẩn danh họ tên, email, SĐT; **không đăng nhập lại được**; đơn hàng và giao dịch vẫn được lưu để kế toán; **không hoàn tác**. Nếu còn vé của suất sắp diễn ra hoặc khoản hoàn tiền đang xử lý → cảnh báo thêm (không chặn).
- Xác nhận lại bằng mật khẩu (gợi ý).
- Trạng thái yêu cầu: `pending → approved → completed` hoặc `rejected` (và `failed` nếu thực thi lỗi). Mỗi khách chỉ có **một yêu cầu đang chờ** tại một thời điểm.

**B. Phía quản trị — duyệt**
- Màn hình danh sách yêu cầu, lọc theo trạng thái; xem chi tiết (tóm tắt số đơn, số vé sắp diễn ra).
- Nút **Duyệt** / **Từ chối** (từ chối bắt buộc nhập lý do). Lưu người duyệt và thời điểm.
- Chỉ quản trị viên có quyền thực hiện; kiểm tra quyền ở server.

**C. Thực thi ẩn danh hoá (sau khi duyệt, trong một giao dịch)**
1. **Khảo sát toàn bộ schema** để tìm mọi cột chứa dữ liệu cá nhân — không chỉ bảng người dùng mà cả bản sao trong đơn hàng, thông tin người nhận/người sở hữu vé, nhật ký gửi email/SMS, nhật ký soát vé, bản ghi hoàn tiền/thanh toán, nhật ký thao tác. Lập **một danh mục PII tập trung** (file cấu hình/hằng số) và để việc ẩn danh chạy theo danh mục này; kèm ghi chú ngắn cách bổ sung cột mới.
2. **Giá trị thay thế** phải hợp lệ với ràng buộc (NOT NULL, UNIQUE, định dạng email) và **không suy ngược được**:
   - Họ tên → `"Người dùng đã xoá"`.
   - Email → dạng `deleted-<mã ngẫu nhiên duy nhất>@anonymized.invalid` (không băm từ email gốc).
   - SĐT → `NULL` nếu cột cho phép, nếu bắt buộc thì chuỗi ẩn danh hợp lệ.
3. **Khoá tài khoản:** đánh dấu đã ẩn danh/vô hiệu, vô hiệu hoá mật khẩu & token, **thu hồi mọi phiên đăng nhập**, chức năng quên mật khẩu không hoạt động với tài khoản này.
4. **Giữ nguyên:** đơn hàng, giao dịch, hoàn tiền, số tiền, thời điểm, doanh thu và các khoá ngoại (đơn vẫn trỏ về bản ghi người dùng đã ẩn danh). **Không dùng DELETE vật lý** cho người dùng/đơn hàng.
5. **Idempotent:** chạy lại không lỗi, không đổi kết quả. Lỗi giữa chừng → rollback, trạng thái yêu cầu `failed`, quản trị viên xem được.
6. Ghi **audit log** (mã yêu cầu, người duyệt, thời điểm) — không chứa dữ liệu cá nhân.
7. *(Tuỳ chọn)* Gửi thông báo "yêu cầu đã được xử lý" tới email cũ **trước** khi ẩn danh.

**D. Liên đới**
- Danh sách vé trên máy quét (S-33) đã không chứa dữ liệu cá nhân nên không cần xử lý thêm.
- Bản ghi hoàn tiền (S-45) và báo cáo doanh thu giữ nguyên số tiền; chỉ các trường cá nhân bị ẩn danh.
- Bản sao lưu (backup) nằm ngoài phạm vi code — ghi chú vào báo cáo để người vận hành xử lý theo quy trình.

### 6.4 Không làm (để tier sau)
Tự động xoá không qua duyệt, xuất dữ liệu cá nhân cho khách, đếm thời hạn xử lý (SLA), xoá dữ liệu trong bản sao lưu.

### 6.5 Kiểm thử cần có
- Tạo người dùng có đủ dữ liệu (đơn, vé, hoàn tiền, nhật ký) → duyệt → **quét toàn bộ CSDL** tìm họ tên/email/SĐT gốc → **không còn**.
- Đăng nhập bằng thông tin cũ thất bại; phiên cũ bị thu hồi; quên mật khẩu không dùng được.
- **Tổng doanh thu, số đơn, số giao dịch trước và sau không đổi.**
- Từ chối yêu cầu → dữ liệu không đổi, có lý do.
- Chạy ẩn danh lần 2 → không lỗi.
- Không phải quản trị viên → không duyệt được.

---

## 7. Ảnh hưởng chéo giữa các story

| Thay đổi | Phải đảm bảo |
|---|---|
| S-33 → S-34 | Danh sách + khoá công khai + `keyId` do S-33 cấp là đầu vào duy nhất của quét ngoại tuyến |
| S-34 → S-33 | Hàng đợi quét được đẩy lên **trước** khi tải phần thay đổi; trạng thái "đã vào" cục bộ không bị ghi đè |
| S-45 → S-33/S-34 | Vé huỷ nằm trong phần thay đổi; quét online/offline đều đỏ `CANCELLED` |
| S-45 → sơ đồ ghế | Ghế vé huỷ được nhả về trống an toàn (không bán trùng) |
| S-53 → S-45 | Giao dịch hoàn tiền giữ nguyên số tiền; chỉ ẩn danh các trường cá nhân |
| S-53 → S-33 | Không đưa dữ liệu cá nhân vào danh sách máy quét |

---

## 8. Giả định mặc định (dùng khi yêu cầu chưa rõ — ghi vào báo cáo cuối)

1. Máy quét chạy giao diện web của chính dự án (trình duyệt/PWA); dùng IndexedDB cho dữ liệu cục bộ nếu khung dự án chưa chọn cách khác.
2. S-29 (chọn suất ở máy quét) đã tồn tại; nếu chưa thì làm bản tối thiểu.
3. Khi **offline**, vé có chữ ký hợp lệ nhưng **không có trong danh sách đã tải** → báo đỏ `NOT_IN_LIST` (có thể là vé mua sau lần tải gần nhất).
4. Xung đột quét giữa nhiều máy: lần quét có `scannedAt` sớm nhất thắng; các lần còn lại được lưu để quản trị viên xem.
5. Huỷ vé → **nhả ghế** về trạng thái trống.
6. Tỉ lệ hoàn tính trên **giá vé**; phí dịch vụ/phí cổng có hoàn hay không là cấu hình (mặc định: không hoàn phần phí).
7. Cổng hoàn tiền lỗi → vé **vẫn ở trạng thái đã huỷ**, hoàn tiền được thử lại tự động.
8. Yêu cầu xoá dữ liệu khi còn vé sắp diễn ra → **cảnh báo, không chặn**.
9. Các hằng số (30 phút, bậc chính sách huỷ, giá trị ẩn danh) nằm trong cấu hình.

---

## 9. Tiêu chí hoàn thành & báo cáo

**Một story chỉ được coi là xong khi:**
- [ ] Tất cả AC gốc của story hoạt động đúng (có test chứng minh).
- [ ] Migration chạy được trên CSDL hiện có và có thể rollback.
- [ ] Test mới và test cũ đều qua; build/lint không lỗi.
- [ ] Không làm hỏng chức năng sơ đồ ghế và các chức năng đã có.
- [ ] Giao diện tiếng Việt, xử lý đủ trường hợp biên đã liệt kê.
- [ ] Không có dữ liệu cá nhân trong danh sách máy quét và trong nhật ký.

**Báo cáo sau mỗi story (ngắn gọn):**
1. File đã thêm/sửa và migration đã thêm.
2. API/màn hình mới.
3. Cách chạy test và kết quả (với S-33: số liệu đo 5000 vé).
4. Giả định đã áp dụng (đối chiếu mục 8).
5. Việc còn lại hoặc rủi ro cần người thật quyết định.
