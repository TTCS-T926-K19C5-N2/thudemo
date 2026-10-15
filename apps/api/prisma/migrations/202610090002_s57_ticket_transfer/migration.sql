-- S-57: add ownerEmail and transferredToEmail columns for ticket transfers
ALTER TABLE "tickets" ADD COLUMN "ownerEmail" TEXT,
ADD COLUMN "transferredToEmail" TEXT;

-- CreateTable
CREATE TABLE "ticket_logs" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" UUID,
    "detail" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_logs_ticketId_idx" ON "ticket_logs"("ticketId");

-- AddForeignKey
ALTER TABLE "ticket_logs" ADD CONSTRAINT "ticket_logs_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
