CREATE TABLE "ticket_mail_deliveries" (
  "id" UUID PRIMARY KEY,
  "orderId" UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "dedupeKey" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'QUEUED' CHECK ("status" IN ('QUEUED','SENDING','SENT','FAILED','CANCELLED')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 3),
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMPTZ(3),
  "leaseToken" UUID,
  "failureCode" TEXT,
  "sentAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ticket_mail_deliveries_status_nextAttemptAt_idx" ON "ticket_mail_deliveries"("status","nextAttemptAt");
CREATE INDEX "ticket_mail_deliveries_orderId_createdAt_idx" ON "ticket_mail_deliveries"("orderId","createdAt");
