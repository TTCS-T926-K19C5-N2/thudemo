-- Keep the full set of confirmed seats even after expired claims are cleaned/reclaimed.
ALTER TABLE "hold_sessions"
  ADD COLUMN "expectedSeatIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

-- Existing sessions retain every claim still associated with their current token,
-- including expired records. Sessions with no recoverable claims remain empty
-- and cannot silently produce a partial order.
UPDATE "hold_sessions" AS hs
SET "expectedSeatIds" = ARRAY(
  SELECT h."seatId"
  FROM "seat_holds" AS h
  WHERE h."holdSessionId" = hs.id AND h.token = hs.token
  ORDER BY h."seatId"
);
