CREATE TABLE "check_in_gates" (
  "id" UUID PRIMARY KEY,
  "showtimeId" UUID NOT NULL REFERENCES "showtimes"("id") ON DELETE RESTRICT,
  "name" TEXT NOT NULL CHECK (length(btrim("name")) BETWEEN 1 AND 100),
  UNIQUE ("showtimeId", "name"), UNIQUE ("id", "showtimeId")
);
CREATE TABLE "check_in_permissions" (
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "gateId" UUID NOT NULL REFERENCES "check_in_gates"("id") ON DELETE RESTRICT,
  "staffName" TEXT NOT NULL CHECK ("staffName" !~ '^[[:space:]]*$' AND length("staffName") BETWEEN 1 AND 200),
  "canOverride" BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY ("userId", "gateId")
);
CREATE TABLE "ticket_admissions" (
  "id" UUID PRIMARY KEY,
  "ticketId" UUID NOT NULL REFERENCES "order_items"("id") ON DELETE RESTRICT,
  "showtimeId" UUID NOT NULL REFERENCES "showtimes"("id") ON DELETE RESTRICT,
  "gateId" UUID NOT NULL,
  "gateName" TEXT NOT NULL,
  "staffId" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "staffName" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('NORMAL', 'EXCEPTION')),
  "reason" TEXT,
  "ownerConfirmed" BOOLEAN NOT NULL DEFAULT FALSE,
  "enteredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY ("gateId", "showtimeId") REFERENCES "check_in_gates"("id", "showtimeId") ON DELETE RESTRICT,
  UNIQUE ("staffId", "requestId"),
  CHECK (("kind" = 'NORMAL' AND "reason" IS NULL AND "ownerConfirmed" = FALSE) OR
    ("kind" = 'EXCEPTION' AND "reason" IS NOT NULL AND "reason" !~ '^[[:space:]]*$'
      AND length("reason") BETWEEN 1 AND 500 AND "ownerConfirmed" = TRUE))
);
CREATE UNIQUE INDEX "ticket_admissions_one_normal" ON "ticket_admissions"("ticketId") WHERE "kind" = 'NORMAL';
CREATE INDEX "ticket_admissions_ticket_time" ON "ticket_admissions"("ticketId", "enteredAt");
