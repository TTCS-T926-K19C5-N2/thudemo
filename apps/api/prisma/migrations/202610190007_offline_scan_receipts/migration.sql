BEGIN;
ALTER TABLE offline_scan_logs
  ADD COLUMN "payloadHash" text,
  ADD COLUMN "receipt" jsonb,
  ADD COLUMN "mode" text,
  ADD COLUMN "deviceSentAt" timestamptz(3),
  ADD COLUMN "clockOffsetMs" double precision;
ALTER TABLE offline_scan_logs ADD CONSTRAINT offline_scan_mode_check
  CHECK ("mode" IS NULL OR "mode" IN ('offline_admission','online_confirmation'));
CREATE INDEX offline_scan_winner ON offline_scan_logs ("showtimeId", "ticketCode", "scannedAt", "scanId")
  WHERE status IN ('ACCEPTED','CONFLICT');
COMMIT;
