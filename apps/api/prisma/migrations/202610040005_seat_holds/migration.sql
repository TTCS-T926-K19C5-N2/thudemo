-- DEC-12: additive ownership authority. Existing migrations remain immutable.
CREATE UNIQUE INDEX "seats_id_showtimeId_key" ON "seats"("id", "showtimeId");
CREATE TABLE "hold_sessions" (
  "id" UUID PRIMARY KEY, "showtimeId" UUID NOT NULL,
  "userId" UUID NOT NULL, "sessionHash" TEXT NOT NULL,
  "token" UUID NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hold_sessions_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "showtimes"("id") ON DELETE RESTRICT,
  CONSTRAINT "hold_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "hold_sessions_showtimeId_userId_sessionHash_key" ON "hold_sessions"("showtimeId", "userId", "sessionHash");
CREATE UNIQUE INDEX "hold_sessions_id_showtimeId_key" ON "hold_sessions"("id", "showtimeId");
CREATE TABLE "seat_holds" (
  "seatId" UUID PRIMARY KEY, "showtimeId" UUID NOT NULL,
  "holdSessionId" UUID NOT NULL, "token" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seat_holds_seatId_showtimeId_fkey" FOREIGN KEY ("seatId", "showtimeId") REFERENCES "seats"("id", "showtimeId") ON DELETE RESTRICT,
  CONSTRAINT "seat_holds_holdSessionId_showtimeId_fkey" FOREIGN KEY ("holdSessionId", "showtimeId") REFERENCES "hold_sessions"("id", "showtimeId") ON DELETE RESTRICT
);
CREATE INDEX "seat_holds_expiresAt_seatId_idx" ON "seat_holds"("expiresAt", "seatId");
CREATE UNIQUE INDEX "seat_holds_seatId_showtimeId_key" ON "seat_holds"("seatId", "showtimeId");
CREATE INDEX "seat_holds_holdSessionId_token_idx" ON "seat_holds"("holdSessionId", "token");
