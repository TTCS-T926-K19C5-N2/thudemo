# R11 — Decision options for D01, D02 and D04

Run: `20261022T230000-remediation`. This is a review artifact, not an approval and not a change to the baseline requirements.

## D01 — S-56 coupon combination and monetary behavior

The backlog requires organizer-created fixed-amount or percentage codes with a usage limit and expiry, buyer entry at order review, correct totals, and a usage limit that holds under concurrency. It does not define stacking, rounding, zero-payable orders, or when a usage is consumed/released.

Illustrative existing order: subtotal 1,001 VND; 10% coupon.

- Percentage floor: discount 100, payable 901.
- Percentage half-up: discount 100, payable 901 for this example; use 1,005 VND to distinguish: floor gives 100, half-up gives 101.
- A fixed 1,500 VND discount against 1,000 VND subtotal must either clamp to 1,000 (payable 0) or reject as greater than subtotal.

Candidate API contract (fields shown are proposed):

```json
POST /orders/{orderId}/coupon
{ "code": "SPRING10" }
```

```json
{
  "subtotal": 1005,
  "discount": 101,
  "payable": 904,
  "currency": "VND",
  "coupon": { "code": "SPRING10", "type": "PERCENT", "value": 10 },
  "usage": "reserved"
}
```

Candidate persisted facts: coupon event, normalized code, type/value, max uses, expiry, active; per-order usage reservation/redemption; order snapshots `subtotal`, `discount`, `payable`, coupon terms. All amounts are integer VND and computed by the server. No client total is trusted. Provider initiation/webhook/refund/report use the payable snapshot.

Questions to approve:

1. Permit one coupon per order, or allow stacking? If stacking, should order of application be fixed/defined?
2. Percentage rounding: floor or nearest integer (half-up)?
3. Fixed discount above subtotal: clamp to zero payable, or reject? If payable is zero, should the order be confirmed without a gateway payment?

## D02 — S-59 waitlist dispatch and reservation

The backlog requires a sold-out showtime to expose waitlist registration and email subscribers in FIFO order when a seat returns. It does not say to reserve a seat. The implementation contract can enqueue a durable availability-cycle event when a cancellation/expiry releases a seat, claim eligible subscribers FIFO, and send through the existing outbox/SMTP catcher. A notification does not reserve capacity unless explicitly selected.

Candidate API/UI contract:

```json
POST /showtimes/{showtimeId}/waitlist
{ "join": true }
```

```json
{ "showtimeId": "…", "status": "SUBSCRIBED", "position": 4 }
```

Organizer and buyer views must not expose another subscriber's identity. Unsubscribe is available to the owner. Duplicate active registration is idempotent. Mail dispatch is recorded as queued/accepted/failed; accepted SMTP is not Inbox proof.

Question: notify FIFO and leave returned seats generally available, or reserve one seat for each notified subscriber? If reservation is desired, choose its duration before implementation; that path must reuse the existing hold token/quota/expiry mechanism.

## D04 — S-63 analytics cohort and duration

The backlog requires counts of holds, orders and expiries plus mean and p90 “from hold to pay.” The plan correctly requires distinguishing order-created from paid and counting one session once even when it holds several seats. Historical facts must start only where provenance exists.

Candidate query:

```text
GET /showtimes/{showtimeId}/reports/hold-conversion?from=...&to=...&timezone=Asia/Ho_Chi_Minh
```

Candidate response:

```json
{
  "cohort": { "basis": "SESSION_STARTED_AT", "from": "…", "to": "…" },
  "dataAvailableFrom": "…",
  "counts": { "started": 10, "orderCreated": 6, "paid": 4, "expired": 3, "active": 1 },
  "durationMs": { "holdToOrderMean": 12000, "holdToOrderP90": 18000, "holdToPaidMean": 45000, "holdToPaidP90": 60000 },
  "coverage": "COMPLETE_FROM_DATA_AVAILABLE_FROM"
}
```

Empty duration cohorts return `null`, not zero. Reports are organizer-scoped, include units/cutoff/coverage in UI, and contain no new PII.

Question: select the reporting cohort/window rule: (A) sessions started in `[from,to)` and outcomes observed up to `to`; (B) sessions started in `[from,to)` and outcomes attributed through a separate fixed follow-up window; or give the required attribution window. In either case, should mean/p90 report hold-to-order only, hold-to-paid only, or both? The API example exposes both until the product owner chooses the public contract.

## Existing evidence and unresolved decisions

- D03 minimal-fields CSV was approved in the user-provided remediation prompt and implemented without PII.
- D05 baseline follows S-36: earliest device timestamp wins and offset is retained.
- D06 S-45 has a separate explicit local/mock whole-order policy in `docs/S45_ANTIGRAVITY_IMPLEMENTATION_PROMPT_EN.md`; it does not resolve other cancellation/refund stories.
- D10 DEC-18 approval exists in `docs/REVIEW_POLICY.md` and `evidence/sprint1/20261017-review-policy/decision-18.md`; external GitHub enforcement/readback is not verified.
- The documented parent paths `D:\Merge_2\docs\decision-log.md` and `D:\Merge_2\approved-refinement.md` are absent. No canonical approval receipt was found for D01, D02 or D04.

## D01, D02, D04 — quyết định người dùng (2026-10-23)

- D01: một coupon/đơn; phần trăm làm tròn floor; discount tối đa bằng subtotal; đơn payable 0₫ được xác nhận không qua gateway.
- D02: waitlist FIFO chỉ gửi thông báo; không giữ ghế.
- D04: cohort A, session bắt đầu trong [from,to), outcomes tính đến to; báo cáo cả hold-to-order và hold-to-paid.


## D06/D12 — câu hỏi mới gửi người dùng (2026-10-23)

- D06: hỏi riêng việc nhả quota khi order hết hạn chưa trả và có khôi phục quota nếu đã paid rồi refund hay không.
- D12: hỏi discount đơn nhiều hạng vé lưu ở cấp đơn hay phân bổ theo tỷ trọng cho report/refund.
- Chưa có câu trả lời ở thời điểm checkpoint; không chọn policy thay người dùng.



## D17 — Payment gateway transport failure after local attempt commit

Isolated E2E observation: `POST /orders/{id}/pay` returns HTTP 500 after one `INITIATED` payment row commits. The order remains PENDING, its seat remains held/unsold, and no ticket is issued. A transport timeout does not reveal whether the provider accepted the request. Choose one: (A) keep INITIATED and block another charge until webhook/manual reconciliation; (B) mark FAILED and allow retry after any transport failure; (C) distinguish explicit provider rejection (FAILED/retry) from ambiguous transport outcome (hold retry and require reconciliation). Option B risks duplicate charge when a timeout occurs after provider acceptance.
