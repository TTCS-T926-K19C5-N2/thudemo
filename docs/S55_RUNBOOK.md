# S-55 — Sao lưu hằng ngày và diễn tập khôi phục

## Quyết định trong phạm vi S-55

* Kho ngoài máy chủ ứng dụng: bucket **S3-compatible private** (AWS S3, Cloudflare R2 hoặc tương đương), prefix mặc định `postgres/nightly`.
* Mã hóa: **AES-256-GCM phía client** trước khi upload. Mỗi bản có nonce ngẫu nhiên, authentication tag và SHA-256 của tệp đã mã hóa. Không có dump rõ trên đĩa runner: `pg_dump` được stream thẳng qua cipher.
* Lịch: `00:00 Asia/Ho_Chi_Minh` mỗi ngày (`0 17 * * *` UTC).
* Retention: sau khi upload + `head-object` xác minh thành công mới xóa remote cũ, giữ đúng 14 bản thành công gần nhất. Object không thuộc mẫu S-55 không bị đụng tới.
* PostgreSQL authority được backup; Redis/Valkey là cache/lock tạm thời và không thuộc backup durable.

## Cấu hình GitHub

Workflow: `.github/workflows/s55-backup.yml`. Repository/Environment cần:

| Loại | Tên | Nội dung |
|---|---|---|
| Secret | `S55_STAGING_DATABASE_URL` | External PostgreSQL URL có TLS verify; không đưa vào log/chat |
| Secret | `S55_ENCRYPTION_KEY_BASE64` | 32 byte ngẫu nhiên dạng base64: `openssl rand -base64 32` |
| Secret | `S55_S3_ACCESS_KEY_ID` | Credential chỉ được list/get/put/delete trong đúng prefix backup |
| Secret | `S55_S3_SECRET_ACCESS_KEY` | Secret tương ứng |
| Secret (tùy chọn) | `S55_S3_SESSION_TOKEN` | Chỉ khi dùng credential tạm |
| Variable | `S55_S3_BUCKET` | Tên bucket private |
| Variable | `S55_S3_PREFIX` | Mặc định `postgres/nightly` |
| Variable | `S55_S3_ENDPOINT` | Để trống với AWS; URL endpoint với R2/MinIO |
| Variable | `S55_AWS_REGION` | Region AWS hoặc `auto` với R2 |
| Variable | `S55_KEY_ID` | Tên phiên bản khóa, mặc định `primary`; không phải khóa |

Bucket phải chặn public access. Không cấp quyền xóa bucket hay truy cập prefix khác. Nếu PostgreSQL chặn IP động của GitHub-hosted runner, dùng runner riêng có egress IP cố định/đường mạng được duyệt; không mở DB `0.0.0.0/0`.

Workflow fail nếu thiếu cấu hình — không được báo xanh khi thực tế bỏ qua backup. Mỗi run gồm:

1. PostgreSQL 15 `pg_dump --format=custom` → AES-256-GCM stream.
2. `pg_restore --list` trên luồng giải mã để chứng minh archive đọc được trước upload.
3. Upload S3, kiểm size + metadata SHA-256, rồi giữ 14 object mới nhất.
4. Tải đúng object vừa tạo, xác thực GCM + SHA-256, restore lên PostgreSQL 15 tạm mới/rỗng bằng `--exit-on-error --no-owner --no-privileges`.
5. Chạy migration còn thiếu, build/boot API với DB đã restore và Redis tạm; `/health` phải trả `200` và `status: ok`.
6. Lưu evidence đã khử secret 14 ngày (`counts`, checksum encrypted, health), không lưu dump trong GitHub Artifact.

## Chạy backup thủ công

Docker phải chạy. URL và khóa chỉ nạp qua env; không đặt trong tham số CLI:

```powershell
$db = Read-Host 'Source DATABASE_URL' -AsSecureString
$key = Read-Host 'S55 encryption key base64' -AsSecureString
$env:S55_DATABASE_URL = [System.Net.NetworkCredential]::new('', $db).Password
$env:S55_ENCRYPTION_KEY_BASE64 = [System.Net.NetworkCredential]::new('', $key).Password

# Kiểm local, không upload:
node scripts/s55-backup.mjs --local-only --keep 14

# Upload S3: cấu hình AWS_* + S55_S3_BUCKET/PREFIX/ENDPOINT rồi bỏ --local-only.
node scripts/s55-backup.mjs --keep 14

Remove-Item Env:S55_DATABASE_URL, Env:S55_ENCRYPTION_KEY_BASE64
```

Tệp local nằm dưới `.s55-runtime/backups`, đã gitignore. Script không tạo dump plaintext.

## Khôi phục khẩn cấp hoặc drill thủ công

1. Tạo PostgreSQL **mới/rỗng**, cùng major 15. Không dùng DB ứng dụng hiện tại.
2. Xác nhận chính xác database đích qua ba guard bắt buộc. Với host ngoài local còn phải đặt `S55_RESTORE_ALLOWED_HOST` đúng hostname.
3. Restore bản mới nhất trên S3 (bỏ `--object-key`) hoặc object cụ thể:

```powershell
$target = Read-Host 'Temporary target DATABASE_URL' -AsSecureString
$key = Read-Host 'S55 encryption key base64' -AsSecureString
$env:S55_RESTORE_TARGET_URL = [System.Net.NetworkCredential]::new('', $target).Password
$env:S55_ENCRYPTION_KEY_BASE64 = [System.Net.NetworkCredential]::new('', $key).Password
$env:S55_RESTORE_ALLOWED_DATABASE = 'ten_database_tam_chinh_xac'
$env:S55_RESTORE_APPROVAL = 'RESTORE_S55_TO_EMPTY_TEMP_DATABASE'

node scripts/s55-restore.mjs
# Hoặc local: node scripts/s55-restore.mjs --file .s55-runtime/backups/<file>.dump.gcm

Remove-Item Env:S55_RESTORE_TARGET_URL, Env:S55_ENCRYPTION_KEY_BASE64
Remove-Item Env:S55_RESTORE_ALLOWED_DATABASE, Env:S55_RESTORE_APPROVAL
```

Script xác thực toàn bộ GCM **trước khi ghi**, từ chối DB đã có bảng, không dùng `--clean`, `drop`, `reset` hoặc `prisma db push`. Sau restore:

```powershell
$env:DATABASE_URL = '<URL database tạm lấy từ nơi bảo mật>'
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma migrate status
pnpm --filter api build
# Khởi động API với Redis tạm, rồi kiểm http://localhost:3001/health trả 200/status ok.
```

Kiểm thêm số lượng `users`, `orders`, `PAID orders`, `payments`, `sold seats` trong `.s55-runtime/restore-evidence.json`. Không công bố số liệu production trong PR/chat.

## Xoay khóa và xử lý lỗi

* Khi xoay khóa: giữ khóa cũ ở secret manager cho tới khi 14 bản dùng khóa cũ hết retention; đổi `S55_KEY_ID` cùng khóa mới. Metadata chỉ lưu key ID, không lưu khóa.
* Backup/upload/head thất bại: không xóa bản cũ, workflow đỏ và điều tra ngay.
* Restore/drill thất bại: không chạy lại vào cùng DB đã ghi một phần; bỏ đúng database tạm đó và tạo database tạm mới.
* Không sửa/xóa migration đã restore. Rollback schema bằng migration bù mới theo quy định repository.

## Điều kiện nghiệm thu

* Workflow nightly đã được bật với secret/variable thật và có ít nhất một scheduled run xanh.
* S3 có bản mã hóa ngoài app server; kiểm tra retention bằng 15 object fixture hoặc sau đủ chu kỳ phải còn đúng 14 bản gần nhất.
* Restore drill xanh: archive authenticated, PostgreSQL tạm được restore, migration up-to-date, API `/health` 200 với dữ liệu đó.
* Runbook này và tóm tắt trong `README.md` đã được operator review.

Code và drill local/CI không tự chứng minh scheduled run/storage production khi secrets và bucket thật chưa được cấp.
