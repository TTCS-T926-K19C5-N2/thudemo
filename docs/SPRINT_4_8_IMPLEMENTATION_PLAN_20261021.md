# Kế hoạch triển khai Sprint 4–8 bằng một chatbot

Ngày lập: 21/10/2026. Dự án: `D:\Merge_2\Codegym`.

Đọc cùng [báo cáo đối chiếu 31 story](SPRINT_4_8_GAP_ANALYSIS_20261021.md). Báo cáo giữ nguyên AC, NFR, SP, dependency và Sprint gốc từ CSV. Kế hoạch này đề xuất thứ tự làm kỹ thuật, không đổi các thuộc tính backlog gốc.

## 1. Kết luận khả thi

**Khả thi cho đồ án local và sandbox, triển khai từng lát chức năng. Không có đủ bằng chứng để cam kết cả 31 story đạt mọi AC/NFR trong vài giờ.**

Nhiều phần Sprint4–5 đã có; ưu tiên sửa và nghiệm thu chúng thay vì viết lại. Các phần mới về phòng chờ, hoàn tiền, đối soát, xoá dữ liệu cần model, migration, API, UI, phân quyền và test riêng. Chạy được một màn hình không chứng minh concurrency, idempotency, không mất queue hay khôi phục dữ liệu.

Trong khoảng **3–6 giờ đầu**, mục tiêu hợp lý là bảo vệ baseline, phân loại lỗi kiểm tra, làm ổn một luồng mua→trả mock→vé→quét online và, nếu còn thời gian, một luồng offline→sync. Đây là mục tiêu timebox có điều kiện, không hứa trước sẽ xử lý hết lỗi hiện tại. Mỗi giờ có bản ghi kết quả và phần chưa đạt. Nếu lỗi nền tảng vượt timebox, giảm phạm vi tính năng mới và tiếp tục sửa blocker; không báo Done giả.

Mock payment/refund dùng để kiểm logic nội bộ. Chỉ ghi “sandbox provider đạt” sau khi thực sự gọi môi trường thử của nhà cung cấp và có bằng chứng. Không dùng tiền thật. Không đổi SMTP đang hoạt động chỉ để chạy test; ưu tiên mail catcher riêng cho test.

## 2. Những gì phải giữ

- Giữ bộ40 sự kiện và dữ liệu ghế hiện tại, ảnh, giao diện public, trang chi tiết/sơ đồ ghế, đăng nhập/đăng ký/kích hoạt Gmail đã cập nhật. Chỉ sửa phần có lỗi hoặc thêm UI cần thiết trong design system hiện tại.
- Không copy nguyên dự án thudemo, không seed/import lại dữ liệu, không `prisma migrate reset`, `db push`, xoá volume, restore đè DB gốc, thay key QR đang dùng hoặc reset Git.
- Hai file test ticket đang có thay đổi sẵn là công việc hiện hữu: đọc và giữ; không ghi đè hoặc gọi là do chatbot mới tạo.
- Test tích hợp/fixture chạy DB riêng, namespace Redis riêng, SMTP catcher riêng; lệnh thay đổi DB thật phải nêu đích rõ. Không tạo tài khoản giả hoặc mail thật trong DB người dùng để nghiệm thu tự động.
- Đọc `AGENTS.md` và các file hướng dẫn tồn tại. AGENTS có dòng root “thudemo” cũ: root thực tế của kế hoạch này là Codegym. Nếu skill được yêu cầu nhưng không có, nêu phần ảnh hưởng và công cụ thay thế được phép; không tự đổi stack.
- Không commit/push/deploy/merge khi chưa được yêu cầu. Không log `.env`, password, session, token QR hoặc khoá riêng.

## 3. Nguyên tắc thực hiện nhanh

Một chatbot thực hiện tuần tự mỗi lát gồm contract→test→service→UI→nghiệm thu. Không mở nhiều nhánh sửa cùng schema. Tái sử dụng Auth/RBAC, Redis, outbox, adapter payment, scanner queue và component hiện có. Chỉ thêm model/module khi workflow cần. Không thêm package nếu có thể làm bằng dependency đang dùng.

Mỗi story có: AC đối chiếu, file thay đổi, migration nếu có, test tự động, browser evidence nếu có UI, hạn chế còn lại. State tiến độ đề xuất: Not started → In progress → Implemented → Verified local → Verified sandbox; Blocked có lý do cụ thể. Done chỉ khi tất cả AC/NFR tương ứng đạt, không dùng “đã có file” thay nghiệm thu.

## 4. Lộ trình và ước lượng

Các giờ dưới đây là **ước lượng thời gian thao tác nối tiếp của một chatbot với môi trường đã cài sẵn và người dùng cung cấp quyết định/credential khi cần**. Đây không phải benchmark tốc độ AI hay chuyển đổi99SP thành giờ. Không cộng ngầm thời gian chờ nhà cung cấp, phần cứng, phản hồi người dùng; cần đo lại sau vòng0/A/B.

|Wave|Phạm vi|Khoảng dự kiến|Điều kiện ra khỏi wave|
|---|---|---:|---|
|0|Snapshot, backup, test baseline, xác nhận app/data|0,5–1,5 giờ|Có rollback an toàn và lỗi được nhóm theo nguyên nhân|
|A|S25–32, S38–39: ổn định booking/QR/mail/staff/online|2–5 giờ|Một kịch bản mua→vé→soát và quyền truy cập có bằng chứng|
|B|S33–37: offline/snapshot/queue/sync/conflict|3–6 giờ|Reload offline không mất queue; sync idempotent; 2 cửa có báo conflict|
|C|S49 nền nhật ký; S41/S42; S43/S44|4–8 giờ|Audit đi cùng transaction, booking limiter/cap race test đạt, metrics/SSE có số đo|
|D|S40.A/.B/.C phòng chờ|3–6 giờ|FIFO+lease server enforced, UI hết lượt, test cạnh tranh|
|E|S45–48 và tích hợp lại S38/39/44/49/50|6–12 giờ|Huỷ/refund mock/retry/batch/release không trùng tiền hoặc ghế|
|F|S50–52: tài chính/đối soát/attendance|3–6 giờ|Fixture đối soát4nhóm, gross/refund/net, thống kê từng cửa/phút|
|G|S54/S53/S55: consent/erasure/backup|4–8 giờ|Consent/version, anonymize không mất tiền, restore DB tạm và runbook|
|H|Nghiệm thu hồi quy, sửa lỗi tích hợp, hướng dẫn demo|2–4 giờ|Test/build/lint/typecheck, browser và demo script có kết quả|

Tổng khoảng sơ bộ **27,5–56,5 giờ**, chưa gồm chờ bên ngoài; dành thêm khoảng25–35% cho lỗi phát sinh, tức khoảng **35–77 giờ** nếu làm đầy đủ scope demo đã đề xuất. Mức bất định cao nhất ở offline browser, cap trong DB routine và refund. Có thể nhanh hơn nếu chứng minh được nhiều AC hiện tại đã đạt; cũng có thể lâu hơn khi migration hoặc test bộc lộ lỗi thiết kế. Không coi mốc này là SLA.

### Vòng ưu tiên trong vài giờ đầu

1. 0–45phút: đọc hiện trạng, ghi SHA/dirty files, health, count40, backup; chạy baseline, lập nhóm lỗi. Không viết tính năng mới.
2. 45–150phút: sửa blocker đường mua vé/QR/mail/scanner online và test liên quan. Ưu tiên lỗi mất dữ liệu/quyền/nhân vé trước lỗi trình bày.
3. 150–240phút: chạy full kịch bản3ghế→mockPAID→mailcatcher→3QR→quét1vé→duplicate; account khác403; test đổi role/disable. Nếu còn blocker thì tiếp tục bước2.
4. 240–360phút: chỉ khi A ổn, làm một lát B tải trước→offline1vé→reload→online ACK→queue0. Kết thúc bằng manifest bằng chứng và phần chưa đạt. Không chen tất cả S40–55 vào vòng đầu.

S49 được làm nền sớm ở C để S45–48/S53 không phải viết lại audit. S55 backup baseline được làm ngay wave0, nhưng yêu cầu daily/offhost/retention/restore hoàn chỉnh vẫn thuộc G. Giữ mapping Sprint gốc trong báo cáo.

## 5. Công việc cụ thể từng wave

### Wave0 — bảo vệ dữ liệu và xác lập baseline

- Ghi `git status`, HEAD và hash các file sắp thay; lưu diff của working tree hiện hữu ở nơi riêng, không chứa `.env`.
- Đọc `.env` bằng danh sách tên biến và trạng thái present/ready, không in giá trị secret. Xác định process/root đang phục vụ3000/3001 và đúng `DATABASE_URL` target bằng cách che credential.
- Backup bằng `pg_dump` vào thư mục riêng có timestamp; ghi count event/showtime/seat và dữ liệu mẫu định danh không nhạy cảm; restore thử vào DB khác trước migration quan trọng. Backup file không đưa vào Git.
- Chạy riêng API/web unit, typecheck từng package, lint và build khi không ảnh hưởng server dev. Root typecheck hiện dừng trước web: phải chạy web riêng để biết trạng thái, không ghi root fail thành web pass.
- Phân loại56 unit failures hiện có: contract/spec lạc hậu; lỗi logic; cấu hình/mock; test thiếu coverage. Mỗi fix liên kết AC. Không skip/delete/nới assertion authorization để che lỗi.
- Đầu ra: `docs/SPRINT_4_8_PROGRESS.md` và `.cache/sprint4-8-evidence/<timestamp>/` chứa log đã che bí mật, môi trường/command/exit code.

### WaveA — hoàn thiện phần mua vé và quét online

**S25/S26:** xác định duy nhất canonical ticket projection/QR; kiểm những đường legacy của ScannerService có đang gọi hay không. Vé phát sinh trong transaction xác nhậnPAID, có unique/idempotency. Không đổi private key tuỳ tiện; rotation có key-id/public key cũ và thời gian giữ phù hợp vé còn hiệu lực.

**S27:** một outbox cho một đơn, đủ PNG; bật worker đúng chế độ local và quan sát lease/backoff. Có test concurrentworker, chết giữa send/ACK, resend giữ vé và owner403. SMTP không cho bảo đảm exactly-once physical delivery khi crash sau transport accepted; định nghĩa giới hạn và không hứa không thể trùng thư trong mọi tình huống. Mục tiêu1phút phải đo từPAID; transportaccepted khác inbox thực tế. Admin thấyFAILED để xử lý, không lộ nội dung secret.

**S28/S29:** dùng API người dùng hiện tại thay method cũ trong spec; xác minh quyền actor sống trên mỗi request. STAFF navigation/scanner destination, accountdisabled message liên hệadmin, rolechange audit. Chuẩn bị gate/showtime trong fixture DB riêng đúng ngày local; không sửa ngày cả40suất để làm test.

**S30/S31/S39:** camera browser/phone, màu/trạng thái/3giây, errorreason, DB unique normaladmission, race2cửa, override scoped permission. Thử vé sai suất/huỷ/mã lạ từfixture, không nói đã có refund vì có enumcancelled.

**S32/S38:** history pagination/403 và expired; tickets futurefirst, downloadPNG, revokedkhôngQR. Regression UI hiện tại desktop/mobile/keyboard/loading/error/empty. Kết quả chi tiết phải đáp ứng từng mục trong báo cáo audit.

### WaveB — offline tin cậy

**S33:** manifest snapshot chỉ chứa trường cần để verify, không tên/email; full/delta cursor gắn staff/showtime và expiry; atomic IndexedDB, tải lỗi không phá snapshot cũ. Benchmark5000vé có thiết bị/network/thời gian và kích thướcresponse; không dùng unit throughput thay4G.

**S34:** chia triển khai thành snapshot/key availability, verify+durable admission transaction, offline shell/reopen. Một queue chuẩn cho toàn bộ UI và sync; namespace device/user/showtime, có migration từ queue cũ không bỏ lượt quét. Browser mới chưa tải danh sách không được giả định có thể quétoffline.

**S35/S37:** batch40, UUID ổn định, payloadhash và serverreceipt; chỉ xoá/hoàn tất sauACK được kiểm chứng. Timeout/ACK thiếu/HTTP403 không được âm thầm drop lượt. Auth hết hạn→dừng, yêu cầu login rồi tiếp tục đúnguser. Networkbanner dựa requestAPI thật, counter từ durableDB; online nhưng sync chưa xong vẫn hiển thị trạng thái chờ.

**S36:** fixture2device/2gate, đảo thứ tự sync, timeequal/clockskew, retry và report. Lưu cả originaltime/receivedtime/offset; không ghi đè hoặc xoá nguồn rawlog. AC dùng giờ máy gốc nên không thể chứng minh “ai vào thật trước” khi đồng hồ sai; nêu giới hạn. Hai máy cùng offline có thể cùng bật xanh cho một vé; chỉ phát hiện xung đột sau sync, không hứa ngăn tuyệt đối offline cross-device.

### WaveC — nền an toàn và quan sát

**S49:** thêm domain audit theo entity/order, actor/time/from/to/correlationId; không nhét payload tuỳ ý chứaPII. Ghi atomic với state; hold trước khi có order được nối qua holdsession/correlation. Timeline truy cập theo owner/admin/role cần thiết. Rà đủ callsite release/expire/job/payment/ticket/scan. Audit append-only phù hợp việc xoáPII sau này bằng identifier và dữ liệu tối thiểu.

**S41:** Redis atomic budget account+IP ở hold và createorder; trả429 +Retry-After, route-specific config. Tính IP theo trustedproxy rõ ràng; không tin header client tự gửi. Ngưỡng chưa chốt chỉ là default demo quaenv, ghi `[ĐỀ XUẤT]`; test đổiIP/sharedNAT/TTL/retry/Redisdown.

**S42:** invariant cấpDB/transaction, serialise theo account+showtime; tránh checkthenact trước claim. Bao phủ held/unexpiredorder/paid theo lifecycle thực tế để không có gap hoặc doublecount. Rà routine claim SQL và khoá thứ tự nhất quán tránh deadlock; concurrencytest nhiều request ghế khác nhau của cùnguser.

**S43:** nối rejectedwebhook producer ở filter/service sau khi xác định reject đúng một lần; metric email/refund chỉavailable khi có producer. Local Prometheus/Grafana/Alertmanager và test receiver. Tạo lỗi có kiểm soát ở test, ghi firing/resolved; không mở `/metrics` công khai chứa dữ liệu nhạy cảm.

**S44:** SSE đã có chỉ localprocess; emission saucommit, reconnect/refetch snapshot, không broadcast seat held dựa write chưacommit. HếtTTL phải cập nhật≤2s thay vì phụ thuộc sweep60s. Dùng lịch event/refetch phù hợp, giữ DBTTL nguồnthật; nếu cầnđaAPI dùng RedisPubSub với reconnect. Benchmark2000client không làm đơ demo chính, chạy isolated và ghi cấu hình.

### WaveD — S40 phòng chờ

- **S40.A Backend:** config capacity/threshold/lease, FIFO Redis sortedqueue có sequence ổn định, member một lần, TTL, promote Lua atomic, signed admission gắn user/showtime. Không tin position từclient.
- **S40.B Enforcement:** API hold/createorder xác minh admission khi waitingroom bật; lease/renew/expire/requeue, retry không chiếm thêm slot, metric và cleanup/recovery. Chốt việc lease kết thúc ảnh hưởng hold/order đang hợp lệ như thế nào; không tự huỷ vé paid.
- **S40.C UI:** trang vị trí/estimatedwait nếu đo được, hết lượt và quaylại, offline/error/retry, tokenkhônglộURL. Có toggle local demo cấu hình và reset chỉ namespace test.
- Kiểm FIFO,refresh,manytabs,directAPIbypass,expiredlease,Redisrestart/timeout. Chỉ đánh dấu đủ sau loadtest riêng; ngưỡngdemo không phải cấu hình production.

### WaveE — S45–48 huỷ/hoàn tiền

1. **Refine trước khi code:** cutoff theo timezone/giờsuất, rate và phí, huỷ toànđơn hay từngvé, ticketđãcheckin cóđượchuỷ, release tự động hayduyệt, vai tròkếtoán, kếtquảprovider chưa rõ. Với demo có thể dùng profile cấu hình nhưng phải ghi đềxuất, chưa là chínhsách đã duyệt.
2. **Model:** CancellationPolicy versioned; CancellationRequest thamchiếu order/item; Refund có idempotency key, total/amount/state; RefundAttempt lease/retry/providerRef; batchjob checkpoint; audit/outbox. Additive migration, backfill không đổi giá orderitem snapshot. Tổng hoàn tích luỹ≤tiền đã trả và không refund cùngitem2lần.
3. **S45:** owner xem preview tiền/chính sách→confirm idempotent→state machine; thời điểm ticketrevoked và inventoryrelease rõ, refundpending tách refunded. Không đợi networkprovider bên trong transactionDB dài.
4. **S48:** worker gọi `refund`/`queryRefund` adapter, trạngthái UNKNOWN/TIMEOUT không retryblind; max3attempt increasingbackoff, manualqueue và querybeforemanualretry. Signature/callback/amount check và latecallback dùng transaction/idempotency.
5. **S46:** release inventory với fencing gắn booking/orderitem hiện tại; vécũ revoked vĩnhviễn; không update ghế của đơn mới bằng callbackhuỷ cũ. SSE và audit saucommit.
6. **S47:** freeze suất nguyên tử trước batch, chặn checkout race, hoàn100% từng đơn đúng snapshot; batch cursor resumable, tổngprogress, failurelist, mailoutbox. Suấtcancelled không tựmởbán khi ghếrelease.
7. **UI:** núthuỷ/preview/status trong đơn, organizercancelshow/progress, accountantfailures. Compose component hiện có; không redesign catalog.
8. **Test:** doubleclick/concurrentrequest, paycallback đến trong cancel, timeoutnhưngproviderđãrefund, webhooklặp/saiamount, workercrash, cancelshowrestart, mua lại ghế QRcũ bịchặn. Test qua mock trước, sandboxprovider sau khi có credential và APIrefund hỗtrợ.

### WaveF — báo cáo và đối soát

**S50:** chốt grosspaid/refunded/net thay một số revenue mơhồ; dùng giá category/price snapshot tại mua, status nhấtquán với refund. Sold/held/available bằng nguồnDB cùngasOf, refresh≤60s, owner403.

**S51:** không có `payment_events` chuẩn trong schemahiện tại; mapping/migration eventledger trước importer. Đềxuất CSVdemo `transactionId,amount,currency,status,occurredAt`; fixture có đủ4nhóm bắt buộc. Uniqueprovidertransaction, filehash/dedupe, validation từngdòng, dryrun/report; không sửa Payment để ép “khớp”. Export/report kếtoán đượcquyền, không render CSV formula injection. Refundstatement xử lý theo hợpđồng provider đãchọn, không tự trộn paid/refund.

**S52:** aggregate canonical NORMAL admissions thành entered/notentered/perminute/pergate; EXCEPTION là log bổsung không phải kháchunique mới. Offline dùng originalscannedAt với watermarkreceivedAt; múigiờ rõ, poll/asOf và conflict resolution cập nhật thốngkê không doublecount. Kiểm owner, gateassignment và sốvévalid saucancel.

### WaveG — quyền riêng tư và backup

**S54 trước S53:** policyversion+consenthistory, reconfirm ở lầnlogin tiếp theo, withdrawmarketing riêng; transactionalmail vé/kíchhoạt không bị thay bằng marketingflag. Nội dung pháp lý thật cần người có trách nhiệm cung cấp; localdemo ghi rõ mẫu. Không dùng thông báo giảdata cũ như bằng chứng chấp thuận production.

**S53:** ma trậnPII gồmUser/email/phone, transferemail/owneremail, activation/outbox, audit/exports/cache/log; request→approve→anonymize transaction/idempotent, revoke sessions và queuedmail, không xoá FK/order/payment hay doanhthu. Test tổngtiền/sốorder trước-sau. Backup sẽ giữ dữ liệu theo retention, ghi rõ phạmvi và quytrình khi restore để không hồi sinh account đãxoá; không camkết chuẩnpháplý từ demo.

**S55:** daily pgdump, checksum, mãhoá, log, retention14, đíchkhácmáyapp, credentials riêng, restoreisolated và smoke app. Nếu chỉ có ổD cùngmáy, ghi partial/offhost chưađạt; không đánh dấu fullDONE. RPO24h/RTO2h chỉ là mục tiêuđềxuất, chưa làACCSV. Runbook hướngdẫn lấybackup→verify→restorenewDB→migrationphùhợp→health/catalog/order/QRcheck→chuyểnđíchcóduyệt→rollback, bảo vệ QRkeys/sessionsecrets riêng theo quyền.

## 6. Các quyết định cần chốt và đường tiếp tục

|Quyết định|Đề xuất phục vụ demo, chưa duyệt|Có thể làm trước khi chốt|
|---|---|---|
|S40 capacity/lease/ngưỡng|Profile cấu hình env cho local, bật khi demo tải|Contract, Redisqueue test và UI scaffold|
|S41 quota/NAT và fail policy|Giới hạn route/account/IP riêng, documentdefault|Limiter atomic,429 contract và test|
|S42 account hay verifiedphone|Theoaccount như AC; phone là mởrộng cần quyếtđịnh|Sửa atomic accountcap|
|S45 cutoff/rate/partial/checkedin|Profilepolicy cấu hình cho DBtest; không gọi là policy chínhthức|Models, adaptermock và test state machine|
|S46 thờiđiểmrelease|Tách inventoryrelease khỏi kếtquảrefund, chốt trước bậtluồng|Test fence và QRrevocation|
|S48 providerrefund/sandbox|Mock triểnkhai trước, sandboxadapter khi được cấpAPI|Worker/state/unknownreconciliation|
|S51 địnhdạngsaokê|Fixture CSV chuẩn nội bộ chỉ cho demo|Importer4nhóm và report; adapterprovider sau|
|S53/S54 nội dung/retention|Mẫulocal được ghi nhãn, approval rõscope|Workflow kỹthuật/PIIinventory/unit test|
|S55 offhost/keys|Người dùng cấp đích lưu; không tự đăngký dịchvụ trảphí|Script/checksum/restoretest; offhost cònblocked|

Những story TierLater trong CSV đã ghi cần refinement. Chatbot phải phân biệt `[ĐÃ DUYỆT]`, `[ĐỀ XUẤT DEMO]`, `[CẦN CHỐT]`; hỏi gộp các quyết định thực sự chặn nghiệp vụ, tiếp tục phần không phụ thuộc. Không hỏi lại việc giữ UI/40sựkiện/auth đã chốt.

## 7. Definition of Done và bàn giao

- AC từngstory có testID→command→exitcode→artifact→kếtquả; NFR có phépđo riêng và môi trường. Không chỉ một ảnh hoặc buildPASS.
- Schema mới có migrationadditive và restore/migration test trênclone; giới hạnunique/locking/idempotency được thửconcurrency, không chỉmockunit.
- `pnpm --filter api test`, `pnpm --filter web test`, typechecktừngpackage, lint/build và e2e liênquan. Nếu lỗi baseline chưa sửa, ghi danh sách cụthể và ảnhhưởng; không tuyênbố wholeprojectgreen.
- Browser desktop/mobile: login/register vẫn hoạtđộng, catalog40, detail/seats, booking→mockpayment→order→QR→scan, offlinequeue, reports; console/runtime không có lỗi mới. Camera và ánhsáng testthiếtbịthật ghi riêng.
- Mỗi wave có checkpoint review diff, filechanged, backup/migrationrollback, story đủ/thiếu, cấuhình cần thêm chỉtênbiến. Không ghi secret vào tài liệu hoặc evidence.
- Đầura cuối: `SPRINT_4_8_PROGRESS.md`, `SPRINT_4_8_TEST_MATRIX.md`, `LOCAL_DEMO_RUNBOOK.md`, migrationnotes, issue cònmở. README lệnhchạy dùng đúngroot vàport đangcấu hình.
- Không gắn nhãn productionready hay sandboxready cho mock. Nếu không có offhost/benchmark/credential thì ghi rõ chưa đạtAC tương ứng.

## 8. Prompt bàn giao

Dùng nguyên văn [prompt cho chatbot triển khai](SPRINT_4_8_CHATBOT_PROMPT_EN.md). Lần đầu nên yêu cầu wave0+A, cho phép tiếp tục B khi đã đạt gate, và dừng báo cáo sau timebox3–6giờ. Các wave sau chạy tiếp theo progressartifact, không khởiđộng lại phân tích và không viết lại phần đangđúng.
