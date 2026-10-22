CREATE TABLE scanner_snapshot_cursors (
  id UUID PRIMARY KEY,
  "showtimeId" UUID NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
  "staffId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  tickets JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL DEFAULT (clock_timestamp()+interval '4 hours')
);
CREATE INDEX scanner_snapshot_cursor_expiry ON scanner_snapshot_cursors("expiresAt");
