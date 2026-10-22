# Local Demo Runbook

## Cập nhật 22/10/2026

- Dữ liệu chính giữ40 sự kiện/40 suất/5.544 ghế. Không chạy seed/reset/db push để khởi động lại.
- `.env` có `TICKET_MAIL_WORKER=true` theo chấp thuận gửi vé thật. Sau đổi SMTP cần khởi động lại API; `node --env-file=../../.env scripts/verify-smtp.mjs` trong `apps/api` kiểm kết nối mà không gửi thư thử. Email vé khác email kích hoạt.
- Huỷ/hoàn chỉ dùng mock: toàn đơn, trước giờ diễn ít nhất24h, chưa soát, hoàn100%. Ghế mở bán lại ngay. Chủ tổ chức huỷ suất theo lô ở `/operations`; ACCOUNTANT xem refund lỗi tại đây.
- Phòng chờ local: `WAITING_ROOM_CAPACITY=50`, lease120s. Vào sơ đồ ghế để lấy lượt; không gọi holds trực tiếp nhằm bỏ qua phòng chờ.
- `MONITORING_ENABLED=true`, exporter loopback9464 dùng tokenfile `.keys/metrics-token`; ADMIN xem chỉ số/cảnh báo local tại `/operations`. Không chia sẻ token.
- Người dùng mở `/account/privacy`; ADMIN xem yêu cầu xoá trước khi duyệt. Không thử xoá tài khoản thật trong buổi demo.
- Xem [kịch bản và kết quả mới nhất](SPRINT_4_8_TEST_SCENARIOS_20261022.md). Bài ghi dữ liệu dùng DBclone, worker mail thật tắt/catcher. Các bản backup diễn tập mã hoá dùng khóa tạm không dùng làm backup vận hành lâu dài.
- S-55: cung cấp `BACKUP_TARGET` là đích UNC/off-host, giữ `BACKUP_ENCRYPTION_KEY` an toàn, dùng `deploy/install-daily-backup.ps1` sau khi cấu hình. Lịch daily chưa được đăng ký vì chưa có đích lưu ngoài máy. Backup trước thay đổi: `.cache/sprint4-8-evidence/20261022/before-sprint-implementation.dump`.

---

**Target:** Local Academic Demonstration Sandbox  
**Workspace Root:** `D:\Merge_2\Codegym`  
**Web Port:** `http://localhost:3000`  
**API Port:** `http://localhost:3001` (Health: `http://localhost:3001/health`)

---

## 1. Startup & Environment Verification

### Prerequisites
- Node.js 24.x
- pnpm 10.x
- Docker running PostgreSQL (`thudemo-postgres-1` on port 5432) and Redis (`thudemo-redis-1` on port 6379)

### Running Services
From project root (`D:\Merge_2\Codegym`):
```bash
# Start background dev servers (Next.js web & NestJS api)
pnpm dev
```

To verify health:
```bash
# Check API health
curl http://localhost:3001/health
# Response: {"status":"ok","timestamp":"..."}

# Check Web health
curl -I http://localhost:3000
# Response: HTTP/1.1 200 OK
```

---

## 2. Demo Accounts (Redacted Credentials)

> [!NOTE]
> All passwords must meet minimum 8 characters with letters, numbers, and uppercase. In local environment, standard seeded test accounts exist for demonstration:

| Role | Email / Identifier | Purpose | Default Redirect |
|---|---|---|---|
| **ADMIN** | `admin@codegym.vn` (or seeded admin) | Create staff accounts, view reports, manage showtimes | `/admin` |
| **STAFF** | `staff@codegym.vn` | Select showtime and gate, scan tickets (online / offline) | `/scanner` |
| **CUSTOMER** | `customer@codegym.vn` | Browse 40 events, select seats, mock pay, view MyTickets, view Order History | `/` / `/my-tickets` / `/orders` |

---

## 3. Mock Scenarios & Workflows

### Scenario A: Ticket Purchase to Online QR Check-in (Wave A)
1. **Browse & Select**: Customer navigates to `http://localhost:3000`, chooses an event from the 40 preserved events, selects showtime and seats.
2. **Hold & Checkout**: Seats held in Redis/DB; checkout proceeds to local Mock Payment adapter.
3. **Payment Confirmation**: On mock payment success, `TicketsService.issueForPaidOrder` executes inside the transaction to issue unique signed QR codes.
4. **View MyTickets**: Customer views upcoming tickets at `/my-tickets`; downloads QR PNG.
5. **Staff Check-in**:
   - Staff logs in, gets redirected to `/scanner`.
   - Staff selects today's showtime and assigned gate.
   - Staff scans QR:
     - First scan: **Green screen**, displays seat label (e.g. `A-1`), ticket type, admission logged.
     - Second scan of same ticket: **Red screen**, shows error stating already admitted with previous time and gate.

### Scenario B: Offline Scanner & Sync (Wave B)
1. Staff selects showtime and downloads ticket manifest snapshot.
2. Network disconnected / simulated offline.
3. Offline scans recorded in durable browser IndexedDB.
4. Yellow/orange offline banner appears showing count of un-synchronized scans.
5. Network reconnected -> Auto sync in batches of 40; acknowledgment verified; counter returns to 0 and banner disappears.
6. If a ticket was scanned at two gates while offline: sync flags a conflict, preserving original device timestamps without silent overwrite.

---

## 4. Backup & Restoration Procedure

### Creating a Baseline Backup
```bash
docker exec thudemo-postgres-1 pg_dump -U codegym_local -d codegym_local --clean --if-exists > .cache/sprint4-8-evidence/<timestamp>/backup.sql
```

### Restoring into an Isolated Test Database
```bash
# 1. Create isolated verification database
docker exec thudemo-postgres-1 psql -U postgres -d postgres -c "CREATE DATABASE codegym_verify OWNER codegym_local;"

# 2. Restore dump into isolated database
Get-Content .cache/sprint4-8-evidence/<timestamp>/backup.sql | docker exec -i thudemo-postgres-1 psql -U codegym_local -d codegym_verify

# 3. Verify counts
docker exec thudemo-postgres-1 psql -U codegym_local -d codegym_verify -c "SELECT COUNT(*) FROM events;"
# Expected: 40
```

> [!CAUTION]
> Never restore a backup directly over `codegym_local` or run `prisma migrate reset` on the primary database, as that would destroy preserved event, seat, and user state.

---

## 5. Known Limitations

- **Mock Payment Adapter**: Simulates instant successful/failed payments for local academic demonstration. Real sandbox provider (e.g. VNPay/MoMo/Stripe) integration requires live merchant sandbox credentials.
- **Offline Concurrent Admissions**: Two offline scanning devices with disconnected networks cannot physically synchronize in real time; each may grant entry locally. Cross-device duplicates are flagged as conflicts immediately upon server reconnection and batch sync.
- **Off-host Backup**: Daily backup is generated locally on disk; true off-host disaster recovery requires cloud storage (e.g. AWS S3 / GCP GCS) credentials not configured in local environment.
