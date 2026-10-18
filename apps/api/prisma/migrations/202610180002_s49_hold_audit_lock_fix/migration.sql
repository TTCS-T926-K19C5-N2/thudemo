-- Hold audit is written from seat_holds row triggers while claim/order flows
-- may already hold the referenced showtime/session rows. Keep IDs as historical
-- references, but avoid FK key-share locks in this hot path.
ALTER TABLE "hold_logs"
  DROP CONSTRAINT "hold_logs_showtimeId_fkey",
  DROP CONSTRAINT "hold_logs_holdSessionId_fkey",
  DROP CONSTRAINT "hold_logs_actorId_fkey";

DROP INDEX "hold_logs_showtimeId_createdAt_idx";
CREATE INDEX "hold_logs_holdSessionId_createdAt_idx"
  ON "hold_logs"("holdSessionId", "createdAt");
